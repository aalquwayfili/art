const STEPS_PER_SECOND = 60;
const QUALITY = {
  default: { gridHeight: 900, agents: 1 << 20 },
  low: { gridHeight: 300, agents: 1 << 17 },
};

const VIEW = { lon: 46.5, lat: 22.3, lonSpan: 30, latSpan: 23 };
const SEAS = [
  [[32.5, 30.0], [32.8, 28.9], [33.7, 27.2], [34.5, 25.7], [35.6, 23.9], [36.9, 22.0], [37.3, 19.5],
   [38.6, 18.0], [39.7, 15.6], [41.5, 13.9], [43.1, 11.9], [44.5, 10.4], [46.5, 10.7], [49.0, 11.3],
   [51.2, 11.9], [51.0, 0.0], [76.0, 0.0], [76.0, 21.0], [72.5, 21.0], [67.5, 24.5], [66.5, 25.3],
   [61.5, 25.1], [58.8, 25.6], [57.3, 27.0], [56.3, 27.2], [54.5, 26.6], [52.0, 27.8], [50.8, 28.9],
   [50.2, 30.0], [49.0, 30.3], [48.5, 29.9], [48.0, 29.4], [48.5, 28.4], [49.6, 27.1], [50.1, 26.4],
   [50.6, 25.6], [50.8, 24.8], [51.2, 26.1], [51.6, 25.3], [51.6, 24.6], [52.6, 24.2], [54.4, 24.3],
   [55.3, 25.3], [56.0, 25.9], [56.3, 26.4], [56.4, 25.6], [56.4, 24.8], [57.5, 23.8], [58.6, 23.6],
   [59.8, 22.5], [59.0, 21.2], [58.3, 20.4], [57.7, 19.6], [56.6, 18.4], [55.3, 17.6], [54.0, 16.9],
   [52.2, 15.6], [49.1, 14.5], [48.0, 14.0], [45.0, 12.8], [43.5, 12.7], [43.2, 13.3], [42.8, 14.8],
   [42.6, 16.4], [41.4, 18.5], [40.2, 20.2], [39.2, 21.5], [38.4, 23.2], [37.3, 24.8], [36.5, 26.0],
   [35.6, 27.5], [35.0, 28.1], [34.9, 29.5], [34.6, 28.6], [34.25, 27.8], [33.6, 28.3], [32.6, 29.9]],
  [[18.0, 32.0], [25.0, 31.6], [29.0, 30.9], [32.3, 31.3], [34.3, 31.3], [34.9, 32.5], [35.1, 33.1],
   [35.5, 34.0], [35.9, 35.5], [35.9, 42.0], [18.0, 42.0]],
];
const RIDGES = [
  [[35.4, 29.0], [36.5, 27.0], [38.0, 25.0], [40.0, 21.8], [41.5, 19.5], [42.8, 17.0], [43.8, 15.0], [44.5, 13.6]],
  [[45.6, 27.6], [46.3, 25.6], [46.2, 23.5], [45.6, 21.0]],
  [[56.2, 26.0], [56.6, 24.3], [57.6, 23.3], [59.2, 22.4]],
  [[48.0, 14.8], [51.0, 15.5], [54.0, 17.3]],
];
const SANDS = [[50.0, 19.6, 6.0, 2.6], [41.0, 28.4, 3.0, 1.2], [46.8, 24.0, 1.0, 4.0]];
const CITIES = [
  [46.7, 24.7, 3.0], [39.2, 21.5, 2.4], [39.8, 21.4, 1.8], [39.6, 24.5, 2.0], [50.1, 26.4, 2.0], [41.7, 27.5, 1.2],
  [36.6, 28.4, 1.2], [42.5, 18.2, 1.2], [44.1, 17.5, 1.0], [44.0, 26.3, 1.4], [37.9, 26.6, 0.9], [49.6, 25.4, 1.2],
  [42.6, 16.9, 1.0], [40.2, 30.0, 0.9], [41.0, 31.0, 0.9], [45.0, 20.5, 0.9], [40.4, 21.3, 1.2], [48.0, 29.4, 1.6],
  [51.5, 25.3, 1.5], [50.6, 26.2, 1.1], [54.4, 24.4, 1.6], [55.3, 25.2, 1.8], [58.4, 23.6, 1.6], [44.2, 15.4, 1.6],
  [45.0, 12.8, 1.3], [54.1, 17.0, 1.1], [49.1, 14.5, 1.0], [47.1, 17.5, 0.8], [35.9, 32.0, 1.6], [44.4, 33.3, 2.0],
  [47.8, 30.5, 1.4], [31.2, 30.0, 2.4], [32.9, 24.1, 1.0], [37.2, 19.6, 1.0], [32.5, 15.6, 1.8], [38.9, 15.3, 1.0],
  [43.1, 11.6, 1.0], [38.5, 27.6, 0.8], [39.9, 29.8, 0.8], [47.3, 24.1, 0.9], [45.6, 20.5, 0.8], [42.6, 20.0, 0.9],
];

const params = new URLSearchParams(location.search);
const fixedTime = params.has('t') ? parseFloat(params.get('t')) : null;

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description}`.toLowerCase();
  return info.isFallbackAdapter || /swiftshader|llvmpipe|software|microsoft basic/.test(text);
}

function projector(width, height) {
  const k = Math.cos((VIEW.lat * Math.PI) / 180);
  const degPerCell = Math.max(VIEW.latSpan / height, (VIEW.lonSpan * k) / width);
  return ([lon, lat]) => [width / 2 + ((lon - VIEW.lon) * k) / degPerCell, height / 2 - (lat - VIEW.lat) / degPerCell];
}

function storage(device, data) {
  const buffer = device.createBuffer({ size: Math.max(data.byteLength, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function uniform(device, ints, floats = []) {
  const data = new ArrayBuffer(Math.ceil((ints.length + floats.length) / 4) * 16);
  new Uint32Array(data, 0, ints.length).set(ints);
  new Float32Array(data, ints.length * 4, floats.length).set(floats);
  const buffer = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function mapData(width, height, scale) {
  const project = projector(width, height);
  const degPerCell = project([VIEW.lon, VIEW.lat - 1])[1] - height / 2;
  const seaVerts = SEAS.flat().map(project).flat();
  const seaRings = [];
  SEAS.reduce((first, ring) => (seaRings.push(first, ring.length), first + ring.length), 0);
  const ridges = RIDGES.flatMap((line) => line.slice(1).flatMap((p, i) => [...project(line[i]), ...project(p)]));
  const sands = SANDS.flatMap(([lon, lat, rx, ry]) => [...project([lon, lat]), rx * degPerCell, ry * degPerCell]);
  const cities = CITIES.flatMap(([lon, lat, w]) => [...project([lon, lat]), (1.2 + 1.6 * Math.sqrt(w)) * scale, w]);
  return {
    seaVerts: new Float32Array(seaVerts), seaRings: new Uint32Array(seaRings),
    ridges: new Float32Array(ridges), sands: new Float32Array(sands), cities: new Float32Array(cities),
  };
}

function bind(device, pipeline, buffers) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
}

async function start() {
  const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
  if (!adapter) throw new Error('no WebGPU');
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize } });
  const quality = QUALITY[params.get('quality') === 'low' || isSoftware(adapter) ? 'low' : 'default'];

  const canvas = document.getElementById('c');
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const height = quality.gridHeight;
  const width = Math.round((height * innerWidth) / innerHeight);
  const scale = height / 540;
  const cells = width * height;
  const map = mapData(width, height, scale);
  const cityCount = CITIES.length;
  const totalWeight = CITIES.reduce((s, c) => s + c[2], 0);

  const module = device.createShaderModule({ code: await (await fetch('shader.wgsl')).text() });
  for (const m of (await module.getCompilationInfo()).messages) {
    if (m.type === 'error') console.error(`shader.wgsl:${m.lineNum}:${m.linePos} ${m.message}`);
  }
  const compute = (entryPoint) => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
  const landPipeline = compute('bakeLand');
  const seedPipeline = compute('seedAgents');
  const agentPipeline = compute('moveAgents');
  const diffusePipeline = compute('diffuse');
  const printPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });

  const cityBuffer = storage(device, map.cities);
  const terrain = device.createBuffer({ size: cells * 16, usage: GPUBufferUsage.STORAGE });
  const agents = device.createBuffer({ size: quality.agents * 16, usage: GPUBufferUsage.STORAGE });
  const trails = [0, 1].map(() => device.createBuffer({ size: cells * 4, usage: GPUBufferUsage.STORAGE }));
  const deposit = device.createBuffer({ size: cells * 4, usage: GPUBufferUsage.STORAGE });

  const landParams = uniform(device, [width, height, SEAS.length, map.ridges.length / 4, SANDS.length, cityCount], [scale]);
  const seedParams = uniform(device, [quality.agents, cityCount], [totalWeight, scale]);
  const simParams = uniform(device, [width, height, quality.agents], [Math.PI / 8, 9 * scale, Math.PI / 4, scale, 1, 0.15, 6, 40]);
  const viewParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const landGroup = bind(device, landPipeline, [landParams, storage(device, map.seaVerts), storage(device, map.seaRings),
    storage(device, map.ridges), storage(device, map.sands), cityBuffer, terrain]);
  const seedGroup = bind(device, seedPipeline, [seedParams, cityBuffer, agents]);
  const agentGroups = trails.map((t) => bind(device, agentPipeline, [simParams, agents, t, terrain, deposit]));
  const diffuseGroups = trails.map((t, i) => bind(device, diffusePipeline, [simParams, t, trails[1 - i], terrain, deposit]));
  const printGroups = trails.map((t) => bind(device, printPipeline, [viewParams, t, terrain]));

  const gridGroups = [Math.ceil(width / 16), Math.ceil(height / 16)];
  const agentGroupsCount = Math.ceil(quality.agents / 256);
  let current = 0;
  let steps = 0;

  function encodeSetup(pass) {
    pass.setPipeline(landPipeline);
    pass.setBindGroup(0, landGroup);
    pass.dispatchWorkgroups(...gridGroups);
    pass.setPipeline(seedPipeline);
    pass.setBindGroup(0, seedGroup);
    pass.dispatchWorkgroups(agentGroupsCount);
  }

  function encodeSteps(pass, count) {
    for (let i = 0; i < count; i++, steps++, current = 1 - current) {
      pass.setPipeline(agentPipeline);
      pass.setBindGroup(0, agentGroups[current]);
      pass.dispatchWorkgroups(agentGroupsCount);
      pass.setPipeline(diffusePipeline);
      pass.setBindGroup(0, diffuseGroups[current]);
      pass.dispatchWorkgroups(...gridGroups);
    }
  }

  function simulate(count, setup = false) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    if (setup) encodeSetup(pass);
    encodeSteps(pass, count);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    device.queue.writeBuffer(viewParams, 0, new Float32Array([width, height, canvas.width, canvas.height, 30]));
  }

  function draw() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(printPipeline);
    pass.setBindGroup(0, printGroups[current]);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    document.getElementById('label').textContent =
      `Physarum polycephalum · ${quality.agents.toLocaleString('en')} agents · step ${steps.toLocaleString('en')}`;
  }

  resize();
  addEventListener('resize', resize);
  simulate(0, true);

  if (fixedTime !== null) {
    const target = Math.round(fixedTime * STEPS_PER_SECOND);
    while (steps < target) {
      simulate(Math.min(STEPS_PER_SECOND, target - steps));
      await device.queue.onSubmittedWorkDone();
    }
    draw();
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  let last = performance.now();
  let owed = 0;
  let slowFrames = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (quality !== QUALITY.low && dt > 0.045 && ++slowFrames > 90) {
      params.set('quality', 'low');
      location.replace(`?${params}`);
      return;
    }
    owed = Math.min(owed + dt * STEPS_PER_SECOND, 3);
    const count = Math.floor(owed);
    owed -= count;
    simulate(count);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  document.getElementById('nogpu').style.display = 'grid';
});
