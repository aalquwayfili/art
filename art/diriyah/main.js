const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const LOOP_SECONDS = 30;
const GRID = [128, 64, 128];
const CENTRE = [62, 19, 62];
const VIEW_HEIGHT = 118;
const MOON = [0.74, 0.62, 0.26];
const SUN_TURN = -1.0;

function settings(quality) {
  return { rows: quality === 'low' ? 180 : 320 };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

const KEYS = [
  [0.0, [1.0, 0.9, 0.74], [0.5, 0.5, 0.6], [0.5, 0.66, 0.8], [0.9, 0.85, 0.74]],
  [0.28, [1.0, 0.66, 0.36], [0.42, 0.36, 0.48], [0.42, 0.5, 0.72], [0.97, 0.7, 0.46]],
  [0.4, [0.95, 0.4, 0.22], [0.46, 0.36, 0.5], [0.22, 0.22, 0.44], [0.86, 0.46, 0.38]],
  [0.5, [0.3, 0.36, 0.56], [0.2, 0.2, 0.34], [0.07, 0.08, 0.19], [0.27, 0.21, 0.37]],
  [0.62, [0.34, 0.42, 0.64], [0.12, 0.14, 0.26], [0.03, 0.04, 0.1], [0.1, 0.12, 0.24]],
  [0.8, [0.34, 0.42, 0.64], [0.12, 0.14, 0.26], [0.03, 0.04, 0.1], [0.1, 0.12, 0.24]],
  [0.88, [1.0, 0.62, 0.42], [0.26, 0.25, 0.34], [0.34, 0.44, 0.7], [0.95, 0.74, 0.6]],
  [1.0, [1.0, 0.9, 0.74], [0.5, 0.5, 0.6], [0.5, 0.66, 0.8], [0.9, 0.85, 0.74]],
];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function lightAt(s) {
  let k = 0;
  while (KEYS[k + 1][0] < s) k++;
  const [s0, ...a] = KEYS[k], [s1, ...b] = KEYS[k + 1];
  const f = smooth(0, 1, (s - s0) / (s1 - s0));
  const [lightColor, ambient, skyTop, skyLow] = a.map((c, i) => c.map((x, j) => x + (b[i][j] - x) * f));
  const phi = s < 0.4 ? 2 + (Math.PI - 2) * s / 0.4 : s < 0.8 ? Math.PI * (1 + (s - 0.4) / 0.4) : 2 * Math.PI + 2 * (s - 0.8) / 0.2;
  const c = Math.cos(SUN_TURN), sn = Math.sin(SUN_TURN);
  let sun = [c * Math.cos(phi) - sn * 0.5, 0.85 * Math.sin(phi), sn * Math.cos(phi) + c * 0.5];
  const len = Math.hypot(...sun);
  sun = sun.map(x => x / len);
  const strength = smooth(0.0, 0.12, Math.abs(sun[1]));
  if (sun[1] < 0) sun = MOON;
  const night = smooth(0.3, 0.52, s) * (1 - smooth(0.8, 0.87, s));
  const stars = smooth(0.42, 0.56, s) * (1 - smooth(0.8, 0.86, s));
  return { sun, lightColor: lightColor.map(x => x * strength), ambient, skyTop, skyLow, night, stars };
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
  const piece = createPiece(device, module, format);
  let cfg = settings(quality);

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

function createPiece(device, module, format) {
  const frameBuf = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const voxels = device.createTexture({
    size: GRID, dimension: '3d', format: 'r32uint',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const compute = entryPoint => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
  const buildPipe = compute('buildVoxels');
  const tracePipe = compute('tracePixels');
  const presentPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPresent', targets: [{ format }] },
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(buildPipe);
  pass.setBindGroup(0, device.createBindGroup({ layout: buildPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: voxels.createView() }] }));
  pass.dispatchWorkgroups(GRID[0] / 4, GRID[1] / 4, GRID[2] / 4);
  pass.end();
  device.queue.submit([encoder.finish()]);

  let target = null;
  function pixelTarget(w, h) {
    if (target && target.w === w && target.h === h) return target;
    if (target) target.texture.destroy();
    const texture = device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    const traceBind = device.createBindGroup({
      layout: tracePipe.getBindGroupLayout(0),
      entries: [{ binding: 1, resource: voxels.createView() }, { binding: 2, resource: { buffer: frameBuf } }, { binding: 3, resource: texture.createView() }],
    });
    const presentBind = device.createBindGroup({
      layout: presentPipe.getBindGroupLayout(0),
      entries: [{ binding: 2, resource: { buffer: frameBuf } }, { binding: 4, resource: texture.createView() }],
    });
    target = { w, h, texture, traceBind, presentBind };
    return target;
  }

  const frameData = new Float32Array(40);

  function draw(context, seconds, cfg) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const h = cfg.rows, w = Math.max(1, Math.round(h * cw / ch));
    const t = pixelTarget(w, h);

    const s = (seconds / LOOP_SECONDS) % 1;
    const yaw = Math.PI / 4 + 0.32 * Math.sin(2 * Math.PI * s);
    const pitch = 0.52;
    const forward = [-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
    const scale = VIEW_HEIGHT / h * Math.max(1, 1.05 * h / w * 16 / 9 * 0.62);
    const right = [Math.cos(yaw) * scale, 0, -Math.sin(yaw) * scale];
    const up = [-Math.sin(pitch) * Math.sin(yaw) * scale, Math.cos(pitch) * scale, -Math.sin(pitch) * Math.cos(yaw) * scale];
    const L = lightAt(s);
    frameData.set([...right, seconds, ...up, yaw, ...forward, L.night, ...CENTRE, L.stars, ...L.sun, 0,
      ...L.lightColor, 0, ...L.ambient, 0, ...L.skyTop, 0, ...L.skyLow, 0, w, h, cw, ch]);
    device.queue.writeBuffer(frameBuf, 0, frameData);

    const encoder = device.createCommandEncoder();
    const cp = encoder.beginComputePass();
    cp.setPipeline(tracePipe);
    cp.setBindGroup(0, t.traceBind);
    cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    cp.end();
    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(presentPipe);
    rp.setBindGroup(0, t.presentBind);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  return { draw };
}

main();
