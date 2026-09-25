const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

function settings(quality) {
  const low = quality === 'low';
  return {
    count: low ? 131072 : 1048576,
    segments: low ? 2 : 4,
    windRes: low ? 64 : 128,
    maxRows: low ? 540 : 1080,
    radius: low ? 3 : 4,
    leaves: 64,
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
  let scene = createScene(device, module, format, settings(quality));

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  addEventListener('resize', resize);

  if (fixedTime !== null) {
    scene.draw(context, fixedTime);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let frame = 0, slowFrames = 0, last = performance.now();
  const start = last;
  const loop = now => {
    const dt = now - last;
    last = now;
    if (quality !== 'low' && frame > 30 && frame < 150 && dt > 45 && ++slowFrames > 40) {
      quality = 'low';
      scene.destroy();
      scene = createScene(device, module, format, settings(quality));
    }
    scene.draw(context, (now - start) / 1000);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createScene(device, module, format, cfg) {
  const T = GPUTextureUsage;
  const uniforms = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const blades = device.createBuffer({ size: cfg.count * 32, usage: GPUBufferUsage.STORAGE });
  const wind = device.createBuffer({ size: cfg.windRes * cfg.windRes * 16, usage: GPUBufferUsage.STORAGE });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const compute = entryPoint => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
  const growPipe = compute('grow');
  const blowPipe = compute('blow');

  const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: V | F, buffer: {} },
    { binding: 3, visibility: V, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
  ] });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const scenePipe = (vs, fs, topology = 'triangle-list', writeDepth = true) => device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: vs },
    fragment: { module, entryPoint: fs, targets: [{ format: 'rgba16float' }] },
    primitive: { topology },
    depthStencil: { format: 'depth32float', depthWriteEnabled: writeDepth, depthCompare: writeDepth ? 'less' : 'always' },
  });
  const skyPipe = scenePipe('vsFull', 'fsSky', 'triangle-list', false);
  const hillPipe = scenePipe('vsHill', 'fsScene');
  const treePipe = scenePipe('vsTree', 'fsScene');
  const grassPipe = scenePipe('vsGrass', 'fsScene', 'triangle-strip');
  const fullPipe = (fs, targetFormat) => device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: fs, targets: [{ format: targetFormat }] },
  });
  const paintPipe = fullPipe('fsPaint', 'rgba16float');
  const paperPipe = fullPipe('fsPaper', format);

  const bind = (groupLayout, resources) => device.createBindGroup({
    layout: groupLayout,
    entries: Object.entries(resources).map(([binding, resource]) => ({ binding: Number(binding), resource })),
  });
  const growBind = bind(growPipe.getBindGroupLayout(0), { 0: { buffer: uniforms }, 1: { buffer: blades } });
  const blowBind = bind(blowPipe.getBindGroupLayout(0), { 0: { buffer: uniforms }, 2: { buffer: wind } });
  const sceneBind = bind(layout, { 0: { buffer: uniforms }, 3: { buffer: blades }, 4: { buffer: wind } });

  let target = null;
  function targetFor(width, height) {
    const rows = Math.min(height, cfg.maxRows), cols = Math.max(1, Math.round(rows * width / height));
    if (target && target.cols === cols && target.rows === rows) return target;
    if (target) [target.color, target.depth, target.painted].forEach(t => t.destroy());
    const texture = (texFormat, usage) => device.createTexture({ size: [cols, rows], format: texFormat, usage });
    const color = texture('rgba16float', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    const depth = texture('depth32float', T.RENDER_ATTACHMENT);
    const painted = texture('rgba16float', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    const paint = bind(paintPipe.getBindGroupLayout(0), { 0: { buffer: uniforms }, 5: color.createView() });
    const paper = bind(paperPipe.getBindGroupLayout(0), { 0: { buffer: uniforms }, 5: painted.createView(), 6: sampler });
    target = { cols, rows, color, depth, painted, paint, paper };
    return target;
  }

  const data = new ArrayBuffer(48);
  const f32 = new Float32Array(data), u32 = new Uint32Array(data);
  u32.set([cfg.count, cfg.windRes, cfg.segments], 2);
  f32[5] = cfg.radius;
  let grown = false;

  function draw(context, time) {
    const texture = context.getCurrentTexture();
    const tg = targetFor(texture.width, texture.height);
    f32[0] = time;
    f32[1] = tg.cols / tg.rows;
    f32.set([texture.width, texture.height, tg.cols, tg.rows], 6);
    device.queue.writeBuffer(uniforms, 0, data);

    const encoder = device.createCommandEncoder();
    const cp = encoder.beginComputePass();
    if (!grown) {
      cp.setPipeline(growPipe);
      cp.setBindGroup(0, growBind);
      cp.dispatchWorkgroups(cfg.count / 256);
      grown = true;
    }
    cp.setPipeline(blowPipe);
    cp.setBindGroup(0, blowBind);
    cp.dispatchWorkgroups(cfg.windRes / 8, cfg.windRes / 8);
    cp.end();

    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: tg.color.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: tg.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    rp.setBindGroup(0, sceneBind);
    rp.setPipeline(skyPipe);
    rp.draw(3);
    rp.setPipeline(hillPipe);
    rp.draw(6 * 160 * 160);
    rp.setPipeline(treePipe);
    rp.draw(6 * 14 * 9, 3 + cfg.leaves);
    rp.setPipeline(grassPipe);
    rp.draw(2 * cfg.segments + 1, cfg.count);
    rp.end();

    const fullscreen = (view, pipe, group) => {
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    };
    fullscreen(tg.painted.createView(), paintPipe, tg.paint);
    fullscreen(texture.createView(), paperPipe, tg.paper);
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => {
    [uniforms, blades, wind].forEach(b => b.destroy());
    if (target) [target.color, target.depth, target.painted].forEach(t => t.destroy());
  };
  return { draw, destroy };
}

main();
