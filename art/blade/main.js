const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const LOOP = 20;
const FAR = 3.5;
const NEAR = 0.6;
const HALF_FOV = Math.tan(12 * Math.PI / 180);

function settings(quality) {
  const low = quality === 'low';
  return { scale: low ? 0.6 : 1, aa: low ? 1 : 2, samples: low ? 4 : 10, shadowSteps: low ? 20 : 48, maxDpr: low ? 1 : 1.5 };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

function camera(seconds) {
  const phase = (((seconds % LOOP) + LOOP) % LOOP) / LOOP;
  const push = Math.sin(Math.PI * phase) ** 3;
  const dist = FAR * (NEAR / FAR) ** push;
  const k = (FAR - dist) / (FAR - NEAR);
  const target = [0, 0.7 - 0.25 * k, 0];
  const elevation = 0.08 + 0.14 * k;
  const azimuth = -0.12 + 0.3 * k;
  const eye = [
    target[0] + dist * Math.sin(azimuth) * Math.cos(elevation),
    target[1] + dist * Math.sin(elevation),
    target[2] + dist * Math.cos(azimuth) * Math.cos(elevation),
  ];
  return { eye, target, turn: 2 * Math.PI * phase + 0.7 };
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
  const frameBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const tracePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsTrace', targets: [{ format: 'rgba16float' }] },
  });
  const presentPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPresent', targets: [{ format }] },
  });
  const traceBind = device.createBindGroup({ layout: tracePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: frameBuf } }] });

  let target = null;
  function traceTarget(w, h) {
    if (target && target.w === w && target.h === h) return target;
    if (target) target.texture.destroy();
    const texture = device.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const bind = device.createBindGroup({
      layout: presentPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameBuf } },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: sampler },
      ],
    });
    target = { w, h, texture, bind };
    return target;
  }

  const frameData = new Float32Array(16);

  function draw(context, seconds) {
    const dpr = Math.min(devicePixelRatio || 1, cfg.maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = traceTarget(Math.max(1, Math.round(w * cfg.scale)), Math.max(1, Math.round(h * cfg.scale)));

    const { eye, target: at, turn } = camera(seconds);
    frameData.set([t.w, t.h, w, h, ...eye, HALF_FOV, ...at, turn, cfg.aa, cfg.samples, cfg.shadowSteps, seconds]);
    device.queue.writeBuffer(frameBuf, 0, frameData);

    const encoder = device.createCommandEncoder();
    const tracePass = encoder.beginRenderPass({
      colorAttachments: [{ view: t.texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    tracePass.setPipeline(tracePipe);
    tracePass.setBindGroup(0, traceBind);
    tracePass.draw(3);
    tracePass.end();

    const presentPass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    presentPass.setPipeline(presentPipe);
    presentPass.setBindGroup(0, t.bind);
    presentPass.draw(3);
    presentPass.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => { frameBuf.destroy(); if (target) target.texture.destroy(); };
  return { draw, destroy };
}

main();
