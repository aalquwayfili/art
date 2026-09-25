const STEPS_PER_SECOND = 15;
const DT = 1 / STEPS_PER_SECOND;
const QUALITY = {
  default: { boids: 1 << 17, pixelHeight: 450 },
  low: { boids: 6144, pixelHeight: 300 },
};
const FULL_FLOCK = 1 << 17;
const VISION = 1.5;
const FLEE_RADIUS = 14;
const FALCON_PERIOD = 10;
const EYE = [0, 2, 0];
const LOOK_AT = [0, 50, -180];
const FOV_Y = (48 * Math.PI) / 180;

const params = new URLSearchParams(location.search);
const fixedTime = params.has('t') ? parseFloat(params.get('t')) : null;

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description}`.toLowerCase();
  return info.isFallbackAdapter || /swiftshader|llvmpipe|software|microsoft basic/.test(text);
}

function roost(t) {
  return [30 * Math.sin(t * 0.11), 66 + 8 * Math.sin(t * 0.23 + 1), -200 + 15 * Math.cos(t * 0.07)];
}

function falcon(t) {
  const s = ((t % FALCON_PERIOD) / FALCON_PERIOD - 0.3) / 0.4;
  if (s < 0 || s > 1) return null;
  const [x, y, z] = roost(t);
  return [x - 60 + 115 * s, y + 40 - 30 * s - 32 * Math.sin(Math.PI * s), z + 20 - 35 * s];
}

function viewProjection(aspect) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = (a) => a.map((v) => v / Math.hypot(...a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const f = norm(sub(LOOK_AT, EYE));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const k = 1 / Math.tan(FOV_Y / 2);
  const near = 0.5;
  const far = 1000;
  const view = [r, u, f.map((v) => -v)];
  const proj = [k / aspect, k, far / (near - far), (near * far) / (near - far)];
  const m = new Float32Array(16);
  for (let c = 0; c < 3; c++) {
    m[c * 4 + 0] = proj[0] * view[0][c];
    m[c * 4 + 1] = proj[1] * view[1][c];
    m[c * 4 + 2] = proj[2] * view[2][c];
    m[c * 4 + 3] = -view[2][c];
  }
  const t = view.map((row) => -dot(row, EYE));
  m[12] = proj[0] * t[0];
  m[13] = proj[1] * t[1];
  m[14] = proj[2] * t[2] + proj[3];
  m[15] = -t[2];
  return m;
}

function project(m, p) {
  const c = [0, 1, 3].map((row) => m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row]);
  return c[2] > 1 ? { x: c[0] / c[2], y: c[1] / c[2], depth: c[2] } : null;
}

function bind(device, pipeline, entries) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: Object.entries(entries).map(([binding, buffer]) => ({ binding: +binding, resource: { buffer } })),
  });
}

async function start() {
  const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
  if (!adapter) throw new Error('no WebGPU');
  const device = await adapter.requestDevice();
  const quality = QUALITY[params.get('quality') === 'low' || isSoftware(adapter) ? 'low' : 'default'];
  const canvas = document.getElementById('c');
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const count = quality.boids;
  const thinning = FULL_FLOCK / count;
  const vision = VISION * Math.cbrt(thinning);
  const tableSize = 2 ** Math.max(11, Math.ceil(Math.log2(count * 2)));
  const blocks = tableSize / 2048;

  const module = device.createShaderModule({ code: await (await fetch('shader.wgsl')).text() });
  for (const m of (await module.getCompilationInfo()).messages) {
    if (m.type === 'error') console.error(`shader.wgsl:${m.lineNum}:${m.linePos} ${m.message}`);
  }
  const compute = (entryPoint) => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
  const pipes = {
    seed: compute('seedFlock'), scatter: compute('scatter'),
    scanBlocks: compute('scanBlocks'), scanSums: compute('scanSums'), addOffsets: compute('addOffsets'),
    flock: compute('flock'), splat: compute('splat'),
    sky: device.createRenderPipeline({
      layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    }),
  };

  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage = STORAGE) => device.createBuffer({ size, usage });
  const boids = buffer(count * 32);
  const sorted = buffer(count * 32);
  const counts = buffer(tableSize * 4);
  const starts = buffer(tableSize * 4);
  const ends = buffer(tableSize * 4);
  const blockSums = buffer(blocks * 4);
  const seedParams = buffer(48, UNIFORM);
  const gridParams = buffer(16, UNIFORM);
  const simParams = buffer(48, UNIFORM);
  const cameraParams = buffer(96, UNIFORM);
  const viewParams = buffer(32, UNIFORM);

  const seedWords = new Float32Array(12);
  new Uint32Array(seedWords.buffer).set([count, tableSize - 1]);
  seedWords.set([vision], 2);
  seedWords.set(roost(0), 4);
  seedWords.set([50, 15, 40], 8);
  device.queue.writeBuffer(seedParams, 0, seedWords);
  const gridWords = new Uint32Array([count, tableSize - 1, 0, 0]);
  new Float32Array(gridWords.buffer)[2] = vision;
  device.queue.writeBuffer(gridParams, 0, gridWords);

  const groups = {
    seed: bind(device, pipes.seed, { 0: seedParams, 1: boids, 2: counts }),
    scanBlocks: bind(device, pipes.scanBlocks, { 0: counts, 1: starts, 2: blockSums }),
    scanSums: bind(device, pipes.scanSums, { 2: blockSums }),
    addOffsets: bind(device, pipes.addOffsets, { 1: starts, 2: blockSums, 3: ends }),
    scatter: bind(device, pipes.scatter, { 0: gridParams, 1: boids, 3: ends, 4: sorted }),
    flock: bind(device, pipes.flock, { 0: simParams, 1: sorted, 2: starts, 3: ends, 4: boids, 5: counts }),
  };
  const boidGroups = Math.ceil(count / 256);
  const sortDispatches = [['scanBlocks', blocks], ['scanSums', 1], ['addOffsets', tableSize / 256], ['scatter', boidGroups]];

  function encodePass(encoder, dispatches) {
    const pass = encoder.beginComputePass();
    for (const [name, n] of dispatches) {
      pass.setPipeline(pipes[name]);
      pass.setBindGroup(0, groups[name]);
      pass.dispatchWorkgroups(n);
    }
    pass.end();
  }

  let pixels = [0, 0];
  let density = null;
  let splatGroup = null;
  let skyGroup = null;
  let matrix = null;

  function resize() {
    pixels = [Math.round((quality.pixelHeight * innerWidth) / innerHeight), quality.pixelHeight];
    [canvas.width, canvas.height] = pixels;
    density?.destroy();
    density = buffer(pixels[0] * pixels[1] * 4);
    splatGroup = bind(device, pipes.splat, { 0: cameraParams, 1: boids, 2: density });
    skyGroup = bind(device, pipes.sky, { 0: viewParams, 1: density });
    matrix = viewProjection(pixels[0] / pixels[1]);
    const words = new Float32Array(21);
    words.set(matrix);
    new Uint32Array(words.buffer).set([pixels[0], pixels[1], count], 16);
    words[19] = 256 * thinning;
    device.queue.writeBuffer(cameraParams, 0, words);
  }

  let steps = 0;
  function step() {
    const t = steps * DT;
    const hunter = falcon(t);
    const words = new Float32Array(12);
    new Uint32Array(words.buffer).set([count, tableSize - 1]);
    words.set([vision, DT, ...roost(t), hunter ? FLEE_RADIUS : 1e-3, ...(hunter || [0, -1e4, 0]), t], 2);
    device.queue.writeBuffer(simParams, 0, words);
    const encoder = device.createCommandEncoder();
    encodePass(encoder, sortDispatches);
    encoder.clearBuffer(counts);
    encodePass(encoder, [['flock', boidGroups]]);
    device.queue.submit([encoder.finish()]);
    steps++;
  }

  function falconSprite(t) {
    const p = falcon(t);
    const s = p && project(matrix, p);
    if (!s) return [-100, -100, 0, 0];
    const size = Math.min(2 + Math.round(150 / s.depth), 6);
    const flap = 0.5 + 0.5 * Math.sin(t * 13);
    return [(s.x * 0.5 + 0.5) * pixels[0], (0.5 - s.y * 0.5) * pixels[1], size, flap];
  }

  function draw(lead = 0) {
    const t = steps * DT + lead;
    device.queue.writeBuffer(cameraParams, 80, new Float32Array([lead]));
    const [fx, fy, size, flap] = falconSprite(t);
    device.queue.writeBuffer(viewParams, 0, new Float32Array([...pixels, fx, fy, t, size, flap]));
    const encoder = device.createCommandEncoder();
    encoder.clearBuffer(density);
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipes.splat);
    pass.setBindGroup(0, splatGroup);
    pass.dispatchWorkgroups(boidGroups);
    pass.end();
    const render = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    render.setPipeline(pipes.sky);
    render.setBindGroup(0, skyGroup);
    render.draw(3);
    render.end();
    device.queue.submit([encoder.finish()]);
  }

  resize();
  addEventListener('resize', resize);
  const seedEncoder = device.createCommandEncoder();
  encodePass(seedEncoder, [['seed', boidGroups]]);
  device.queue.submit([seedEncoder.finish()]);

  if (fixedTime !== null) {
    const target = Math.round(fixedTime * STEPS_PER_SECOND);
    while (steps < target) {
      step();
      if (steps % STEPS_PER_SECOND === 0) await device.queue.onSubmittedWorkDone();
    }
    draw();
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let last = performance.now();
  let owed = 0;
  let slowFrames = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (quality !== QUALITY.low && dt > 0.045 && ++slowFrames > 90) {
      params.set('quality', 'low');
      location.replace(`?${params}`);
      return;
    }
    owed = Math.min(owed + dt * STEPS_PER_SECOND, 3);
    for (; owed >= 1; owed--) step();
    draw(owed * DT);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  document.getElementById('nogpu').style.display = 'grid';
});
