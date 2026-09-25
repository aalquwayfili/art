const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const FPS = 60;
const PERIOD = 24;
const STEPS_PER_SUBMIT = 60;
const SHADOW_SIZE = 192;

function settings(quality) {
  const low = quality === 'low';
  return { count: low ? 65536 : 262144, res: low ? [480, 270] : [640, 360] };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

async function main() {
  const adapter = navigator.gpu && await navigator.gpu.requestAdapter();
  if (!adapter) { document.getElementById('note').style.display = 'grid'; return; }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const module = device.createShaderModule({ code: await fetch('shader.wgsl').then(r => r.text()) });
  for (const m of (await module.getCompilationInfo()).messages) console[m.type === 'error' ? 'error' : 'warn'](`shader.wgsl:${m.lineNum}: ${m.message}`);

  let quality = query.get('quality') || (isSoftware(adapter) ? 'low' : 'default');
  let scene = createScene(device, module, format, settings(quality));

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  addEventListener('resize', resize);

  if (fixedTime !== null) {
    const steps = Math.round(fixedTime * FPS);
    for (let s = 0; s < steps; s += STEPS_PER_SUBMIT) scene.advance(Math.min(STEPS_PER_SUBMIT, steps - s));
    scene.draw(context);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let frame = 0, slowFrames = 0, last = performance.now();
  const loop = now => {
    const dt = now - last;
    last = now;
    if (quality !== 'low' && frame > 30 && frame < 150 && dt > 45 && ++slowFrames > 40) {
      quality = 'low';
      scene.destroy();
      scene = createScene(device, module, format, settings(quality));
      frame = 0;
    }
    scene.advance(1);
    scene.draw(context);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createScene(device, module, format, cfg) {
  const { count, res } = cfg;
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage) => device.createBuffer({ size, usage });

  const paramBuf = buffer(16, UNIFORM);
  const stepBuf = buffer(256 * STEPS_PER_SUBMIT, UNIFORM);
  const viewBuf = buffer(16, UNIFORM);
  const grains = buffer(count * 80, STORAGE);
  const image = buffer(res[0] * res[1] * 4, STORAGE);
  const shadow = buffer(SHADOW_SIZE * SHADOW_SIZE * 4, STORAGE);
  const all = [paramBuf, stepBuf, viewBuf, grains, image, shadow];

  const paramData = new ArrayBuffer(16);
  new Uint32Array(paramData, 0, 1).set([count]);
  new Float32Array(paramData, 4, 3).set([1 / FPS, ...res]);
  device.queue.writeBuffer(paramBuf, 0, paramData);

  const simLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const simPipeLayout = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
  const initPipe = device.createComputePipeline({ layout: simPipeLayout, compute: { module, entryPoint: 'init' } });
  const stepPipe = device.createComputePipeline({ layout: simPipeLayout, compute: { module, entryPoint: 'advect' } });
  const splatPipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'splat' } });
  const renderPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });

  const entries = list => list.map((resource, binding) => ({ binding, resource }));
  const simBind = device.createBindGroup({
    layout: simLayout,
    entries: entries([{ buffer: paramBuf }, { buffer: stepBuf, size: 4 }, { buffer: grains }]),
  });
  const splatBind = device.createBindGroup({
    layout: splatPipe.getBindGroupLayout(0),
    entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, { buffer: grains }, { buffer: image }, { buffer: shadow }]),
  });
  const renderBind = device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, { buffer: image }, { buffer: shadow }]),
  });

  const groups = Math.ceil(count / 256);
  const stepData = new Float32Array(64 * STEPS_PER_SUBMIT);
  const viewData = new Float32Array(4);
  let done = 0;

  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(initPipe);
    pass.setBindGroup(0, simBind, [0]);
    pass.dispatchWorkgroups(groups);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  const loopTime = step => (step / FPS) % PERIOD;

  function advance(steps) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(stepPipe);
    for (let s = 0; s < steps; s++) {
      stepData[s * 64] = loopTime(++done);
      pass.setBindGroup(0, simBind, [s * 256]);
      pass.dispatchWorkgroups(groups);
    }
    pass.end();
    device.queue.writeBuffer(stepBuf, 0, stepData, 0, steps * 64);
    device.queue.submit([encoder.finish()]);
  }

  function draw(context) {
    const texture = context.getCurrentTexture();
    viewData.set([texture.width, texture.height, loopTime(done)]);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(image);
    encoder.clearBuffer(shadow);
    const cp = encoder.beginComputePass();
    cp.setPipeline(splatPipe);
    cp.setBindGroup(0, splatBind);
    cp.dispatchWorkgroups(groups);
    cp.end();
    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBind);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => all.forEach(b => b.destroy());
  return { advance, draw, destroy };
}

main();
