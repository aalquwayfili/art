const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const FPS = 60;
const SUBSTEPS = 32;
const GRID = [96, 48, 40];
const DX = 0.0125;
const COUNT = 48000;
const SHADOW = 2048;
const TERRAIN = 320 * 240 * 6;

function params() {
  const dt = 2e-4;
  const pVol = (DX / 2) ** 3;
  const rho = 1 / pVol;
  const E = 144 * rho, nu = 0.3;
  const mu = E / (2 * (1 + nu)), lambda = E * nu / ((1 + nu) * (1 - 2 * nu));
  const phi = 30 * Math.PI / 180;
  const alpha = Math.sqrt(2 / 3) * 2 * Math.sin(phi) / (3 - Math.sin(phi));
  const data = new ArrayBuffer(64);
  new Uint32Array(data, 0, 4).set([...GRID, COUNT]);
  new Float32Array(data, 16, 11).set([DX, 1 / DX, dt, pVol, mu, lambda, alpha, GRID[2] * DX, 9.8, -dt * pVol * 4 / (DX * DX), 0]);
  return data;
}

const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function view(t, w, h) {
  const tanY = Math.tan(17 * Math.PI / 180), tanX = tanY * w / h;
  const target = [0.66, 0.2, 0.25];
  const az = 1.05 + 0.1 * Math.sin(t * 0.07), el = 0.3;
  const dist = Math.max(1.25, 0.5 / tanX);
  const eye = [target[0] + dist * Math.cos(el) * Math.cos(az), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(el) * Math.sin(az)];
  const fwd = norm(target.map((v, i) => v - eye[i]));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const sun = norm([0.3, 0.2, 0.93]);
  const lx = norm(cross([0, 1, 0], sun)), ly = cross(sun, lx);
  return new Float32Array([...eye, t, ...right, tanX, ...up, tanY, ...fwd, 0, ...sun, 0,
    ...lx, 1.0, ...ly, 3.0, 0.7, 0.2, 0.25, 0, w, h, SHADOW, 0]);
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

  const nodes = GRID[0] * GRID[1] * GRID[2];
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const paramBuf = device.createBuffer({ size: 64, usage: UNIFORM });
  const stepBuf = device.createBuffer({ size: 256 * SUBSTEPS, usage: UNIFORM });
  const viewBuf = device.createBuffer({ size: 144, usage: UNIFORM });
  const partBuf = device.createBuffer({ size: COUNT * 128, usage: STORAGE });
  const gridBuf = device.createBuffer({ size: nodes * 16, usage: STORAGE });
  const velBuf = device.createBuffer({ size: nodes * 16, usage: STORAGE });
  device.queue.writeBuffer(paramBuf, 0, params());

  const C = GPUShaderStage.COMPUTE;
  const simLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } },
      { binding: 1, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } },
      { binding: 3, visibility: C, buffer: { type: 'storage' } },
      { binding: 4, visibility: C, buffer: { type: 'storage' } },
    ],
  });
  const simBind = device.createBindGroup({
    layout: simLayout,
    entries: [paramBuf, stepBuf, partBuf, gridBuf, velBuf].map((buffer, binding) => ({ binding, resource: binding === 1 ? { buffer, size: 8 } : { buffer } })),
  });
  const simPipes = {};
  const simPipeLayout = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
  for (const entryPoint of ['init', 'clearGrid', 'p2g', 'gridUpdate', 'g2p']) {
    simPipes[entryPoint] = device.createComputePipeline({ layout: simPipeLayout, compute: { module, entryPoint } });
  }

  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const shared = [
    { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
    { binding: 5, visibility: VF, buffer: { type: 'uniform' } },
    { binding: 6, visibility: VF, buffer: { type: 'read-only-storage' } },
  ];
  const shadowLayout = device.createBindGroupLayout({ entries: shared });
  const drawLayout = device.createBindGroupLayout({
    entries: shared.concat([
      { binding: 7, visibility: VF, texture: { sampleType: 'depth' } },
      { binding: 8, visibility: VF, sampler: { type: 'comparison' } },
    ]),
  });
  const shadowTex = device.createTexture({ size: [SHADOW, SHADOW], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const sharedEntries = [{ binding: 0, resource: { buffer: paramBuf } }, { binding: 5, resource: { buffer: viewBuf } }, { binding: 6, resource: { buffer: partBuf } }];
  const shadowBind = device.createBindGroup({ layout: shadowLayout, entries: sharedEntries });
  const drawBind = device.createBindGroup({
    layout: drawLayout,
    entries: sharedEntries.concat([
      { binding: 7, resource: shadowTex.createView() },
      { binding: 8, resource: device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' }) },
    ]),
  });

  const pipe = (layout, vs, fs, targets, depthFormat, compare, write = true) => device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: vs },
    fragment: fs ? { module, entryPoint: fs, targets } : undefined,
    depthStencil: { format: depthFormat, depthWriteEnabled: write, depthCompare: compare },
  });
  const terrainShadow = pipe(shadowLayout, 'vsTerrainShadow', null, [], 'depth32float', 'less');
  const grainShadow = pipe(shadowLayout, 'vsGrainShadow', 'fsGrainShadow', [], 'depth32float', 'less');
  const color = [{ format }];
  const skyPipe = pipe(drawLayout, 'vsSky', 'fsSky', color, 'depth24plus', 'always', false);
  const terrainPipe = pipe(drawLayout, 'vsTerrain', 'fsTerrain', color, 'depth24plus', 'less');
  const grainPipe = pipe(drawLayout, 'vsGrain', 'fsGrain', color, 'depth24plus', 'less');

  let quality = query.get('quality') || (fixedTime === null && isSoftware(adapter) ? 'low' : 'default');
  let depthTex = null;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2) * (quality === 'low' ? 0.5 : 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (depthTex && depthTex.width === canvas.width && depthTex.height === canvas.height) return;
    if (depthTex) depthTex.destroy();
    depthTex = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  };
  resize();
  addEventListener('resize', resize);

  const groups = n => Math.ceil(n / 64);
  let step = 0;
  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(simPipes.init);
    pass.setBindGroup(0, simBind, [0]);
    pass.dispatchWorkgroups(groups(COUNT));
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  const stepData = new Uint32Array(64 * SUBSTEPS);
  function advance(frames, substeps = SUBSTEPS) {
    for (let f = 0; f < frames; f++) {
      for (let s = 0; s < substeps; s++) stepData[s * 64] = step++;
      device.queue.writeBuffer(stepBuf, 0, stepData, 0, substeps * 64);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      for (let s = 0; s < substeps; s++) {
        pass.setBindGroup(0, simBind, [s * 256]);
        pass.setPipeline(simPipes.clearGrid);
        pass.dispatchWorkgroups(groups(nodes * 4));
        pass.setPipeline(simPipes.p2g);
        pass.dispatchWorkgroups(groups(COUNT));
        pass.setPipeline(simPipes.gridUpdate);
        pass.dispatchWorkgroups(groups(nodes));
        pass.setPipeline(simPipes.g2p);
        pass.dispatchWorkgroups(groups(COUNT));
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  }

  function draw(t) {
    device.queue.writeBuffer(viewBuf, 0, view(t, canvas.width, canvas.height));
    const encoder = device.createCommandEncoder();
    const sp = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowTex.createView(), depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' },
    });
    sp.setBindGroup(0, shadowBind);
    sp.setPipeline(terrainShadow);
    sp.draw(TERRAIN);
    sp.setPipeline(grainShadow);
    sp.draw(6, COUNT * 5);
    sp.end();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: depthTex.createView(), depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, drawBind);
    pass.setPipeline(skyPipe);
    pass.draw(3);
    pass.setPipeline(terrainPipe);
    pass.draw(TERRAIN);
    pass.setPipeline(grainPipe);
    pass.draw(6, COUNT * 5);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  if (fixedTime !== null) {
    const frames = Math.round(fixedTime * FPS);
    for (let f = 0; f < frames; f += 10) { advance(Math.min(10, frames - f)); await device.queue.onSubmittedWorkDone(); }
    draw(frames / FPS);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }
  if (query.has('record')) {
    let frame = 0;
    window.advanceFrames = async n => {
      for (let f = 0; f < n; f++) { advance(1); if (f % 5 === 4) await device.queue.onSubmittedWorkDone(); }
      frame += n;
      draw(frame / FPS);
      await device.queue.onSubmittedWorkDone();
      return frame;
    };
    document.title = 'ready';
    return;
  }

  let substeps = SUBSTEPS, frames = 0, slow = 0, last = performance.now(), simTime = 0;
  const loop = now => {
    const dt = now - last;
    last = now;
    if (substeps > 8 && ++frames > 30 && dt > 40 && ++slow > 30) { substeps /= 2; slow = 0; frames = 0; }
    advance(1, substeps);
    simTime += substeps / SUBSTEPS / FPS;
    draw(simTime);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
