const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const FPS = 60;
const PERIOD = 24;
const STEPS_PER_SUBMIT = 60;

function settings(quality) {
  const low = quality === 'low';
  return low ? { half: 12, far: -28, near: 11, segments: 10, shadow: 1024, dprCap: 1 }
             : { half: 32, far: -56, near: 12, segments: 16, shadow: 2048, dprCap: 2 };
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
    const dpr = Math.min(devicePixelRatio || 1, scene.dprCap);
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
      resize();
      frame = 0;
    }
    scene.advance(1);
    scene.draw(context);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function buildMeshes(segments) {
  const data = [];
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const tri = (a, b, c, out) => {
    const u = sub(b, a), v = sub(c, a);
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (len < 1e-9) return;
    const s = (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? -1 : 1) / len;
    n = n.map(x => x * s);
    data.push(...a, ...n, ...b, ...n, ...c, ...n);
  };
  const lathe = profile => {
    for (let k = 0; k + 1 < profile.length; k++) {
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      for (let s = 0; s < segments; s++) {
        const a0 = 2 * Math.PI * s / segments, a1 = 2 * Math.PI * (s + 1) / segments, am = 0.5 * (a0 + a1);
        const P = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)];
        const out = [(y1 - y0) * Math.cos(am), r0 - r1, (y1 - y0) * Math.sin(am)];
        tri(P(r0, y0, a0), P(r1, y1, a0), P(r1, y1, a1), out);
        tri(P(r0, y0, a0), P(r1, y1, a1), P(r0, y0, a1), out);
      }
    }
  };
  const box = (c, h, a) => {
    const corner = i => {
      const x = (i & 1 ? 1 : -1) * h[0], y = (i & 2 ? 1 : -1) * h[1], z = (i & 4 ? 1 : -1) * h[2];
      return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a), c[2] + z];
    };
    for (const [i, j, k, l] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
      const q = [i, j, k, l].map(corner);
      const mid = q.reduce((m, p) => m.map((v, n) => v + p[n] / 4), [0, 0, 0]);
      tri(q[0], q[1], q[2], sub(mid, c));
      tri(q[0], q[2], q[3], sub(mid, c));
    }
  };
  const ranges = [];
  const mesh = build => { const first = data.length / 6; build(); ranges.push([first, data.length / 6 - first]); };

  const base = [[0, 0], [0.34, 0], [0.34, 0.07], [0.28, 0.1], [0.22, 0.15], [0.2, 0.2], [0, 0.2]];
  mesh(() => {
    lathe(base);
    box([-0.03, 0.42, 0], [0.13, 0.25, 0.11], -0.22);
    box([0.12, 0.66, 0], [0.21, 0.085, 0.095], -0.55);
    box([-0.13, 0.6, 0], [0.045, 0.2, 0.05], -0.3);
    box([0.0, 0.8, 0], [0.04, 0.07, 0.08], -0.15);
  });
  mesh(() => {
    const head = [];
    for (let k = 0; k <= 6; k++) { const a = -0.8 + (Math.PI / 2 + 0.8) * k / 6; head.push([0.16 * Math.cos(a), 0.64 + 0.16 * Math.sin(a)]); }
    lathe([[0, 0], [0.33, 0], [0.33, 0.07], [0.26, 0.1], [0.2, 0.15], [0.12, 0.42], [0.2, 0.46], [0.2, 0.5], ...head]);
  });
  mesh(() => {
    lathe([[0, 0], [0.38, 0], [0.38, 0.09], [0.3, 0.13], [0.25, 0.19], [0.15, 0.85], [0.24, 0.9], [0.24, 0.95],
           [0.17, 0.99], [0.22, 1.22], [0.27, 1.27], [0.27, 1.31], [0, 1.31]]);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, r = 0.2;
      box([r * Math.cos(a), 1.39, r * Math.sin(a)], [0.035, 0.09, 0.035], 0);
    }
    box([0, 1.46, 0], [0.07, 0.07, 0.07], Math.PI / 4);
  });
  mesh(() => {
    const [x0, x1, z0, z1] = [-200, 200, -200, 200];
    tri([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [0, 1, 0]);
    tri([x0, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0]);
  });
  return { vertices: new Float32Array(data), ranges };
}

function buildArmy(cfg) {
  let seed = 7;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const kinds = [[], [], [[0, 0]], [[0, 0]]];
  for (let z = cfg.far; z <= cfg.near; z++) {
    for (let x = -cfg.half; x < cfg.half; x++) {
      if (Math.abs(x) <= 1 && z >= -1) continue;
      kinds[random() < 0.55 ? 0 : 1].push([x, z]);
    }
  }
  const all = kinds.flatMap((cells, kind) => cells.map(([x, z]) => [x, z, 0, 0, 0, 0, 0, kind]));
  return { data: new Float32Array(all.flat()), counts: kinds.map(k => k.length) };
}

function createScene(device, module, format, cfg) {
  const { vertices, ranges } = buildMeshes(cfg.segments);
  const army = buildArmy(cfg);
  const count = army.counts.reduce((a, b) => a + b);
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage) => device.createBuffer({ size, usage });

  const paramBuf = buffer(16, UNIFORM);
  const stepBuf = buffer(256 * STEPS_PER_SUBMIT, UNIFORM);
  const viewBuf = buffer(16, UNIFORM);
  const pieces = buffer(army.data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const vertexBuf = buffer(vertices.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const sunDepth = device.createTexture({ size: [cfg.shadow, cfg.shadow], format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const params = new ArrayBuffer(16);
  new Uint32Array(params, 0, 1).set([count]);
  new Float32Array(params, 4, 3).set([cfg.half, cfg.far, cfg.near]);
  device.queue.writeBuffer(paramBuf, 0, params);
  device.queue.writeBuffer(pieces, 0, army.data);
  device.queue.writeBuffer(vertexBuf, 0, vertices);

  const stepLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const stepPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [stepLayout] }),
    compute: { module, entryPoint: 'stepPieces' },
  });
  const V = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const meshLayout = device.createPipelineLayout({ bindGroupLayouts: [device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: V, buffer: { type: 'uniform' } }, { binding: 1, visibility: V, buffer: { type: 'uniform' } },
      { binding: 2, visibility: V, buffer: { type: 'read-only-storage' } }],
  })] });
  const vertexLayout = [{ arrayStride: 24, attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }];
  const scenePipe = device.createRenderPipeline({
    layout: meshLayout,
    vertex: { module, entryPoint: 'vsScene', buffers: vertexLayout },
    fragment: { module, entryPoint: 'fsScene', targets: [{ format: 'rgba16float' }, { format: 'rgba32float' }] },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const shadowPipe = device.createRenderPipeline({
    layout: meshLayout,
    vertex: { module, entryPoint: 'vsShadow', buffers: vertexLayout },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const sketchPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsSketch' },
    fragment: { module, entryPoint: 'fsSketch', targets: [{ format }] },
  });

  const entries = list => list.map((resource, binding) => ({ binding, resource }));
  const stepBind = device.createBindGroup({
    layout: stepLayout, entries: entries([{ buffer: paramBuf }, { buffer: stepBuf, size: 4 }, { buffer: pieces }]),
  });
  const meshBind = device.createBindGroup({
    layout: scenePipe.getBindGroupLayout(0), entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, { buffer: pieces }]),
  });

  let targets = null;
  const screenTargets = (w, h) => {
    if (targets && targets.w === w && targets.h === h) return targets;
    if (targets) targets.textures.forEach(t => t.destroy());
    const make = format => device.createTexture({ size: [w, h], format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const textures = [make('rgba16float'), make('rgba32float'), make('depth24plus')];
    const views = textures.map(t => t.createView());
    const bind = device.createBindGroup({
      layout: sketchPipe.getBindGroupLayout(0),
      entries: entries([{ buffer: paramBuf }, { buffer: viewBuf }, views[0], views[1], sunDepth.createView()]),
    });
    return (targets = { w, h, textures, views, bind });
  };

  const stepData = new Float32Array(64 * STEPS_PER_SUBMIT);
  const viewData = new Float32Array(4);
  const loopTime = step => (step / FPS) % PERIOD;
  const groups = Math.ceil(count / 64);
  let done = 0;

  function advance(steps) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(stepPipe);
    for (let s = 0; s < steps; s++) {
      stepData[s * 64] = loopTime(++done);
      pass.setBindGroup(0, stepBind, [s * 256]);
      pass.dispatchWorkgroups(groups);
    }
    pass.end();
    device.queue.writeBuffer(stepBuf, 0, stepData, 0, steps * 64);
    device.queue.submit([encoder.finish()]);
  }

  const drawPieces = (pass, withBoard) => {
    let first = 0;
    army.counts.forEach((n, kind) => {
      if (kind < 3 || withBoard) pass.draw(ranges[kind][1], n, ranges[kind][0], first);
      first += n;
    });
  };

  function draw(context) {
    const texture = context.getCurrentTexture();
    const { views, bind } = screenTargets(texture.width, texture.height);
    viewData.set([texture.width, texture.height, loopTime(done)]);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    const encoder = device.createCommandEncoder();

    const sp = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: sunDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    sp.setPipeline(shadowPipe);
    sp.setBindGroup(0, meshBind);
    sp.setVertexBuffer(0, vertexBuf);
    drawPieces(sp, false);
    sp.end();

    const target = view => ({ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] });
    const gp = encoder.beginRenderPass({
      colorAttachments: [target(views[0]), target(views[1])],
      depthStencilAttachment: { view: views[2], depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    gp.setPipeline(scenePipe);
    gp.setBindGroup(0, meshBind);
    gp.setVertexBuffer(0, vertexBuf);
    drawPieces(gp, true);
    gp.end();

    const rp = encoder.beginRenderPass({ colorAttachments: [target(texture.createView())] });
    rp.setPipeline(sketchPipe);
    rp.setBindGroup(0, bind);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => {
    [paramBuf, stepBuf, viewBuf, pieces, vertexBuf, sunDepth].forEach(b => b.destroy());
    if (targets) targets.textures.forEach(t => t.destroy());
  };
  return { advance, draw, destroy, dprCap: cfg.dprCap };
}

main();
