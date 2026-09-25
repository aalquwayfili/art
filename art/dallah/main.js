const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const TURN_SECONDS = 30;
const BOIL_RATE = 4;
const PARTS = 6;
const TABLE = 5;

function settings(quality) {
  const low = quality === 'low';
  return { side: low ? 72 : 256, tamSize: low ? 256 : 512, tamMips: low ? 3 : 4, shadowSize: low ? 1024 : 2048, maxDpr: low ? 1 : 2 };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => a.map(x => x / Math.hypot(...a));
function lookAt(eye, at) {
  const z = normalize(sub(eye, at)), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0];
}
function ortho(half, near, far) {
  return [1 / half, 0, 0, 0, 0, 1 / half, 0, 0, 0, 0, 1 / (near - far), 0, 0, 0, near / (near - far), 1];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
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
  let piece = createPiece(device, module, format, settings(quality));

  if (fixedTime !== null) {
    piece.draw(context, fixedTime);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let frame = 0, slowFrames = 0, last = performance.now();
  const start = last;
  const loop = now => {
    if (quality !== 'low' && frame > 30 && frame < 150 && now - last > 45 && ++slowFrames > 40) {
      quality = 'low';
      piece.destroy();
      piece = createPiece(device, module, format, settings(quality));
    }
    last = now;
    piece.draw(context, (now - start) / 1000);
    frame++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createPiece(device, module, format, cfg) {
  const { side, tamSize, tamMips, shadowSize } = cfg;
  const vertexCount = PARTS * side * side;
  const quadIndices = 6 * (side - 1) * (side - 1);
  const uniform = size => device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const entries = list => Object.entries(list).map(([binding, resource]) => ({ binding: Number(binding), resource }));

  const frameBuf = uniform(256);
  const sideBuf = uniform(16);
  device.queue.writeBuffer(sideBuf, 0, new Uint32Array([side, 0, 0, 0]));
  const verts = device.createBuffer({ size: vertexCount * 48, usage: GPUBufferUsage.STORAGE });
  const indices = device.createBuffer({ size: PARTS * quadIndices * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX });
  const tam = device.createTexture({
    size: [tamSize, tamSize, 6], format: 'rgba8unorm', mipLevelCount: tamMips,
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const shadowMap = device.createTexture({ size: [shadowSize, shadowSize], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  const owned = [frameBuf, sideBuf, verts, indices, tam, shadowMap];

  const meshPipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'buildMesh' } });
  const tamPipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'buildTam' } });
  const shadowPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsShadow' },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const scenePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsScene' },
    fragment: { module, entryPoint: 'fsScene', targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }] },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const sketchPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsSketch', targets: [{ format }] },
  });

  const encoder = device.createCommandEncoder();
  const cp = encoder.beginComputePass();
  cp.setPipeline(meshPipe);
  cp.setBindGroup(0, device.createBindGroup({ layout: meshPipe.getBindGroupLayout(0), entries: entries({ 10: { buffer: sideBuf }, 11: { buffer: verts }, 12: { buffer: indices } }) }));
  cp.dispatchWorkgroups(Math.ceil(vertexCount / 64));
  cp.setPipeline(tamPipe);
  for (let mip = 0; mip < tamMips; mip++) {
    const size = tamSize >> mip;
    const info = uniform(16);
    owned.push(info);
    device.queue.writeBuffer(info, 0, new Uint32Array([size, 30, 2, 0]));
    const view = tam.createView({ dimension: '2d-array', baseMipLevel: mip, mipLevelCount: 1 });
    cp.setBindGroup(0, device.createBindGroup({ layout: tamPipe.getBindGroupLayout(0), entries: entries({ 13: { buffer: info }, 14: view }) }));
    cp.dispatchWorkgroups(Math.ceil(size / 8), Math.ceil(size / 8));
  }
  cp.end();
  device.queue.submit([encoder.finish()]);

  const shadowBind = device.createBindGroup({ layout: shadowPipe.getBindGroupLayout(0), entries: entries({ 0: { buffer: frameBuf }, 1: { buffer: verts } }) });
  const sceneBind = device.createBindGroup({
    layout: scenePipe.getBindGroupLayout(0),
    entries: entries({
      0: { buffer: frameBuf }, 1: { buffer: verts },
      2: shadowMap.createView(), 3: device.createSampler({ compare: 'less', minFilter: 'linear', magFilter: 'linear' }),
      4: tam.createView({ dimension: '2d-array' }),
      5: device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 4 }),
    }),
  });

  let targets = null;
  function screenTargets(w, h) {
    if (targets && targets.w === w && targets.h === h) return targets;
    if (targets) targets.list.forEach(t => t.destroy());
    const make = f => device.createTexture({ size: [w, h], format: f, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const geo = make('rgba16float'), ink = make('rgba16float'), depth = make('depth24plus');
    const bind = device.createBindGroup({ layout: sketchPipe.getBindGroupLayout(0), entries: entries({ 0: { buffer: frameBuf }, 6: geo.createView(), 7: ink.createView() }) });
    targets = { w, h, geo, ink, depth, bind, list: [geo, ink, depth] };
    return targets;
  }

  const eye = [2.3, 3.05, 6.5], at = [0.25, 0.98, 0.25];
  const view = lookAt(eye, at);
  const sun = normalize([-0.62, 0.78, 0.5]);
  const lightProj = multiply(ortho(2.6, 0.1, 14), lookAt(sun.map((x, i) => at[i] + 6 * x), at));
  const frameData = new Float32Array(64);

  function draw(context, seconds) {
    const dpr = Math.min(devicePixelRatio || 1, cfg.maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = screenTargets(w, h);
    const aspect = w / h, fovy = 2 * Math.atan(Math.tan(0.24) * Math.max(1, 1.15 / aspect));
    frameData.set(multiply(perspective(fovy, aspect, 0.1, 60), view), 0);
    frameData.set(lightProj, 16);
    frameData.set(view, 32);
    frameData.set([...eye, seconds], 48);
    frameData.set([...sun, 2 * Math.PI * seconds / TURN_SECONDS], 52);
    frameData.set([w, h, h / 720, Math.floor(seconds * BOIL_RATE)], 56);
    device.queue.writeBuffer(frameBuf, 0, frameData);

    const encoder = device.createCommandEncoder();
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowMap.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    shadowPass.setPipeline(shadowPipe);
    shadowPass.setBindGroup(0, shadowBind);
    shadowPass.setIndexBuffer(indices, 'uint32');
    shadowPass.drawIndexed(TABLE * quadIndices);
    shadowPass.end();

    const scenePass = encoder.beginRenderPass({
      colorAttachments: [
        { view: t.geo.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 1, 1000] },
        { view: t.ink.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
      depthStencilAttachment: { view: t.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    scenePass.setPipeline(scenePipe);
    scenePass.setBindGroup(0, sceneBind);
    scenePass.setIndexBuffer(indices, 'uint32');
    scenePass.drawIndexed(PARTS * quadIndices);
    scenePass.end();

    const sketchPass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    sketchPass.setPipeline(sketchPipe);
    sketchPass.setBindGroup(0, t.bind);
    sketchPass.draw(3);
    sketchPass.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => { owned.forEach(r => r.destroy()); if (targets) targets.list.forEach(r => r.destroy()); };
  return { draw, destroy };
}

main();
