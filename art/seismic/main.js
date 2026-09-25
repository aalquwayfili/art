const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const FPS = 60;
const SHOTS = [0.5, 0.22, 0.78, 0.36, 0.64, 0.1, 0.9];
const REST_FRAMES = 6 * FPS;
const CHUNK = 240;

function settings(quality) {
  const s = quality === 'low' ? 0.15625 : 1;
  const nx = 2048 * s, nz = 1024 * s, border = Math.round(Math.max(14, 40 * s));
  return {
    nx, nz, border, nt: Math.round(5000 * s), surface: border + Math.round(4 * s), nrx: nx - 2 * border,
    f0: 0.26 / (56 * s), stepsPerFrame: Math.round(20 * s), gammaMax: 2.4 / border, mute: 36 * s,
    amp: 128 * s,
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
  let sim = createSim(device, module, format, settings(quality));

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  };
  resize();
  addEventListener('resize', resize);

  if (fixedTime !== null) {
    const frame = Math.round(fixedTime * FPS);
    sim.advance(frame * sim.cfg.stepsPerFrame, CHUNK);
    sim.draw(context, frame);
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
      sim.destroy();
      sim = createSim(device, module, format, settings(quality));
      frame = 0;
    }
    sim.advance(sim.cfg.stepsPerFrame, sim.cfg.stepsPerFrame);
    sim.draw(context, ++frame);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createSim(device, module, format, cfg) {
  const { nx, nz, nt, nrx, stepsPerFrame } = cfg;
  const cells = nx * nz;
  const shotSteps = 2 * nt;
  const cycleSteps = SHOTS.length * shotSteps + REST_FRAMES * stepsPerFrame;
  const groups = [Math.ceil(nx / 16), Math.ceil(nz / 16)];
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNIFORM = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  const buffer = (size, usage) => device.createBuffer({ size, usage });

  const gridBuf = buffer(48, UNIFORM);
  const stepBuf = buffer(256 * Math.max(CHUNK, stepsPerFrame), UNIFORM);
  const viewBuf = buffer(48, UNIFORM);
  const vel = buffer(cells * 8, STORAGE);
  const fields = [buffer(cells * 16, STORAGE), buffer(cells * 16, STORAGE)];
  const traces = buffer((nt + 1) * nrx * 4, STORAGE);
  const image = buffer(cells * 8, STORAGE);
  const section = buffer(cells * 4, STORAGE);
  const peak = buffer(4, STORAGE);
  const all = [gridBuf, stepBuf, viewBuf, vel, ...fields, traces, image, section, peak];

  const gridData = new ArrayBuffer(48);
  const gi = new Int32Array(gridData), gf = new Float32Array(gridData);
  gi.set([nx, nz, cfg.border, cfg.surface, nt, nrx]);
  gf.set([0, cfg.f0, 1.1 / cfg.f0, cfg.gammaMax, cfg.amp, cfg.mute], 6);
  const writeSeed = seed => { gf[6] = seed; device.queue.writeBuffer(gridBuf, 0, gridData); };

  const compute = (entryPoint, layout = 'auto') =>
    device.createComputePipeline({ layout, compute: { module, entryPoint } });
  const bindings = list => list.map((b, i) => ({ binding: i, resource: b instanceof GPUBuffer ? { buffer: b } : b }));

  const waveLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ...[4, 5, 6].map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } })),
    ],
  });
  const modelPipe = compute('makeModel');
  const wavePipe = compute('stepWave', device.createPipelineLayout({ bindGroupLayouts: [waveLayout] }));
  const imagePipe = compute('makeImage');
  const renderPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });

  const modelBind = device.createBindGroup({ layout: modelPipe.getBindGroupLayout(0), entries: bindings([gridBuf, vel]) });
  const stepParams = { buffer: stepBuf, size: 16 };
  const waveBind = [0, 1].map(p => device.createBindGroup({
    layout: waveLayout,
    entries: bindings([gridBuf, stepParams, vel, fields[p], fields[1 - p], traces, image]),
  }));
  const imageBind = device.createBindGroup({ layout: imagePipe.getBindGroupLayout(0), entries: bindings([gridBuf, image, section, peak]) });
  const renderBind = [0, 1].map(p => device.createBindGroup({
    layout: renderPipe.getBindGroupLayout(0),
    entries: bindings([gridBuf, viewBuf, vel, fields[p], section, peak, traces]),
  }));

  const stepData = new Int32Array(64 * Math.max(CHUNK, stepsPerFrame));
  const viewData = new Float32Array(12);
  let done = 0;
  let lastN = 0;
  let imageChanged = true;

  function locate(g) {
    const cycle = Math.floor(g / cycleSteps);
    const k = g - cycle * cycleSteps;
    const shot = Math.floor(k / shotSteps);
    if (shot >= SHOTS.length) return { cycle, shot, rest: k - SHOTS.length * shotSteps };
    const j = k - shot * shotSteps;
    const backward = j >= nt;
    return { cycle, shot, j, backward, n: backward ? shotSteps - 1 - j : j };
  }

  const shotColumn = shot => cfg.border + Math.round(SHOTS[shot % SHOTS.length] * (nrx - 1));

  function advance(count, chunk) {
    for (let start = 0; start < count; start += chunk) {
      const encoder = device.createCommandEncoder();
      const n = Math.min(chunk, count - start);
      let pass = null;
      const endPass = () => { if (pass) pass.end(); pass = null; };
      for (let s = 0; s < n; s++) {
        const g = done++;
        const at = locate(g);
        if (at.rest !== undefined) continue;
        if (at.shot === 0 && at.j === 0) {
          endPass();
          writeSeed(at.cycle + 1);
          const mp = encoder.beginComputePass();
          mp.setPipeline(modelPipe);
          mp.setBindGroup(0, modelBind);
          mp.dispatchWorkgroups(...groups);
          mp.end();
          encoder.clearBuffer(image);
          imageChanged = true;
        }
        if (at.j === 0) {
          endPass();
          for (const b of [...fields, traces]) encoder.clearBuffer(b);
        }
        stepData.set([at.n, at.backward ? 1 : 0, shotColumn(at.shot)], s * 64);
        if (!pass) { pass = encoder.beginComputePass(); pass.setPipeline(wavePipe); }
        pass.setBindGroup(0, waveBind[at.n & 1], [s * 256]);
        pass.dispatchWorkgroups(...groups);
        lastN = at.n;
        imageChanged ||= at.backward;
      }
      endPass();
      device.queue.writeBuffer(stepBuf, 0, stepData, 0, n * 64);
      device.queue.submit([encoder.finish()]);
    }
  }

  function describeView(frame, width, height) {
    const at = locate(Math.max(0, done - 1));
    const resting = at.rest !== undefined;
    const shot = resting ? SHOTS.length - 1 : at.shot;
    let truck = shotColumn(shot), bang = 0, row = 0, reveal = 1;
    if (resting) {
      const f = at.rest / (REST_FRAMES * stepsPerFrame);
      truck = shotColumn(0) + (1 - Math.min(1, f * 1.4)) * (shotColumn(shot) - shotColumn(0));
      reveal = 1 - smoothstep(0.55, 1, f);
    } else if (at.backward) {
      const f = smoothstep(0.55, 1, 1 - at.n / nt);
      const next = shot + 1 < SHOTS.length ? shotColumn(shot + 1) : shotColumn(shot);
      truck += f * (next - truck);
      row = at.n;
    } else {
      bang = Math.exp(-Math.max(0, at.n - 1.1 / cfg.f0) * cfg.f0 * 1.5);
      row = at.n + 1;
    }
    viewData.set([width, height, frame / FPS, at.backward ? 1 : 0, row, truck - cfg.border, bang,
      reveal, resting ? 0 : 1]);
    return viewData;
  }

  function draw(context, frame) {
    const texture = context.getCurrentTexture();
    device.queue.writeBuffer(viewBuf, 0, describeView(frame, texture.width, texture.height));
    const encoder = device.createCommandEncoder();
    if (imageChanged) {
      encoder.clearBuffer(peak);
      const cp = encoder.beginComputePass();
      cp.setPipeline(imagePipe);
      cp.setBindGroup(0, imageBind);
      cp.dispatchWorkgroups(...groups);
      cp.end();
      imageChanged = false;
    }
    const rp = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(renderPipe);
    rp.setBindGroup(0, renderBind[(lastN + 1) & 1]);
    rp.draw(3);
    rp.end();
    device.queue.submit([encoder.finish()]);
  }

  const destroy = () => all.forEach(b => b.destroy());
  return { cfg, advance, draw, destroy };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

main();
