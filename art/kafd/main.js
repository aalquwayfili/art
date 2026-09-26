const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const PERIOD = 28;
const BUILD = 12;
const REWIND = 25;
const SPAN = 19;
const FALL = 0.5;
const DROP = 10;
const PLATE = 0.4;
const GX = 192, GY = 128, GZ = 192;
const MAX_BOXES = 8192, MAX_STUDS = 16384, MAX_SHADOWS = 16;

const C = {
  TAN: 1, DTAN: 2, WHITE: 3, LGRAY: 4, DGRAY: 5, ROAD: 6, GLASS: 7, BLUEGLASS: 8, GOLD: 9, GREEN: 10,
  DGREEN: 11, BROWN: 12, YELLOW: 13, WINDOW: 14, LAMP: 15, RED: 16, BLUE: 17, POOL: 18, NOUGAT: 19,
  ORANGE: 20, SMOKE: 21, ARCH: 22,
};
const PLATE_ONLY = 1, TILE = 2;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadCity() {
  const buf = await fetch('bricks.bin').then(r => r.arrayBuffer());
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const at = (x, y, z) => (y * GZ + z) * GX + x;
  const cells = new Uint32Array(GX * GY * GZ);
  const coarse = new Uint32Array((GX / 8) * (GY / 8) * (GZ / 8));
  const mark = (x, y, z) => { if (y < GY) coarse[((y >> 3) * (GZ / 8) + (z >> 3)) * (GX / 8) + (x >> 3)] = 1; };
  for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) { cells[at(x, 0, z)] = 1; mark(x, 0, z); mark(x, 1, z); }
  const data = new ArrayBuffer((n + 2) * 32);
  const f32 = new Float32Array(data), u32 = new Uint32Array(data);
  const write = (i, lo, time, size, mat) => { f32.set([...lo, time, ...size], i * 8); u32[i * 8 + 7] = mat; };
  write(1, [0, 0, 0], -1e9, [GX, 1, GZ], C.TAN);
  const list = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 8;
    const lo = [view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2)];
    const size = [view.getUint8(o + 3), view.getUint8(o + 4), view.getUint8(o + 5)];
    const mat = view.getUint16(o + 6, true);
    const time = SPAN * i / n;
    list.push({ lo, size, mat, time });
    write(i + 2, lo, time, size, mat);
    for (let y = lo[1]; y < lo[1] + size[1]; y++) for (let z = lo[2]; z < lo[2] + size[2]; z++) for (let x = lo[0]; x < lo[0] + size[0]; x++) {
      cells[at(x, y, z)] = i + 2;
      mark(x, y, z);
      mark(x, y + 1, z);
    }
  }
  const lanes = (await fetch('lanes.json').then(r => r.json())).lanes;
  const rand = rng(11);
  const cars = [];
  for (const lane of lanes) {
    const len = [0];
    for (let i = 1; i < lane.pts.length; i++) len.push(len[i - 1] + Math.hypot(lane.pts[i][0] - lane.pts[i - 1][0], lane.pts[i][1] - lane.pts[i - 1][1]));
    lane.len = len;
    const fast = /motorway|trunk/.test(lane.kind);
    const n = Math.floor(len[len.length - 1] / (fast ? 5 : 8));
    for (let k = 0; k < n; k++) cars.push({ lane, s: rand() * len[len.length - 1], v: (fast ? 3.5 : 2) * (0.8 + 0.4 * rand()), dir: rand() < 0.5 ? 1 : -1, paint: CAR_PAINT[Math.floor(rand() * CAR_PAINT.length)] });
  }
  return { cells, coarse, bricks: data, list, cars };
}

const CAR_PAINT = [3, 3, 3, 4, 5, 6, 16, 17, 2, 3];

function along(lane, s) {
  const L = lane.len, total = L[L.length - 1];
  s = ((s % total) + total) % total;
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const a = lane.pts[i - 1], b = lane.pts[i], f = (s - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-6);
  const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * f, z: a[1] + dz * f, hx: dx / d, hz: dz / d };
}

const smooth = x => x * x * (3 - 2 * x);
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const mix = (a, b, x) => a.map((v, i) => v + (b[i] - v) * x);

function clockAt(t) {
  if (t < BUILD) return t / BUILD * (SPAN + FALL);
  if (t < REWIND) return SPAN + FALL + 1;
  return (SPAN + FALL + 1) * (1 - smooth((t - REWIND) / (PERIOD - REWIND)));
}

function lightAt(t) {
  const phase = t < REWIND ? t / REWIND : 1 - smooth((t - REWIND) / (PERIOD - REWIND));
  const keys = [[0, 55], [0.45, 35], [0.7, 10], [0.8, 2], [0.88, -6], [1, -10]];
  let el = keys[keys.length - 1][1];
  for (let i = 1; i < keys.length; i++) {
    if (phase <= keys[i][0]) { const [x0, a] = keys[i - 1], [x1, b] = keys[i]; el = a + (b - a) * (phase - x0) / (x1 - x0); break; }
  }
  el *= Math.PI / 180;
  const az = 0.35 + 2.5 * phase;
  const sun = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const h = Math.sin(el);
  const up = clamp01(h / 0.04);
  const warm = smooth(clamp01((0.5 - h) / 0.45));
  const night = smooth(clamp01((0.06 - h) / 0.16));
  const dusk = smooth(clamp01((0.35 - h) / 0.35)) * (1 - night);
  const sunColor = mix([2.1, 2.0, 1.85], [1.9, 0.95, 0.42], warm).map(v => v * up);
  let skyTop = mix(mix([0.3, 0.31, 0.33], [0.3, 0.27, 0.3], dusk), [0.03, 0.035, 0.06], night);
  let skyLow = mix(mix([0.38, 0.35, 0.31], [0.6, 0.38, 0.26], dusk), [0.07, 0.06, 0.08], night);
  return { sun, sunColor, skyTop, skyLow, night, exposure: 0.85 + 1.2 * night };
}

function cameraAt(t, aspect) {
  const tanY = Math.tan(10.5 * Math.PI / 180);
  return cameraFrom({ target: [96, 16, 100], az: 1.25 + 0.3 * Math.sin(2 * Math.PI * t / PERIOD), el: 0.55, dist: Math.max(104 / (tanY * aspect), 100 / tanY), tanY }, aspect);
}

function cameraFrom({ target, az, el, dist, tanY }, aspect) {
  const tanX = tanY * aspect;
  const eye = [target[0] + dist * Math.cos(el) * Math.cos(az), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(el) * Math.sin(az)];
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(target.map((v, i) => v - eye[i]));
  const right = [Math.sin(az), 0, -Math.cos(az)];
  const up = cross(right, fwd);
  return { eye, fwd, right, up, tanX, tanY, focus: dist };
}

function dynamics(t, clock, list, box, stud, shadow, cars = []) {
  let nb = 0, ns = 0, nsh = 0;
  const addBox = (x0, y0, z0, x1, y1, z1, mat) => { if (nb < MAX_BOXES) box.set([x0, y0, z0, mat, x1, y1, z1, 0], 8 * nb++); };
  const addStud = (x, y, z, mat) => { if (ns < MAX_STUDS) stud.set([x, y, z, mat], 4 * ns++); };
  const n = list.length;
  const i0 = Math.max(0, Math.floor((clock - FALL) * n / SPAN)), i1 = Math.min(n - 1, Math.ceil(clock * n / SPAN));
  for (let i = i0; i <= i1; i++) {
    const b = list[i], s = (clock - b.time) / FALL;
    if (s < 0 || s >= 1) continue;
    const y = (b.lo[1] + DROP * (1 - s * s)) * PLATE;
    const [x, , z] = b.lo, [sx, sy, sz] = b.size;
    addBox(x, y, z, x + sx, y + sy * PLATE, z + sz, b.mat & 255);
    if (b.mat >> 8 !== 2) for (let a = 0; a < sx; a++) for (let c = 0; c < sz; c++) addStud(x + a + 0.5, y + sy * PLATE, z + c + 0.5, b.mat & 255);
  }
  if (clock > 4.5) for (const c of cars) {
    const p = along(c.lane, c.s + c.dir * c.v * t);
    const hx = p.hx * c.dir, hz = p.hz * c.dir;
    const x = p.x - hz * 0.55, z = p.z + hx * 0.55;
    const alongX = Math.abs(hx) > Math.abs(hz);
    const lx = alongX ? 0.45 : 0.25, lz = alongX ? 0.25 : 0.45;
    addBox(x - lx, 0.8, z - lz, x + lx, 1.05, z + lz, c.paint);
    addBox(x - lx * 0.55, 1.05, z - lz * 0.55, x + lx * 0.55, 1.2, z + lz * 0.55, 21);
    const fx = alongX ? Math.sign(hx) * lx : 0, fz = alongX ? 0 : Math.sign(hz) * lz;
    addBox(x + fx - 0.06, 0.88, z + fz - 0.06, x + fx + 0.06, 0.98, z + fz + 0.06, 15);
    addBox(x - fx - 0.06, 0.88, z - fz - 0.06, x - fx + 0.06, 0.98, z - fz + 0.06, 23);
  }
  return { nb, ns, nsh };
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

  const city = await loadCity();
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const upload = data => { const b = device.createBuffer({ size: data.byteLength, usage: STORAGE }); device.queue.writeBuffer(b, 0, data); return b; };
  const frameBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const cellBuf = upload(city.cells), brickBuf = upload(city.bricks), coarseBuf = upload(city.coarse);
  const boxData = new Float32Array(MAX_BOXES * 8), studData = new Float32Array(MAX_STUDS * 4), shadowData = new Float32Array(MAX_SHADOWS * 8);
  const boxBuf = upload(boxData), studBuf = upload(studData), shadowBuf = upload(shadowData);

  const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility, buffer: { type: 'uniform' } }]
      .concat([1, 2, 3, 4, 5, 6].map(binding => ({ binding, visibility, buffer: { type: 'read-only-storage' } }))),
  });
  const bind = device.createBindGroup({
    layout,
    entries: [frameBuf, cellBuf, brickBuf, coarseBuf, boxBuf, studBuf, shadowBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const HDR = 'rgba16float';
  const scene = (vs, fs, compare) => device.createRenderPipeline({
    layout: pipeLayout,
    vertex: { module, entryPoint: vs },
    fragment: { module, entryPoint: fs, targets: [{ format: HDR }] },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: compare },
  });
  const tracePipe = scene('vsFull', 'fsTrace', 'always');
  const boxPipe = scene('vsBox', 'fsBox', 'less');
  const studPipe = scene('vsStud', 'fsStud', 'less');
  const postPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPost', targets: [{ format }] },
  });

  let quality = query.get('quality') || (fixedTime === null && !query.has('film') && isSoftware(adapter) ? 'low' : 'default');
  let targets = null;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const budget = Math.min(1, Math.sqrt((query.has("film") ? 2.7e6 : 1.6e6) / (canvas.width * canvas.height))) * (quality === 'low' ? 0.5 : 1);
    const w = Math.max(1, Math.round(canvas.width * budget)), h = Math.max(1, Math.round(canvas.height * budget));
    if (targets && targets.w === w && targets.h === h) return;
    if (targets) { targets.hdr.destroy(); targets.depth.destroy(); }
    const hdr = device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const depth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const post = device.createBindGroup({
      layout: postPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: frameBuf } }, { binding: 7, resource: hdr.createView() }],
    });
    targets = { w, h, hdr, depth, post };
  };
  resize();
  addEventListener('resize', resize);

  const frame = new Float32Array(36);
  function draw(t, o = {}) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    const clock = o.clock ?? clockAt(t);
    const cam = o.cam ? cameraFrom(o.cam, canvas.width / canvas.height) : cameraAt(t, canvas.width / canvas.height);
    const light = lightAt(o.day ?? t);
    const { nb, ns, nsh } = dynamics(o.time ?? t, clock, city.list, boxData, studData, shadowData, city.cars);
    frame.set([...cam.eye, t, ...cam.right, cam.tanX, ...cam.up, cam.tanY, ...cam.fwd, clock,
      ...light.sun, light.night, ...light.sunColor, light.exposure, ...light.skyTop, cam.focus,
      ...light.skyLow, nsh, targets.w, targets.h, canvas.width, canvas.height]);
    device.queue.writeBuffer(frameBuf, 0, frame);
    if (nb) device.queue.writeBuffer(boxBuf, 0, boxData, 0, nb * 8);
    if (ns) device.queue.writeBuffer(studBuf, 0, studData, 0, ns * 4);
    if (nsh) device.queue.writeBuffer(shadowBuf, 0, shadowData, 0, nsh * 8);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targets.hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: targets.depth.createView(), depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, bind);
    pass.setPipeline(tracePipe);
    pass.draw(3);
    if (nb) { pass.setPipeline(boxPipe); pass.draw(36, nb); }
    if (ns) { pass.setPipeline(studPipe); pass.draw(108, ns); }
    pass.end();
    const post = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    post.setPipeline(postPipe);
    post.setBindGroup(0, targets.post);
    post.draw(3);
    post.end();
    device.queue.submit([encoder.finish()]);
    return cam;
  }

  if (query.has('film')) {
    window.film = {
      async draw(t, o) { const cam = draw(t, o); await device.queue.onSubmittedWorkDone(); return cam; },
      bricks: city.list.length,
      cameraFrom: o => cameraFrom(o, canvas.width / canvas.height),
    };
    document.title = 'ready';
    return;
  }
  if (fixedTime !== null) {
    draw(fixedTime);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  const start = performance.now();
  let frames = 0, slow = 0, last = start;
  const loop = now => {
    const dt = now - last;
    last = now;
    if (quality !== 'low' && ++frames > 30 && frames < 200 && dt > 40 && ++slow > 40) { quality = 'low'; targets.w = 0; resize(); }
    draw((now - start) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
