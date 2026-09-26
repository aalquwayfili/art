const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const SIM_HZ = 20;
const PERIOD = 24;
const LOOP_STEPS = PERIOD * SIM_HZ;
const STEPS_PER_SUBMIT = 30;

function settings(quality) {
  return quality === 'low' ? { grid: [360, 200] } : { grid: [720, 400] };
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
    scene.advance(Math.round((fixedTime % PERIOD) * SIM_HZ));
    scene.draw(context);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let start = performance.now(), frame = 0, slowFrames = 0, last = start;
  const loop = now => {
    const dt = now - last;
    last = now;
    if (quality !== 'low' && frame > 30 && frame < 150 && dt > 45 && ++slowFrames > 40) {
      quality = 'low';
      scene.destroy();
      scene = createScene(device, module, format, settings(quality));
      start = now;
    }
    const behind = Math.floor((now - start) / 1000 * SIM_HZ) - scene.steps();
    if (behind > 4) start += (behind - 4) * 1000 / SIM_HZ;
    scene.advance(Math.max(0, Math.min(behind, 4)));
    scene.draw(context);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createScene(device, module, format, cfg) {
  const [nx, ny] = cfg.grid;
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage) => device.createBuffer({ size, usage });

  const paramBuf = buffer(16, UNIFORM);
  const stepBuf = buffer(256 * STEPS_PER_SUBMIT, UNIFORM);
  const viewBuf = buffer(16, UNIFORM);
  const water = [buffer(nx * ny * 16, STORAGE), buffer(nx * ny * 16, STORAGE)];
  const paint = buffer(nx * ny * 16, STORAGE);
  const grain = buffer(nx * ny * 4, STORAGE);
  const planBuf = buffer(2048, STORAGE);
  const all = [paramBuf, stepBuf, viewBuf, planBuf, paint, grain, ...water];

  const paramData = new ArrayBuffer(16);
  new Uint32Array(paramData, 0, 2).set([nx, ny]);
  new Float32Array(paramData, 8, 2).set([1 / ny, 1 / SIM_HZ]);
  device.queue.writeBuffer(paramBuf, 0, paramData);

  const flowLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const flowPipeLayout = device.createPipelineLayout({ bindGroupLayouts: [flowLayout] });
  const grainPipe = device.createComputePipeline({ layout: flowPipeLayout, compute: { module, entryPoint: 'paperGrain' } });
  const planPipe = device.createComputePipeline({ layout: flowPipeLayout, compute: { module, entryPoint: 'prepare' } });
  const flowPipe = device.createComputePipeline({ layout: flowPipeLayout, compute: { module, entryPoint: 'flow' } });
  const renderPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });

  const entries = list => list.map((resource, binding) => ({ binding, resource }));
  const flowBind = [0, 1].map(i => device.createBindGroup({
    layout: flowLayout,
    entries: entries([{ buffer: paramBuf }, { buffer: stepBuf, size: 4 }, { buffer: water[i] }, { buffer: water[1 - i] }, { buffer: planBuf }, { buffer: paint }, { buffer: grain }]),
  }));
  const renderBind = [0, 1].map(i => device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, { buffer: water[i] }, { buffer: paint }]),
  }));

  const groups = [Math.ceil(nx / 8), Math.ceil(ny / 8)];
  const stepData = new Float32Array(64 * STEPS_PER_SUBMIT);
  const viewData = new Float32Array(4);
  let done = 0;
  let total = 0;

  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(grainPipe);
    pass.setBindGroup(0, flowBind[0], [0]);
    pass.dispatchWorkgroups(...groups);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function advance(steps) {
    while (steps > 0) {
      const encoder = device.createCommandEncoder();
      if (done === LOOP_STEPS) {
        done = 0;
        [paint, ...water].forEach(b => encoder.clearBuffer(b));
      }
      const n = Math.min(steps, STEPS_PER_SUBMIT, LOOP_STEPS - done);
      const pass = encoder.beginComputePass();
      for (let s = 0; s < n; s++) {
        stepData[s * 64] = ++done / SIM_HZ;
        pass.setBindGroup(0, flowBind[(done - 1) % 2], [s * 256]);
        pass.setPipeline(planPipe);
        pass.dispatchWorkgroups(1);
        pass.setPipeline(flowPipe);
        pass.dispatchWorkgroups(...groups);
      }
      pass.end();
      device.queue.writeBuffer(stepBuf, 0, stepData, 0, n * 64);
      device.queue.submit([encoder.finish()]);
      steps -= n;
      total += n;
    }
  }

  function draw(context) {
    const texture = context.getCurrentTexture();
    viewData.set([texture.width, texture.height, done / SIM_HZ]);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    const encoder = device.createCommandEncoder();
    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBind[done % 2]);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => all.forEach(b => b.destroy());
  return { advance, draw, destroy, steps: () => total };
}

main();
