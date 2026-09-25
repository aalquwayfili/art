const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

function settings(quality) {
  const low = quality === 'low';
  return {
    count: low ? 8192 : 49152,
    rows: low ? 216 : 288,
    shadowSize: low ? 1024 : 2048,
    core: low ? 32 : 64,
    grid: low ? 128 : 320,
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
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const sceneU = device.createBuffer({ size: 48, usage: UNIFORM });
  const lightU = device.createBuffer({ size: 48, usage: UNIFORM });
  const plates = device.createBuffer({ size: cfg.count * 64, usage: GPUBufferUsage.STORAGE });
  const shadowMap = device.createTexture({ size: [cfg.shadowSize, cfg.shadowSize], format: 'depth32float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  const noShadow = device.createTexture({ size: [1, 1], format: 'depth32float', usage: T.TEXTURE_BINDING });
  const sampler = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

  const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: V | F, buffer: {} },
    { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: F, texture: { sampleType: 'depth' } },
    { binding: 3, visibility: F, sampler: { type: 'comparison' } },
  ] });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const scenePipe = (vs, fs, writeDepth = true) => device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: vs },
    fragment: { module, entryPoint: fs, targets: [{ format: 'rgba16float' }] },
    depthStencil: { format: 'depth32float', depthWriteEnabled: writeDepth, depthCompare: writeDepth ? 'less' : 'always' },
  });
  const shadowPipe = vs => device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: vs },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 },
  });
  const skyPipe = scenePipe('vsFull', 'fsSky', false);
  const groundPipe = scenePipe('vsGround', 'fsLit');
  const corePipe = scenePipe('vsCore', 'fsLit');
  const platePipe = scenePipe('vsPlate', 'fsLit');
  const coreShadowPipe = shadowPipe('vsCore');
  const plateShadowPipe = shadowPipe('vsPlate');
  const placePipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'placePlates' } });
  const postPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPost', targets: [{ format }] },
  });

  const entries = list => list.map((resource, binding) => ({ binding, resource }));
  const sceneBind = device.createBindGroup({ layout, entries: entries([{ buffer: sceneU }, { buffer: plates }, shadowMap.createView(), sampler]) });
  const lightBind = device.createBindGroup({ layout, entries: entries([{ buffer: lightU }, { buffer: plates }, noShadow.createView(), sampler]) });
  const placeBind = device.createBindGroup({
    layout: placePipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: sceneU } }, { binding: 5, resource: { buffer: plates } }],
  });

  let target = null;
  function targetFor(width, height) {
    const rows = cfg.rows, cols = Math.max(1, Math.round(rows * width / height));
    if (target && target.cols === cols && target.width === width && target.height === height) return target;
    if (target) { target.color.destroy(); target.depth.destroy(); }
    const color = device.createTexture({ size: [cols, rows], format: 'rgba16float', usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    const depth = device.createTexture({ size: [cols, rows], format: 'depth32float', usage: T.RENDER_ATTACHMENT });
    const post = device.createBindGroup({
      layout: postPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: sceneU } }, { binding: 4, resource: color.createView() }],
    });
    target = { cols, rows, width, height, color, depth, post };
    return target;
  }

  const data = new ArrayBuffer(48);
  const f32 = new Float32Array(data), u32 = new Uint32Array(data);
  const coreVerts = 12 * cfg.core * cfg.core, groundVerts = 6 * cfg.grid * cfg.grid;

  function draw(context, time) {
    const texture = context.getCurrentTexture();
    const tg = targetFor(texture.width, texture.height);
    f32.set([time, tg.cols / tg.rows, 0]);
    u32[3] = cfg.count;
    f32.set([tg.cols, tg.rows, texture.width, texture.height], 4);
    u32[8] = cfg.core;
    u32[9] = cfg.grid;
    device.queue.writeBuffer(sceneU, 0, data);
    f32[2] = 1;
    device.queue.writeBuffer(lightU, 0, data);

    const encoder = device.createCommandEncoder();
    const cp = encoder.beginComputePass();
    cp.setPipeline(placePipe);
    cp.setBindGroup(0, placeBind);
    cp.dispatchWorkgroups(Math.ceil(cfg.count / 64));
    cp.end();

    const sp = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowMap.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    sp.setBindGroup(0, lightBind);
    sp.setPipeline(coreShadowPipe);
    sp.draw(coreVerts);
    sp.setPipeline(plateShadowPipe);
    sp.draw(72, cfg.count);
    sp.end();

    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: tg.color.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: tg.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    rp.setBindGroup(0, sceneBind);
    rp.setPipeline(skyPipe);
    rp.draw(3);
    rp.setPipeline(groundPipe);
    rp.draw(groundVerts);
    rp.setPipeline(corePipe);
    rp.draw(coreVerts);
    rp.setPipeline(platePipe);
    rp.draw(72, cfg.count);
    rp.end();

    const pp = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pp.setPipeline(postPipe);
    pp.setBindGroup(0, tg.post);
    pp.draw(3);
    pp.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => {
    [sceneU, lightU, plates, shadowMap, noShadow].forEach(r => r.destroy());
    if (target) { target.color.destroy(); target.depth.destroy(); }
  };
  return { draw, destroy };
}

main();
