struct Grid {
  nx: i32,
  nz: i32,
  border: i32,
  surface: i32,
  nt: i32,
  nrx: i32,
  seed: f32,
  f0: f32,
  t0: f32,
  gammaMax: f32,
  amp: f32,
  mute: f32,
}

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}

@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(2) var<storage, read> vel: array<vec2f>;

@group(0) @binding(1) var<storage, read_write> velOut: array<vec2f>;

const SPEED = array<f32, 5>(0.26, 0.30, 0.34, 0.39, 0.44);
const LENS_SPEED = 0.18;
const SMOOTH = 0.045;

fn rand(k: f32) -> f32 { return hash21(vec2f(grid.seed, k)); }

fn interfaces(u: f32) -> vec4f {
  let dome = 0.35 + 0.3 * rand(1.0);
  let fault = 0.62 + 0.25 * rand(2.0);
  let slip = select(0.0, 0.05, u > fault);
  let z1 = 0.19 + 0.025 * sin(6.28 * (1.2 * u + rand(3.0)));
  let z2 = 0.40 - 0.13 * exp(-pow((u - dome) / 0.17, 2.0)) + 0.04 * u + 0.5 * slip;
  let z3 = 0.58 - 0.08 * exp(-pow((u - dome) / 0.24, 2.0)) + 0.03 * sin(6.28 * (0.8 * u + rand(4.0))) + slip;
  let z4 = 0.78 + 0.025 * sin(6.28 * (1.7 * u + rand(5.0))) + slip;
  return vec4f(z1, z2, z3, z4);
}

fn lens(u: f32, v: f32, top: f32) -> f32 {
  let dome = 0.35 + 0.3 * rand(1.0);
  let d = vec2f((u - dome) / 0.09, (v - top - 0.025) / 0.022);
  return 1.0 - smoothstep(0.8, 1.0, length(d));
}

fn trueSpeed(u: f32, v: f32) -> f32 {
  let z = interfaces(u);
  let layer = dot(step(z, vec4f(v)), vec4f(1.0));
  let c = SPEED[i32(layer)];
  return mix(c, LENS_SPEED, lens(u, v, z.y) * step(z.y, v));
}

fn roughSpeed(u: f32, v: f32) -> f32 {
  let z = interfaces(u);
  let ramps = smoothstep(z - SMOOTH, z + SMOOTH, vec4f(v));
  let steps = vec4f(SPEED[1] - SPEED[0], SPEED[2] - SPEED[1], SPEED[3] - SPEED[2], SPEED[4] - SPEED[3]);
  return SPEED[0] + dot(ramps, steps);
}

@compute @workgroup_size(16, 16)
fn makeModel(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let z = i32(id.y);
  if (x >= grid.nx || z >= grid.nz) { return; }
  let inner = vec2f(f32(grid.nx - 2 * grid.border), f32(grid.nz - 2 * grid.border));
  let p = clamp((vec2f(f32(x), f32(z)) - f32(grid.border)) / inner, vec2f(0.0), vec2f(1.0));
  let ct = trueSpeed(p.x, p.y);
  let cr = roughSpeed(p.x, p.y);
  velOut[z * grid.nx + x] = vec2f(ct * ct, cr * cr);
}

struct Step {
  n: i32,
  backward: i32,
  srcX: i32,
}

@group(0) @binding(1) var<uniform> st: Step;
@group(0) @binding(3) var<storage, read> cur: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> prev: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> traces: array<f32>;
@group(0) @binding(6) var<storage, read_write> image: array<vec2f>;

const PI = 3.14159265;
const REPLAY_SCALE = 34.0;
const W0 = -205.0 / 72.0;
const W1 = 8.0 / 5.0;
const W2 = -1.0 / 5.0;
const W3 = 8.0 / 315.0;
const W4 = -1.0 / 560.0;

fn ricker(n: i32) -> f32 {
  let a = pow(PI * grid.f0 * (f32(n) - grid.t0), 2.0);
  return (1.0 - 2.0 * a) * exp(-a);
}

fn source(n: i32) -> f32 {
  return grid.amp * (ricker(n + 1) - 2.0 * ricker(n) + ricker(n - 1));
}

fn cross(i: i32, k: i32) -> vec4f {
  let dz = k * grid.nx;
  return cur[i - k] + cur[i + k] + cur[i - dz] + cur[i + dz];
}

fn laplacian(i: i32) -> vec4f {
  return 2.0 * W0 * cur[i] + W1 * cross(i, 1) + W2 * cross(i, 2) + W3 * cross(i, 3) + W4 * cross(i, 4);
}

fn borderDepth(x: i32, z: i32) -> f32 {
  let d = min(min(x, grid.nx - 1 - x), min(z, grid.nz - 1 - z));
  return clamp(f32(grid.border - d) / f32(grid.border), 0.0, 1.0);
}

fn randomBorder(c2: f32, x: i32, z: i32, depth: f32) -> f32 {
  let grain = hash21(floor(vec2f(f32(x), f32(z)) / 3.0) + grid.seed);
  let c = sqrt(c2) * (1.0 - 0.55 * depth * grain);
  return c * c;
}

fn traceMute(n: i32, x: i32, topSpeed: f32) -> f32 {
  let offset = abs(f32(x - st.srcX));
  let depth = 0.14 * f32(grid.nz - grid.border - grid.surface);
  let arrival = sqrt(4.0 * depth * depth + offset * offset) / topSpeed + grid.t0;
  let reach = f32(grid.nrx);
  return smoothstep(arrival - 1.0 / grid.f0, arrival, f32(n)) * (1.0 - smoothstep(0.3 * reach, 0.45 * reach, offset));
}

@compute @workgroup_size(16, 16)
fn stepWave(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let z = i32(id.y);
  if (x >= grid.nx || z >= grid.nz) { return; }
  let i = z * grid.nx + x;
  if (x < 4 || z < 4 || x >= grid.nx - 4 || z >= grid.nz - 4) {
    prev[i] = vec4f(0.0);
    return;
  }

  let depth = borderDepth(x, z);
  let g = grid.gammaMax * depth * depth;
  let gamma = vec4f(g, g, 0.0, g);
  let v = vel[i];
  var c2 = vec4f(v.x, v.y, v.y, v.y);
  if (depth > 0.0) { c2.z = randomBorder(v.y, x, z, depth); }

  let u = cur[i];
  var next = (2.0 - gamma) * u - (1.0 - gamma) * prev[i] + c2 * laplacian(i);

  let back = st.backward == 1;
  if (x == st.srcX && z == grid.surface) {
    let s = source(st.n);
    next += select(vec4f(s, s, s, 0.0), vec4f(0.0, 0.0, s, 0.0), back);
  }
  let rx = x - grid.border;
  let atReceiver = z == grid.surface && rx >= 0 && rx < grid.nrx;

  if (back) {
    next = vec4f(0.0, 0.0, next.z, next.w);
    if (atReceiver) { next.w += REPLAY_SCALE * grid.f0 * traces[st.n * grid.nrx + rx]; }
    if (depth == 0.0) { image[i] += vec2f(next.z * next.w, next.z * next.z); }
  } else if (atReceiver) {
    traces[(st.n + 1) * grid.nrx + rx] = (next.x - next.y) * traceMute(st.n + 1, x, sqrt(v.x));
  }
  prev[i] = next;
}

@group(0) @binding(1) var<storage, read> imageSums: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> section: array<f32>;
@group(0) @binding(3) var<storage, read_write> peak: atomic<u32>;

var<workgroup> localPeak: atomic<u32>;

const EPS = 0.05;
const DEPTH_GAIN = 1.5;

fn normalised(i: i32) -> f32 {
  let s = imageSums[i];
  return s.x / (s.y + EPS);
}

@compute @workgroup_size(16, 16)
fn makeImage(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&localPeak, 0u); }
  workgroupBarrier();

  let x = i32(id.x);
  let z = i32(id.y);
  let b = grid.border + 1;
  let inside = x >= b && z >= b && x < grid.nx - b && z < grid.nz - b;
  if (inside) {
    let i = z * grid.nx + x;
    let lap = 4.0 * normalised(i) - normalised(i - 1) - normalised(i + 1)
            - normalised(i - grid.nx) - normalised(i + grid.nx);
    let below = f32(z - grid.surface);
    let fade = smoothstep(0.0, grid.mute, below - grid.mute);
    let gain = 1.0 + DEPTH_GAIN * below / f32(grid.nz - grid.border - grid.surface);
    let value = lap * fade * gain;
    section[i] = value;
    atomicMax(&localPeak, bitcast<u32>(abs(value)));
  }

  workgroupBarrier();
  if (li == 0u) { atomicMax(&peak, atomicLoad(&localPeak)); }
}

struct View {
  size: vec2f,
  time: f32,
  backward: f32,
  row: f32,
  truckX: f32,
  bang: f32,
  reveal: f32,
  waveAlpha: f32,
}

@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(3) var<storage, read> field: array<vec4f>;
@group(0) @binding(4) var<storage, read> sectionIn: array<f32>;
@group(0) @binding(5) var<storage, read> peakIn: u32;
@group(0) @binding(6) var<storage, read> tracesIn: array<f32>;

const SKY = 0.14;
const ROWS = 270.0;
const LIVE_GAIN = 10.0;
const DOWN_GAIN = 3.0;
const UP_GAIN = 1.0;
const INK = vec3f(0.07, 0.047, 0.14);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn rgb(h: u32) -> vec3f {
  return vec3f(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0;
}

fn screenLayout() -> vec3f {
  let inner = vec2f(f32(grid.nx - 2 * grid.border), f32(grid.nz - grid.border - grid.surface));
  let ground = vec2f(view.size.x, view.size.y * (1.0 - SKY));
  let scale = max(ground.x / inner.x, ground.y / inner.y);
  return vec3f(scale, 0.5 * (view.size.x - inner.x * scale), view.size.y * SKY);
}

fn cellIndex(c: vec2i) -> i32 {
  let q = clamp(c, vec2i(0), vec2i(grid.nx - 1, grid.nz - 1));
  return q.y * grid.nx + q.x;
}

fn box(p: vec2f, lo: vec2f, hi: vec2f) -> bool {
  return all(p >= lo) && all(p < hi);
}

fn truck(p: vec2f) -> bool {
  let bed = box(p, vec2f(-10.0, 3.0), vec2f(5.0, 6.0));
  let cab = box(p, vec2f(5.0, 3.0), vec2f(11.0, 9.0)) && !box(p, vec2f(7.0, 6.0), vec2f(10.0, 8.0));
  let mast = box(p, vec2f(-3.0, 6.0), vec2f(-1.0, 13.0));
  let plate = box(p, vec2f(-4.0, 0.0), vec2f(2.0, 2.0));
  let wheels = length(p - vec2f(-7.0, 2.0)) < 2.2 || length(p - vec2f(8.0, 2.0)) < 2.2;
  return bed || cab || mast || plate || wheels;
}

fn sky(px: vec2f, L: vec3f, block: f32) -> vec3f {
  let t = px.y / L.z;
  var c = mix(rgb(0x1a1238u), rgb(0x6b2f6eu), smoothstep(0.0, 0.75, t));
  c = mix(c, rgb(0xf08a5du), smoothstep(0.55, 1.0, t));

  let sun = length((px - vec2f(0.74 * view.size.x, L.z)) / L.z);
  let stripes = fract(t * 9.0) > mix(0.0, 0.7, smoothstep(0.35, 1.0, t));
  c = mix(c, rgb(0xffd58au), f32(sun < 0.42 && stripes));

  let shake = round(view.bang * sin(view.time * 70.0));
  let local = floor((px - vec2f(L.y + view.truckX * L.x, L.z)) / block);
  if (truck(vec2f(local.x + shake, -local.y - 1.0))) { c = INK; }

  let spacing = 18.0 * block;
  let stakeX = L.y + (floor((px.x - L.y) / spacing) + 0.5) * spacing;
  if (abs(px.x - stakeX) < 0.5 * block && px.y > L.z - 3.0 * block) {
    let rx = clamp(i32((stakeX - L.y) / L.x), 0, grid.nrx - 1);
    let row = clamp(i32(view.row), 0, grid.nt);
    let heard = clamp(abs(tracesIn[row * grid.nrx + rx]) * 12.0, 0.0, 1.0);
    c = mix(INK, rgb(0xffe7a8u), heard * view.waveAlpha);
  }
  return c;
}

fn ground(cell: vec2i) -> vec3f {
  let i = cellIndex(cell);
  let depth = f32(cell.y - grid.surface) / f32(grid.nz - grid.border - grid.surface);
  let speed = (sqrt(vel[i].y) - 0.26) / 0.18;
  var c = mix(rgb(0x2a1838u), rgb(0x0b2231u), speed) * (1.0 - 0.3 * depth);

  let a = clamp(sectionIn[i] / max(bitcast<f32>(peakIn), 1e-20), -1.0, 1.0);
  let shown = sign(a) * sqrt(abs(a)) * view.reveal;
  c = mix(c, rgb(0xf4c27au), smoothstep(0.2, 0.75, shown));
  c = mix(c, rgb(0x06040cu), 0.85 * smoothstep(0.2, 0.75, -shown));

  let u = field[i];
  let alpha = view.waveAlpha;
  if (view.backward < 0.5) {
    let w = tanh(u.x * LIVE_GAIN);
    c = mix(c, rgb(0xfff0dcu), alpha * smoothstep(0.04, 0.7, w));
    c = mix(c, rgb(0x55d6e0u), alpha * smoothstep(0.04, 0.7, -w));
  } else {
    let down = tanh(u.z * DOWN_GAIN);
    let up = tanh(u.w * UP_GAIN);
    c = mix(c, rgb(0x55d6e0u), alpha * 0.6 * smoothstep(0.04, 0.8, abs(down)));
    c = mix(c, rgb(0xff6f8eu), alpha * 0.7 * smoothstep(0.04, 0.8, abs(up)));
    c = mix(c, rgb(0xffe08au), alpha * smoothstep(0.02, 0.3, abs(down * up)));
  }
  return c;
}

fn bayer(p: vec2u) -> f32 {
  let m = array<f32, 16>(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[(p.y % 4u) * 4u + (p.x % 4u)] / 16.0 - 0.47;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let L = screenLayout();
  let block = max(1.0, floor(view.size.y / ROWS));
  let blockPx = floor(pos.xy / block) * block + 0.5 * block;
  var c: vec3f;
  if (blockPx.y < L.z) {
    c = sky(blockPx, L, block);
  } else {
    let g = vec2f(f32(grid.border), f32(grid.surface)) + (blockPx - L.yz) / L.x;
    c = ground(vec2i(floor(g)));
  }
  let levels = 14.0;
  c = floor(c * levels + 0.5 + bayer(vec2u(pos.xy / block))) / levels;
  return vec4f(c, 1.0);
}
