const query = new URLSearchParams(location.search);
const FIXED_T = query.has('t') ? parseFloat(query.get('t')) : null;

const QUALITY = {
  default: { height: 512, iterations: 40 },
  low: { height: 128, iterations: 12 },
};
const DT = 1 / 30;
const MAX_STEPS_PER_FRAME = 2;
const SLOW_FRAME_MS = 50;
const NO_POINTER = [-1e6, -1e6, 0, 0];

const canvas = document.getElementById('c');

function showMessage(text) {
  const p = document.createElement('p');
  p.className = 'message';
  p.textContent = text;
  document.body.append(p);
}

function isSoftwareAdapter(adapter) {
  const info = adapter.info || {};
  const name = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`;
  return info.isFallbackAdapter || /swiftshader|llvmpipe|lavapipe|software|basic render/i.test(name);
}

async function createPipelines(device, format) {
  const module = device.createShaderModule({ code: await (await fetch('shader.wgsl')).text() });
  for (const m of (await module.getCompilationInfo()).messages) {
    if (m.type === 'error') console.error(`shader.wgsl:${m.lineNum}:${m.linePos} ${m.message}`);
  }
  const names = ['advectVelocity', 'advectForward', 'advectCorrect', 'curl', 'forces', 'divergence', 'jacobi', 'project'];
  const list = await Promise.all([
    ...names.map((entryPoint) => device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint } })),
    device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    }),
  ]);
  return Object.fromEntries([...names, 'ink'].map((name, i) => [name, list[i]]));
}

class Smoke {
  constructor(device, pipelines) {
    this.device = device;
    this.pipelines = pipelines;
    this.uniforms = new ArrayBuffer(48);
    this.uniformBuffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pointer = NO_POINTER.slice();
  }

  build(quality, view) {
    const height = quality.height;
    const width = Math.round((height * view[0]) / view[1]);
    const cells = width * height;
    this.quality = quality;
    this.grid = [width, height];
    this.view = view;
    this.buffers?.forEach((b) => b.destroy());
    const buffer = (bytes) => this.device.createBuffer({ size: cells * bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const [velA, velB, smokeA, smokeB, smokeHat] = [8, 8, 8, 8, 8].map(buffer);
    const [spin, div, p0, p1] = [4, 4, 4, 4].map(buffer);
    this.buffers = [velA, velB, smokeA, smokeB, smokeHat, spin, div, p0, p1];
    Object.assign(this, { velA, velB, smokeA, smokeB });

    const p = this.pipelines;
    const bind = (pipeline, resources) => this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [[0, this.uniformBuffer], ...Object.entries(resources)].map(([binding, buffer]) => ({ binding: +binding, resource: { buffer } })),
    });
    this.passes = [
      [p.advectForward, bind(p.advectForward, { 1: velA, 2: smokeA, 4: smokeHat })],
      [p.advectCorrect, bind(p.advectCorrect, { 1: velA, 2: smokeA, 3: smokeHat, 4: smokeB })],
      [p.advectVelocity, bind(p.advectVelocity, { 1: velA, 4: velB })],
      [p.curl, bind(p.curl, { 1: velB, 3: spin })],
      [p.forces, bind(p.forces, { 1: velB, 2: smokeB, 3: spin })],
      [p.divergence, bind(p.divergence, { 1: velB, 2: div })],
    ];
    this.jacobi = [bind(p.jacobi, { 2: div, 3: p0, 4: p1 }), bind(p.jacobi, { 2: div, 3: p1, 4: p0 })];
    this.projectGroup = bind(p.project, { 1: velB, 3: p0 });
    this.inkGroup = bind(p.ink, { 1: smokeA });
  }

  writeParams(time) {
    const u32 = new Uint32Array(this.uniforms);
    const f32 = new Float32Array(this.uniforms);
    u32.set(this.grid, 0);
    f32.set(this.view, 2);
    f32[4] = time;
    f32[5] = DT;
    f32.set(this.pointer, 8);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniforms);
  }

  step(time) {
    this.writeParams(time);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    const groups = [Math.ceil(this.grid[0] / 8), Math.ceil(this.grid[1] / 8)];
    const run = (pipeline, group) => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(...groups);
    };
    for (const [pipeline, group] of this.passes) run(pipeline, group);
    for (let i = 0; i < this.quality.iterations; i++) run(this.pipelines.jacobi, this.jacobi[i & 1]);
    run(this.pipelines.project, this.projectGroup);
    pass.end();
    encoder.copyBufferToBuffer(this.velB, 0, this.velA, 0, this.velA.size);
    encoder.copyBufferToBuffer(this.smokeB, 0, this.smokeA, 0, this.smokeA.size);
    this.device.queue.submit([encoder.finish()]);
  }

  draw(target) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(this.pipelines.ink);
    pass.setBindGroup(0, this.inkGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  setPointer(x, y, vx, vy) {
    const s = this.grid[1] / this.view[1];
    this.pointer = [x * s, (this.view[1] - y) * s, vx * s, -vy * s];
  }
}

function fitCanvas() {
  const dpr = FIXED_T === null ? Math.min(devicePixelRatio || 1, 2) : 1;
  canvas.width = Math.max(1, Math.round(innerWidth * dpr));
  canvas.height = Math.max(1, Math.round(innerHeight * dpr));
  return [canvas.width, canvas.height];
}

async function renderStill(device, context, smoke, t) {
  const steps = Math.round(t / DT);
  for (let i = 0; i < steps; i++) {
    smoke.step(i * DT);
    if (i % 30 === 29) await device.queue.onSubmittedWorkDone();
  }
  smoke.draw(context.getCurrentTexture().createView());
  await device.queue.onSubmittedWorkDone();
  document.title = 'done';
}

function followPointer(smoke) {
  let last = null;
  canvas.addEventListener('pointermove', (e) => {
    const dpr = canvas.width / innerWidth;
    const now = e.timeStamp / 1000;
    const dt = last ? Math.max(now - last.time, 1 / 120) : 1;
    const vx = last ? (e.clientX - last.x) / dt : 0;
    const vy = last ? (e.clientY - last.y) / dt : 0;
    smoke.setPointer(e.clientX * dpr, e.clientY * dpr, vx * dpr, vy * dpr);
    last = { x: e.clientX, y: e.clientY, time: now };
  });
  canvas.addEventListener('pointerleave', () => {
    smoke.pointer = NO_POINTER.slice();
    last = null;
  });
}

function animate(context, smoke, qualityName) {
  const frameTimes = [];
  let start = performance.now();
  let last = start;
  let simTime = 0;
  const restart = (quality) => {
    smoke.build(quality, fitCanvas());
    start = performance.now();
    simTime = 0;
  };
  const frame = (now) => {
    frameTimes.push(now - last);
    last = now;
    if (qualityName === 'default' && frameTimes.length === 40) {
      const median = frameTimes.slice(10).sort((a, b) => a - b)[15];
      if (median > SLOW_FRAME_MS) {
        qualityName = 'low';
        restart(QUALITY.low);
      }
    }
    const elapsed = (now - start) / 1000;
    for (let n = 0; simTime + DT <= elapsed && n < MAX_STEPS_PER_FRAME; n++) {
      smoke.step(simTime);
      simTime += DT;
    }
    simTime = Math.max(simTime, elapsed - DT);
    smoke.pointer[2] *= 0.8;
    smoke.pointer[3] *= 0.8;
    smoke.draw(context.getCurrentTexture().createView());
    requestAnimationFrame(frame);
  };
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => restart(smoke.quality), 200);
  });
  followPointer(smoke);
  requestAnimationFrame(frame);
}

async function main() {
  const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
  if (!adapter) return showMessage('This piece needs WebGPU: Chrome, Edge, or Safari 26+');
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (e) => console.error(e.error.message));
  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext('webgpu');
  context.configure({ device, format, alphaMode: 'opaque' });

  const qualityName = query.get('quality') === 'low' || isSoftwareAdapter(adapter) ? 'low' : 'default';
  const smoke = new Smoke(device, await createPipelines(device, format));
  smoke.build(QUALITY[qualityName], fitCanvas());

  if (FIXED_T !== null) await renderStill(device, context, smoke, FIXED_T);
  else animate(context, smoke, qualityName);
}

main();
