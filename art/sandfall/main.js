const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const FPS = 60;
const BIRTH_SECONDS = 10;
const FRAMES_PER_SUBMIT = 30;

function settings(quality) {
  const low = quality === 'low';
  const ny = low ? 108 : 216;
  const substeps = low ? 3 : 8;
  const count = low ? 24576 : 131072;
  const E = 4 * (1.0 * ny) ** 2, nu = 0.3, friction = 40 * Math.PI / 180;
  const sinPhi = Math.sin(friction);
  return {
    grid: [Math.round(ny * 16 / 9), ny], count, substeps,
    dt: 1 / (FPS * substeps),
    birthPerStep: count / (BIRTH_SECONDS * FPS * substeps),
    gravity: 0.8 * ny,
    mu: E / (2 * (1 + nu)),
    lambda: E * nu / ((1 + nu) * (1 - 2 * nu)),
    alpha: Math.sqrt(2 / 3) * 2 * sinPhi / (3 - sinPhi),
  };
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
  let sim = createSim(device, module, format, settings(quality));

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  addEventListener('resize', resize);

  if (fixedTime !== null) {
    const frames = Math.round(fixedTime * FPS);
    for (let f = 0; f < frames; f += FRAMES_PER_SUBMIT) sim.advance(Math.min(FRAMES_PER_SUBMIT, frames - f));
    sim.draw(context);
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
      sim.destroy();
      sim = createSim(device, module, format, settings(quality));
      frame = 0;
    }
    sim.advance(1);
    sim.draw(context);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createSim(device, module, format, cfg) {
  const { grid: [nx, ny], count, substeps } = cfg;
  const nodeCount = nx * ny;
  const canvasPixels = 4 * nodeCount;
  const maxSteps = FRAMES_PER_SUBMIT * substeps;
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage) => device.createBuffer({ size, usage });

  const paramBuf = buffer(40, UNIFORM);
  const stepBuf = buffer(256 * (maxSteps + 1), UNIFORM);
  const viewBuf = buffer(8, UNIFORM);
  const particles = buffer(count * 56, STORAGE);
  const nodes = buffer(nodeCount * 12, STORAGE);
  const gridVel = buffer(nodeCount * 8, STORAGE);
  const sandCanvas = buffer(canvasPixels * 12, STORAGE);
  const density = buffer(canvasPixels * 8, STORAGE);
  const all = [paramBuf, stepBuf, viewBuf, particles, nodes, gridVel, sandCanvas, density];

  const paramData = new ArrayBuffer(40);
  new Int32Array(paramData, 0, 2).set(cfg.grid);
  new Uint32Array(paramData, 8, 1).set([count]);
  new Float32Array(paramData, 12, 6).set([cfg.birthPerStep, cfg.dt, cfg.gravity, cfg.mu, cfg.lambda, cfg.alpha]);
  device.queue.writeBuffer(paramBuf, 0, paramData);

  const layoutOf = types => device.createBindGroupLayout({
    entries: types.map((type, binding) => ({
      binding, visibility: GPUShaderStage.COMPUTE,
      buffer: type === 'dynamic' ? { type: 'uniform', hasDynamicOffset: true } : { type },
    })),
  });
  const particleLayout = layoutOf(['uniform', 'dynamic', 'storage', 'read-only-storage', 'storage']);
  const splatLayout = layoutOf(['uniform', 'uniform', 'read-only-storage', 'storage', 'storage']);
  const compute = (entryPoint, layout) => device.createComputePipeline({
    layout: layout ? device.createPipelineLayout({ bindGroupLayouts: [layout] }) : 'auto',
    compute: { module, entryPoint },
  });
  const particlePipe = compute('stepParticles', particleLayout);
  const gridPipe = compute('stepGrid');
  const splatPipe = compute('splat', splatLayout);
  const softenPipe = compute('soften', splatLayout);
  const renderPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });

  const entries = list => list.map((resource, binding) => ({ binding, resource }));
  const stepSlot = { buffer: stepBuf, size: 4 };
  const particleBind = device.createBindGroup({
    layout: particleLayout,
    entries: entries([{ buffer: paramBuf }, stepSlot, { buffer: particles }, { buffer: gridVel }, { buffer: nodes }]),
  });
  const gridBind = device.createBindGroup({
    layout: gridPipe.getBindGroupLayout(0),
    entries: entries([{ buffer: paramBuf }, { buffer: nodes }, { buffer: gridVel }]),
  });
  const splatBind = device.createBindGroup({
    layout: splatLayout,
    entries: entries([{ buffer: paramBuf }, { buffer: stepBuf, offset: 256 * maxSteps, size: 4 },
      { buffer: particles }, { buffer: sandCanvas }, { buffer: density }]),
  });
  const renderBind = device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, { buffer: sandCanvas }, { buffer: density }]),
  });

  const stepData = new Uint32Array(64 * maxSteps);
  const drawStep = new Uint32Array(1);
  const viewData = new Float32Array(2);
  const particleGroups = Math.ceil(count / 256);
  const gridGroups = [Math.ceil(nx / 16), Math.ceil(ny / 16)];
  const canvasGroups = [Math.ceil(2 * nx / 16), Math.ceil(2 * ny / 16)];
  let done = 0;

  function advance(frames) {
    const steps = frames * substeps;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    for (let s = 0; s < steps; s++) {
      stepData[s * 64] = done++;
      pass.setPipeline(particlePipe);
      pass.setBindGroup(0, particleBind, [s * 256]);
      pass.dispatchWorkgroups(particleGroups);
      pass.setPipeline(gridPipe);
      pass.setBindGroup(0, gridBind);
      pass.dispatchWorkgroups(...gridGroups);
    }
    pass.end();
    device.queue.writeBuffer(stepBuf, 0, stepData, 0, steps * 64);
    device.queue.submit([encoder.finish()]);
  }

  function draw(context) {
    const texture = context.getCurrentTexture();
    viewData.set([texture.width, texture.height]);
    drawStep[0] = done;
    device.queue.writeBuffer(viewBuf, 0, viewData);
    device.queue.writeBuffer(stepBuf, 256 * maxSteps, drawStep);
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(sandCanvas);
    const cp = encoder.beginComputePass();
    cp.setPipeline(splatPipe);
    cp.setBindGroup(0, splatBind);
    cp.dispatchWorkgroups(particleGroups);
    cp.setPipeline(softenPipe);
    cp.dispatchWorkgroups(...canvasGroups);
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
