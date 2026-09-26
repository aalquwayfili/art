const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const LOOP = 26;
const EYE = [30, 3.5, 36];
const LOOK = [-2, 0, -3];

function settings(quality) {
  const low = quality === 'low';
  return { steps: low ? 110 : 200, shadowSteps: low ? 28 : 64, maxDpr: low ? 1 : 2 };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = a => a.map(x => x / Math.hypot(...a));

function camera(w, h) {
  const fwd = normalize([LOOK[0] - EYE[0], 0, LOOK[2] - EYE[2]]);
  const right = [-fwd[2], 0, fwd[0]];
  const up = [0, 1, 0];
  const pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 12.6]) {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      pts.push([sx * 13 + 3 * Math.cos(a), y, sz * 11 + 3 * Math.sin(a)]);
    }
  }
  for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) pts.push([-6 + dx, 16, -1.5 + dz]);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of pts) {
    const q = sub(p, EYE), z = dot(q, fwd);
    const x = dot(q, right) / z, y = dot(q, up) / z;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const focal = Math.min(0.82 * Math.min(w, 0.95 * h) / (x1 - x0), 0.56 * h / (y1 - y0));
  const shiftX = -focal * (x0 + x1) / 2;
  const shiftY = -focal * (y0 + y1) / 2;
  const unitsPerPx = Math.hypot(EYE[0] - LOOK[0], EYE[2] - LOOK[2]) / focal;
  const area = [w / 2, 0.5 * h, focal * (x1 - x0) / 2, focal * (y1 - y0) / 2];
  return { fwd, right, up, focal, shiftX, shiftY, unitsPerPx, area };
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
  const frameBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const entries = list => Object.entries(list).map(([binding, resource]) => ({ binding: Number(binding), resource }));

  const scenePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsScene', targets: [{ format: 'rgba32float' }, { format: 'rgba16float' }] },
  });
  const planPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPlan', targets: Array(4).fill({ format: 'rgba16float' }) },
  });
  const sketchPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsSketch', targets: [{ format }] },
  });
  const sceneBind = device.createBindGroup({ layout: scenePipe.getBindGroupLayout(0), entries: entries({ 0: { buffer: frameBuf } }) });

  let targets = null;
  function screenTargets(w, h) {
    if (targets && targets.w === w && targets.h === h) return targets;
    if (targets) targets.list.forEach(t => t.destroy());
    const make = f => device.createTexture({ size: [w, h], format: f, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const geo = make('rgba32float'), tone = make('rgba16float');
    const plan = [0, 1, 2, 3].map(() => make('rgba16float'));
    const planBind = device.createBindGroup({ layout: planPipe.getBindGroupLayout(0), entries: entries({ 0: { buffer: frameBuf }, 1: geo.createView(), 2: tone.createView() }) });
    const bind = device.createBindGroup({
      layout: sketchPipe.getBindGroupLayout(0),
      entries: entries({ 0: { buffer: frameBuf }, 3: plan[0].createView(), 4: plan[1].createView(), 5: plan[2].createView(), 6: plan[3].createView() }),
    });
    targets = { w, h, geo, tone, plan, planBind, bind, list: [geo, tone, ...plan], fresh: true };
    return targets;
  }

  const frameData = new Float32Array(32);

  function draw(context, seconds) {
    const dpr = Math.min(devicePixelRatio || 1, cfg.maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const t = screenTargets(w, h);
    const cam = camera(w, h);
    frameData.set([...EYE, cam.focal], 0);
    frameData.set([...cam.right, cfg.steps], 4);
    frameData.set([...cam.up, cfg.shadowSteps], 8);
    frameData.set([...cam.fwd, cam.unitsPerPx], 12);
    frameData.set([w, h, cam.shiftX, cam.shiftY], 16);
    frameData.set([seconds % LOOP, h / 720, 0, 0], 20);
    frameData.set(cam.area, 24);
    device.queue.writeBuffer(frameBuf, 0, frameData);

    const encoder = device.createCommandEncoder();
    if (t.fresh) {
      const scenePass = encoder.beginRenderPass({
        colorAttachments: [
          { view: t.geo.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1e4] },
          { view: t.tone.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 1, 0] },
        ],
      });
      scenePass.setPipeline(scenePipe);
      scenePass.setBindGroup(0, sceneBind);
      scenePass.draw(3);
      scenePass.end();
      const planPass = encoder.beginRenderPass({
        colorAttachments: t.plan.map(tex => ({ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 1000, 0, 1000] })),
      });
      planPass.setPipeline(planPipe);
      planPass.setBindGroup(0, t.planBind);
      planPass.draw(3);
      planPass.end();
      t.fresh = false;
    }
    const sketchPass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }],
    });
    sketchPass.setPipeline(sketchPipe);
    sketchPass.setBindGroup(0, t.bind);
    sketchPass.draw(3);
    sketchPass.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => { frameBuf.destroy(); if (targets) targets.list.forEach(r => r.destroy()); };
  return { draw, destroy };
}

main();
