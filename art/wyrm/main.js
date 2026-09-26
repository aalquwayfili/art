const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const PERIOD = 24;
const MAX_CONES = 80, MAX_PANELS = 12, GROUPS = 6;
const SUN = norm([0.05, 0.19, -1]);
const EYE = [-2, -28, 140];
const LOOK = [-2, -2, 0];
const TAU = 2 * Math.PI;

function settings(quality) {
  return quality === 'low'
    ? { noise: 64, rows: 300, sea: 34, mist: 26, dragon: 72, rays: 28 }
    : { noise: 128, rows: 540, sea: 64, mist: 44, dragon: 120, rays: 56 };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { return mul(a, 1 / Math.hypot(...a)); }
function rotate(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}
function around(p, pivot, axis, angle) { return add(pivot, rotate(sub(p, pivot), axis, angle)); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const GIRTH = [[0, 0.72], [0.1, 0.9], [0.2, 1.45], [0.28, 2.2], [0.37, 2.15], [0.46, 1.65], [0.6, 0.95], [0.8, 0.42], [1, 0.08]];
function girth(s) {
  let k = 0;
  while (GIRTH[k + 1][0] < s) k++;
  const [s0, r0] = GIRTH[k], [s1, r1] = GIRTH[k + 1];
  return r0 + (r1 - r0) * smooth(0, 1, (s - s0) / (s1 - s0));
}

function dragon(t) {
  const s = (t % PERIOD) / PERIOD;
  const w = Math.min(((t % 12) / 12) / 0.42, 1);
  const beat = w < 1 ? Math.sin(TAU * w) * (1 - Math.cos(TAU * w)) / 2 : 0;
  const wl = Math.min(Math.max(((t % 12) / 12 - 0.035) / 0.42, 0), 1);
  const handBeat = wl > 0 && wl < 1 ? Math.sin(TAU * wl) * (1 - Math.cos(TAU * wl)) / 2 : 0;
  const fold = Math.max(beat, 0) / 0.65;

  const centre = [0, 3.5 * Math.sin(TAU * s + 0.5) - 1.2 * beat, 0];
  const F = norm([0.75, 0.03, -0.66]);
  const roll = -0.55 + 0.06 * Math.sin(TAU * s + 1.3);
  const U = rotate(norm(sub([0, 1, 0], mul(F, F[1]))), F, roll);
  const S = cross(F, U);
  const at = (x, y, z) => add(centre, add(add(mul(F, x), mul(U, y)), mul(S, z)));

  const spine = [];
  for (let i = 0; i < 32; i++) {
    const u = i / 31;
    const lift = 2.4 * (1 - smooth(0, 0.3, u)) - 1.6 * smooth(0.42, 0.8, u) + 1.4 * smooth(0.8, 1, u);
    const y = lift + (0.25 + 1.5 * u * u) * Math.sin(TAU * t / 12 - 6.5 * u) + 0.5 * beat * (1 - u);
    const z = (0.3 + 2.6 * u * u) * Math.sin(TAU * s - 5 * u);
    spine.push([at(17 - 58 * u, y, z), girth(u)]);
  }
  const spineAt = u => {
    const f = u * 31, i = Math.min(Math.floor(f), 30), k = f - i;
    return add(mul(spine[i][0], 1 - k), mul(spine[i + 1][0], k));
  };
  const tangentAt = u => norm(sub(spineAt(Math.max(u - 0.02, 0)), spineAt(Math.min(u + 0.02, 1))));

  const cones = [[], [], [], [], [], []];
  const panels = [[], [], [], [], [], []];
  const cone = (g, a, ra, b, rb) => cones[g].push([a, ra, b, rb]);

  for (let i = 0; i < 31; i++) cone(i < 15 ? 1 : 2, spine[i][0], spine[i][1], spine[i + 1][0], spine[i + 1][1]);

  const nape = spine[0][0];
  const d = norm(add(norm(sub(nape, spine[2][0])), mul(U, -0.3)));
  const hu = norm(sub(U, mul(d, dot(U, d))));
  const hs = cross(d, hu);
  const head = (x, y, z) => add(nape, mul(add(add(mul(d, x), mul(hu, y)), mul(hs, z)), 1.3));
  const headCone = (a, ra, b, rb) => cone(0, a, ra * 1.3, b, rb * 1.3);
  headCone(head(0, 0.1, 0), 0.8, head(2.0, 0.3, 0), 0.72);
  headCone(head(2.0, 0.3, 0), 0.72, head(5.0, -0.1, 0), 0.3);
  headCone(head(0.6, -0.45, 0), 0.52, head(4.6, -0.55, 0), 0.2);
  for (const side of [-1, 1]) {
    headCone(head(1.3, 0.6, 0.42 * side), 0.3, head(-1.3, 1.5, 0.95 * side), 0.14);
    headCone(head(-1.3, 1.5, 0.95 * side), 0.14, head(-3.2, 1.25, 1.25 * side), 0.03);
    headCone(head(0.3, -0.25, 0.6 * side), 0.2, head(-1.3, -0.7, 1.15 * side), 0.04);
  }

  for (let j = 0; j < 14; j++) {
    const u = 0.05 + j * 0.05;
    const base = spineAt(u), tan = tangentAt(u), r = girth(u);
    const up = norm(sub(U, mul(tan, dot(U, tan))));
    const size = 0.5 + 0.8 * Math.sin(Math.PI * Math.min(u / 0.6, 1));
    cone(3, add(base, mul(up, r * 0.8)), 0.22, add(add(base, mul(up, r + size)), mul(tan, -0.9 * size)), 0.02);
  }
  for (const side of [-1, 1]) {
    const tan = tangentAt(0.46);
    const hip = add(add(spineAt(0.46), mul(S, 1.2 * side)), mul(U, -0.6));
    const knee = add(add(hip, mul(tan, -2.4)), mul(U, -1.3));
    const foot = add(add(knee, mul(tan, -2.6)), mul(U, 0.3));
    cone(3, hip, 1.0, knee, 0.55);
    cone(3, knee, 0.55, foot, 0.28);
    cone(3, foot, 0.28, add(add(foot, mul(tan, -1.1)), mul(U, -0.35)), 0.1);
  }

  for (const side of [-1, 1]) {
    const g = side < 0 ? 4 : 5;
    const O = mul(S, side);
    const root = add(add(spineAt(0.29), mul(U, 0.9)), mul(O, 1.3));
    const flank = add(add(spineAt(0.49), mul(U, 0.2)), mul(O, 1.0));
    const flat = (base, x, z) => add(base, add(mul(F, x), mul(O, z)));
    const elbow = flat(root, -1.2 - 1.6 * fold, 7.0 - 1.2 * fold);
    const wrist = flat(elbow, 1.8 - 4.5 * fold, 8.5 - 2.6 * fold);
    const tips = [[-0.12, 17], [0.42, 15], [0.95, 13], [1.5, 11.5]].map(([a, len]) => {
      const ang = a * (1 - 0.35 * fold) + 0.75 * fold;
      return flat(wrist, -Math.sin(ang) * len * (1 - 0.15 * fold), Math.cos(ang) * len * (1 - 0.15 * fold));
    });
    const armUp = 0.18 + 0.05 * Math.sin(TAU * s) + 0.85 * beat;
    const handUp = armUp + 0.1 + 0.55 * (handBeat - beat);
    const raise = (p, pivot, angle) => around(p, pivot, F, -side * angle);
    const hand = tips.map(p => raise(p, wrist, handUp - armUp));
    const [E, W] = [raise(elbow, root, armUp), raise(wrist, root, armUp)];
    const T = hand.map(p => raise(p, root, armUp));
    cone(g, root, 0.7, E, 0.48);
    cone(g, E, 0.48, W, 0.34);
    cone(g, W, 0.3, add(W, add(mul(F, 1.3), mul(O, 0.2))), 0.03);
    T.forEach((tip, i) => cone(g, W, 0.3 - 0.03 * i, tip, 0.05));
    const panel = (a, b, c, sag) => panels[g].push([a, b, c, sag]);
    panel(W, T[0], T[1], 0.16);
    panel(W, T[1], T[2], 0.15);
    panel(W, T[2], T[3], 0.14);
    panel(W, T[3], flank, 0.2);
    panel(E, W, flank, 0);
    panel(root, E, flank, 0);
  }
  return { cones, panels };
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

  let quality = query.get('quality') || (isSoftware(adapter) && fixedTime === null ? 'low' : 'default');
  let cfg = settings(quality);
  const piece = createPiece(device, module, format, cfg.noise);

  if (fixedTime !== null) {
    piece.draw(context, fixedTime, cfg);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let frame = 0, slowFrames = 0, last = performance.now();
  const start = last;
  const loop = now => {
    if (quality !== 'low' && frame > 30 && frame < 150 && now - last > 45 && ++slowFrames > 40) {
      quality = 'low';
      cfg = settings(quality);
    }
    last = now;
    piece.draw(context, (now - start) / 1000, cfg);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createPiece(device, module, format, noiseSize) {
  const FRAME_FLOATS = 44 + GROUPS * 12 + MAX_CONES * 8 + MAX_PANELS * 20;
  const frameBuf = device.createBuffer({ size: FRAME_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const noise = device.createTexture({
    size: [noiseSize, noiseSize, noiseSize], dimension: '3d', format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const repeat = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
  const clamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const compute = entryPoint => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
  const noisePipe = compute('buildNoise');
  const scenePipe = compute('renderScene');
  const presentPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPresent', targets: [{ format }] },
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(noisePipe);
  pass.setBindGroup(0, device.createBindGroup({ layout: noisePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: noise.createView() }] }));
  pass.dispatchWorkgroups(noiseSize / 4, noiseSize / 4, noiseSize / 4);
  pass.end();
  device.queue.submit([encoder.finish()]);

  let target = null;
  function sceneTarget(w, h) {
    if (target && target.w === w && target.h === h) return target;
    if (target) target.texture.destroy();
    const texture = device.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    const sceneBind = device.createBindGroup({
      layout: scenePipe.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: { buffer: frameBuf } }, { binding: 2, resource: noise.createView() },
        { binding: 3, resource: repeat }, { binding: 4, resource: texture.createView() },
      ],
    });
    const presentBind = device.createBindGroup({
      layout: presentPipe.getBindGroupLayout(0),
      entries: [{ binding: 1, resource: { buffer: frameBuf } }, { binding: 5, resource: texture.createView() }, { binding: 6, resource: clamp }],
    });
    target = { w, h, texture, sceneBind, presentBind };
    return target;
  }

  const data = new Float32Array(FRAME_FLOATS);

  function draw(context, seconds, cfg) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const h = cfg.rows, w = Math.max(1, Math.round(h * cw / ch));
    const tg = sceneTarget(w, h);

    const t = seconds % PERIOD, s = t / PERIOD;
    const eye = add(EYE, [2.5 * Math.sin(TAU * s), 1.5 * Math.sin(TAU * s + 2), 0]);
    const fwd = norm(sub(LOOK, eye));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const tanX = Math.max(0.3 * cw / ch * 1.0, 0.34), tanY = tanX * ch / cw;
    const sunUv = [0.5 + 0.5 * dot(SUN, right) / dot(SUN, fwd) / tanX, 0.5 - 0.5 * dot(SUN, up) / dot(SUN, fwd) / tanY];

    data.fill(0);
    data.set([...eye, t, ...right, tanX, ...up, tanY, ...fwd, 2 * tanY / h, ...SUN, s,
      s, 0, 0, cfg.sea, s, 0, 0, cfg.mist, 3 * s, 0, s, cfg.dragon, ...sunUv, w, h, cw, ch, cfg.rays, s]);

    const { cones, panels } = dragon(t);
    let c0 = 0, p0 = 0, bound = null;
    for (let g = 0; g < GROUPS; g++) {
      const pts = cones[g].flatMap(([a, ra, b, rb]) => [[a, ra], [b, rb]]).concat(panels[g].flatMap(([a, b, c]) => [[a, 0.1], [b, 0.1], [c, 0.1]]));
      const centre = mul(pts.reduce((m, [p]) => add(m, p), [0, 0, 0]), 1 / pts.length);
      const radius = Math.max(...pts.map(([p, r]) => Math.hypot(...sub(p, centre)) + r)) + 0.3;
      const k = [0.35, 0.9, 0.6, 0.35, 0.2, 0.2][g];
      data.set([...centre, radius, c0, c0 + cones[g].length, p0, p0 + panels[g].length, k], 44 + g * 12);
      cones[g].forEach(([a, ra, b, rb], i) => data.set([...a, ra, ...b, rb], 44 + GROUPS * 12 + (c0 + i) * 8));
      panels[g].forEach(([a, b, c, sag], i) => data.set(panelData(a, b, c, sag), 44 + GROUPS * 12 + MAX_CONES * 8 + (p0 + i) * 20));
      c0 += cones[g].length;
      p0 += panels[g].length;
      bound = bound ? merge(bound, [centre, radius]) : [centre, radius];
    }
    data.set([...bound[0], bound[1]], 40);
    device.queue.writeBuffer(frameBuf, 0, data);

    const encoder = device.createCommandEncoder();
    const cp = encoder.beginComputePass();
    cp.setPipeline(scenePipe);
    cp.setBindGroup(0, tg.sceneBind);
    cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    cp.end();
    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(presentPipe);
    rp.setBindGroup(0, tg.presentBind);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  return { draw };
}

function panelData(a, b, c, sag) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  let cut = [0, 0, 0, -1];
  if (sag > 0) {
    const L = Math.hypot(...sub(c, b)), depth = sag * L, R = (L * L / 4 + depth * depth) / (2 * depth);
    const mid = mul(add(b, c), 0.5), e = norm(sub(c, b));
    let out = sub(mid, a);
    out = norm(sub(out, mul(e, dot(out, e))));
    cut = [...add(mid, mul(out, R - depth)), R];
  }
  return [...a, 0, ...b, 0, ...c, 0, ...cut, ...n, 0];
}

function merge([c1, r1], [c2, r2]) {
  const d = Math.hypot(...sub(c2, c1));
  if (d + r2 <= r1) return [c1, r1];
  if (d + r1 <= r2) return [c2, r2];
  const r = (d + r1 + r2) / 2;
  return [add(c1, mul(sub(c2, c1), (r - r1) / d)), r];
}

main();
