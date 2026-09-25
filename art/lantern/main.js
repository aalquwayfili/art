const query = new URLSearchParams(location.search);
const FIXED_T = query.has('t') ? parseFloat(query.get('t')) : null;

const QUALITY = {
  default: { height: 540, spp: 2, bounces: 3, stillSamples: 256 },
  low: { height: 270, spp: 2, bounces: 2, stillSamples: 24 },
};
const TURN_SECONDS = 120;
const MIN_BLEND = 0.1;
const EXPOSURE = 1.3;
const SLOW_FRAME_MS = 50;

const canvas = document.getElementById('c');

function showMessage(text) {
  const p = document.createElement('p');
  p.className = 'message';
  p.textContent = text;
  document.body.append(p);
}

function isSoftwareAdapter(adapter) {
  const info = adapter.info || {};
  const name = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`;
  return info.isFallbackAdapter || /swiftshader|llvmpipe|lavapipe|software|basic render/i.test(name);
}

const angleAt = (t) => (t / TURN_SECONDS) * 2 * Math.PI + 0.35;
const flameAt = (t) => 1 + 0.05 * Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1.2);

class Renderer {
  constructor(device, tracePipeline, presentPipeline) {
    this.device = device;
    this.tracePipeline = tracePipeline;
    this.presentPipeline = presentPipeline;
    this.uniforms = new ArrayBuffer(48);
    this.u32 = new Uint32Array(this.uniforms);
    this.f32 = new Float32Array(this.uniforms);
    this.uniformBuffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  resize(quality, view) {
    const height = quality.height;
    const width = Math.round((height * view[0]) / view[1]);
    this.quality = quality;
    this.size = [width, height];
    this.view = view;
    this.samples = 0;
    this.accum?.destroy();
    this.accum = this.device.createBuffer({ size: width * height * 16, usage: GPUBufferUsage.STORAGE });
    const entries = [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.accum } },
    ];
    const layout = (p) => p.getBindGroupLayout(0);
    this.traceGroup = this.device.createBindGroup({ layout: layout(this.tracePipeline), entries });
    this.presentGroup = this.device.createBindGroup({ layout: layout(this.presentPipeline), entries });
  }

  writeParams(t, blend) {
    const { u32, f32, quality } = this;
    u32.set([this.size[0], this.size[1]], 0);
    f32.set(this.view, 2);
    u32[4] = this.samples;
    u32[5] = quality.spp;
    f32[6] = angleAt(t);
    f32[7] = blend;
    f32[8] = flameAt(t);
    u32[9] = quality.bounces;
    f32[10] = EXPOSURE;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniforms);
  }

  trace(encoder, t, minBlend) {
    this.writeParams(t, Math.max(1 / (this.samples + 1), minBlend));
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.tracePipeline);
    pass.setBindGroup(0, this.traceGroup);
    pass.dispatchWorkgroups(Math.ceil(this.size[0] / 8), Math.ceil(this.size[1] / 8));
    pass.end();
    this.samples++;
  }

  present(encoder, target) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(this.presentPipeline);
    pass.setBindGroup(0, this.presentGroup);
    pass.draw(3);
    pass.end();
  }
}

function fitCanvas() {
  const dpr = FIXED_T === null ? Math.min(devicePixelRatio || 1, 2) : 1;
  canvas.width = Math.max(1, Math.round(innerWidth * dpr));
  canvas.height = Math.max(1, Math.round(innerHeight * dpr));
  return [canvas.width, canvas.height];
}

async function renderStill(device, context, renderer, t) {
  const passes = Math.ceil(renderer.quality.stillSamples / renderer.quality.spp);
  for (let i = 0; i < passes; i++) {
    const encoder = device.createCommandEncoder();
    renderer.trace(encoder, t, 0);
    device.queue.submit([encoder.finish()]);
    if (i % 4 === 3) await device.queue.onSubmittedWorkDone();
  }
  const encoder = device.createCommandEncoder();
  renderer.present(encoder, context.getCurrentTexture().createView());
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  document.title = 'done';
}

function animate(device, context, renderer, qualityName) {
  const start = performance.now();
  const frameTimes = [];
  let last = start;
  const frame = (now) => {
    frameTimes.push(now - last);
    last = now;
    if (qualityName === 'default' && frameTimes.length === 40) {
      const median = frameTimes.slice(10).sort((a, b) => a - b)[15];
      if (median > SLOW_FRAME_MS) {
        qualityName = 'low';
        renderer.resize(QUALITY.low, renderer.view);
      }
    }
    const encoder = device.createCommandEncoder();
    renderer.trace(encoder, (now - start) / 1000, MIN_BLEND);
    renderer.present(encoder, context.getCurrentTexture().createView());
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  };
  addEventListener('resize', () => renderer.resize(renderer.quality, fitCanvas()));
  requestAnimationFrame(frame);
}

async function main() {
  const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
  if (!adapter) return showMessage('This piece needs WebGPU: Chrome, Edge, or Safari 26+');
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (e) => console.error(e.error.message));
  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext('webgpu');
  context.configure({ device, format, alphaMode: 'opaque' });

  const qualityName = query.get('quality') === 'low' || isSoftwareAdapter(adapter) ? 'low' : 'default';
  const module = device.createShaderModule({ code: await (await fetch('shader.wgsl')).text() });
  for (const m of (await module.getCompilationInfo()).messages) {
    if (m.type === 'error') console.error(`shader.wgsl:${m.lineNum}:${m.linePos} ${m.message}`);
  }
  const [tracePipeline, presentPipeline] = await Promise.all([
    device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'accumulate' } }),
    device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    }),
  ]);
  const renderer = new Renderer(device, tracePipeline, presentPipeline);
  renderer.resize(QUALITY[qualityName], fitCanvas());

  if (FIXED_T !== null) await renderStill(device, context, renderer, FIXED_T);
  else animate(device, context, renderer, qualityName);
}

main();
