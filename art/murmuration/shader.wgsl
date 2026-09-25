struct Boid {
  pos: vec3f,
  phase: f32,
  vel: vec3f,
  seed: u32,
}

@group(0) @binding(1) var<storage, read> boids: array<Boid>;

fn hashCell(c: vec3i, mask: u32) -> u32 {
  let u = vec3u(c);
  return ((u.x * 73856093u) ^ (u.y * 19349663u) ^ (u.z * 83492791u)) & mask;
}

struct Seed {
  boidCount: u32,
  tableMask: u32,
  cellSize: f32,
  center: vec3f,
  radii: vec3f,
}

@group(0) @binding(0) var<uniform> S0: Seed;
@group(0) @binding(1) var<storage, read_write> boidsInit: array<Boid>;
@group(0) @binding(2) var<storage, read_write> seedCounts: array<atomic<u32>>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

fn unit3(h: u32) -> vec3f {
  let a = pcg(h);
  let b = pcg(a);
  let c = pcg(b);
  return vec3f(vec3u(a, b, c) >> vec3u(8u)) / 16777216.0;
}

@compute @workgroup_size(256)
fn seedFlock(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= S0.boidCount) { return; }
  var p = unit3(i * 2u) * 2.0 - 1.0;
  p *= pow(unit3(i * 2u + 1u).x, 0.33) / max(length(p), 1e-3);
  let jitter = unit3(i * 2u + 7u) - 0.5;
  let pos = S0.center + p * S0.radii;
  boidsInit[i] = Boid(pos, jitter.x + 0.5, vec3f(9.0, 0.0, 1.0) + jitter * 2.0, pcg(i ^ 0x5bd1e995u));
  atomicAdd(&seedCounts[hashCell(vec3i(floor(pos / S0.cellSize)), S0.tableMask)], 1u);
}

const THREADS = 256u;
const PER_THREAD = 8u;
const BLOCK = THREADS * PER_THREAD;

@group(0) @binding(0) var<storage, read> countsIn: array<u32>;
@group(0) @binding(1) var<storage, read_write> starts: array<u32>;
@group(0) @binding(2) var<storage, read_write> blockSums: array<u32>;
@group(0) @binding(3) var<storage, read_write> cursorInit: array<u32>;

var<workgroup> partial: array<u32, THREADS>;

fn scanWorkgroup(t: u32, value: u32) -> vec2u {
  partial[t] = value;
  for (var offset = 1u; offset < THREADS; offset <<= 1u) {
    workgroupBarrier();
    let add = select(0u, partial[t - min(t, offset)], t >= offset);
    workgroupBarrier();
    partial[t] += add;
  }
  workgroupBarrier();
  return vec2u(partial[t] - value, partial[THREADS - 1u]);
}

@compute @workgroup_size(THREADS)
fn scanBlocks(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let t = lid.x;
  let base = wid.x * BLOCK + t * PER_THREAD;
  var local: array<u32, PER_THREAD>;
  var sum = 0u;
  for (var k = 0u; k < PER_THREAD; k++) {
    local[k] = sum;
    sum += countsIn[base + k];
  }
  let scanned = scanWorkgroup(t, sum);
  for (var k = 0u; k < PER_THREAD; k++) {
    starts[base + k] = scanned.x + local[k];
  }
  if (t == 0u) { blockSums[wid.x] = scanned.y; }
}

@compute @workgroup_size(THREADS)
fn scanSums(@builtin(local_invocation_id) lid: vec3u) {
  let t = lid.x;
  let n = arrayLength(&blockSums);
  var local: array<u32, PER_THREAD>;
  var sum = 0u;
  for (var k = 0u; k < PER_THREAD; k++) {
    let i = t * PER_THREAD + k;
    local[k] = sum;
    sum += select(0u, blockSums[min(i, n - 1u)], i < n);
  }
  let scanned = scanWorkgroup(t, sum);
  for (var k = 0u; k < PER_THREAD; k++) {
    let i = t * PER_THREAD + k;
    if (i < n) { blockSums[i] = scanned.x + local[k]; }
  }
}

@compute @workgroup_size(THREADS)
fn addOffsets(@builtin(global_invocation_id) id: vec3u) {
  let start = starts[id.x] + blockSums[id.x / BLOCK];
  starts[id.x] = start;
  cursorInit[id.x] = start;
}

struct Grid {
  boidCount: u32,
  tableMask: u32,
  cellSize: f32,
}

@group(0) @binding(0) var<uniform> G: Grid;
@group(0) @binding(3) var<storage, read_write> cursor: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> sortedOut: array<Boid>;

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= G.boidCount) { return; }
  let b = boids[id.x];
  sortedOut[atomicAdd(&cursor[hashCell(vec3i(floor(b.pos / G.cellSize)), G.tableMask)], 1u)] = b;
}

struct Sim {
  boidCount: u32,
  tableMask: u32,
  cellSize: f32,
  dt: f32,
  roost: vec3f,
  fleeRadius: f32,
  falcon: vec3f,
  time: f32,
}

const FIXED = 4096.0;
const MIN_SPEED = 7.0;
const MAX_SPEED = 13.0;

@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read> sorted: array<Boid>;
@group(0) @binding(2) var<storage, read> startsIn: array<u32>;
@group(0) @binding(3) var<storage, read> ends: array<u32>;
@group(0) @binding(4) var<storage, read_write> boidsOut: array<Boid>;
@group(0) @binding(5) var<storage, read_write> counts: array<atomic<u32>>;

struct Neighbourhood {
  count: u32,
  offset: vec3i,
  velocity: vec3i,
  push: vec3i,
}

fn toFixed(v: vec3f) -> vec3i {
  return vec3i(round(v * FIXED));
}

fn gather(me: Boid, index: u32) -> Neighbourhood {
  var n = Neighbourhood(0u, vec3i(0), vec3i(0), vec3i(0));
  let cell = vec3i(floor(me.pos / S.cellSize));
  let r2 = S.cellSize * S.cellSize;
  for (var i = 0; i < 27; i++) {
    let b = hashCell(cell + vec3i(i % 3, (i / 3) % 3, i / 9) - 1, S.tableMask);
    for (var j = startsIn[b]; j < ends[b]; j++) {
      let d = sorted[j].pos - me.pos;
      let d2 = dot(d, d);
      if (j == index || d2 > r2 || d2 == 0.0) { continue; }
      let dist = sqrt(d2);
      n.count++;
      n.offset += toFixed(d);
      n.velocity += toFixed(sorted[j].vel);
      n.push -= toFixed(d / dist * max(0.0, 1.0 - dist / (0.7 * S.cellSize)));
    }
  }
  return n;
}

fn flocking(me: Boid, n: Neighbourhood) -> vec3f {
  if (n.count == 0u) { return vec3f(0.0); }
  let k = 1.0 / (FIXED * f32(n.count));
  let alignment = vec3f(n.velocity) * k - me.vel;
  let cohesion = vec3f(n.offset) * k;
  let separation = vec3f(n.push) / FIXED;
  return alignment * 2.2 + cohesion * 1.2 + separation * 9.0;
}

fn lobe(seed: u32) -> vec3f {
  let a = S.time * 0.5 + f32(seed % 3u) * 2.0943951;
  return S.roost + vec3f(cos(a) * 34.0, sin(a * 1.7) * 10.0, sin(a) * 22.0);
}

fn pullToRoost(p: vec3f, seed: u32) -> vec3f {
  let d = lobe(seed) - p;
  let dist = length(d);
  return d / max(dist, 1e-3) * (0.5 + 0.12 * max(dist - 12.0, 0.0));
}

fn flee(p: vec3f) -> vec3f {
  let d = p - S.falcon;
  let dist = length(d);
  let fear = max(0.0, 1.0 - dist / S.fleeRadius);
  return d / max(dist, 1e-3) * fear * fear * 90.0;
}

@compute @workgroup_size(256)
fn flock(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= S.boidCount) { return; }
  var me = sorted[i];
  var accel = flocking(me, gather(me, i)) + pullToRoost(me.pos, me.seed) + flee(me.pos);
  accel.y += max(0.0, 18.0 - me.pos.y) * 3.0 - me.vel.y * 1.2;
  let v = me.vel + accel * S.dt;
  let speed = clamp(length(v), MIN_SPEED, MAX_SPEED);
  me.vel = v / max(length(v), 1e-3) * speed;
  me.pos += me.vel * S.dt;
  me.phase = fract(me.phase + S.dt * (2.5 + f32(me.seed & 255u) / 255.0));
  boidsOut[i] = me;
  atomicAdd(&counts[hashCell(vec3i(floor(me.pos / S.cellSize)), S.tableMask)], 1u);
}

struct Camera {
  viewProj: mat4x4f,
  pixels: vec2u,
  boidCount: u32,
  inkPerBird: f32,
  lead: f32,
}

@group(0) @binding(0) var<uniform> C: Camera;
@group(0) @binding(2) var<storage, read_write> density: array<atomic<u32>>;

const REFERENCE_DEPTH = 200.0;

fn addInk(p: vec2i, weight: u32) {
  if (any(p < vec2i(0)) || any(p >= vec2i(C.pixels))) { return; }
  atomicAdd(&density[u32(p.y) * C.pixels.x + u32(p.x)], weight);
}

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= C.boidCount) { return; }
  let b = boids[id.x];
  let clip = C.viewProj * vec4f(b.pos + b.vel * C.lead, 1.0);
  if (clip.w <= 1.0) { return; }
  let ndc = clip.xy / clip.w;
  let p = vec2i(floor((vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * vec2f(C.pixels)));
  let nearness = REFERENCE_DEPTH / clip.w;
  addInk(p, u32(clamp(C.inkPerBird * nearness * nearness, 16.0, 65535.0)));
  if (nearness > 3.0 && b.phase < 0.5) {
    addInk(p + vec2i(-1, -1), 256u);
    addInk(p + vec2i(1, -1), 256u);
  }
}

struct View {
  pixels: vec2f,
  falcon: vec2f,
  time: f32,
  falconSize: f32,
  falconFlap: f32,
}

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<storage, read> densityIn: array<u32>;

const SKY = array<vec3f, 7>(
  vec3f(1.00, 0.90, 0.66), vec3f(1.00, 0.72, 0.52), vec3f(1.00, 0.55, 0.48), vec3f(0.94, 0.41, 0.60),
  vec3f(0.69, 0.33, 0.62), vec3f(0.42, 0.27, 0.59), vec3f(0.20, 0.20, 0.48));
const SUN_CORE = vec3f(1.0, 0.96, 0.78);
const SUN_RIM = vec3f(1.0, 0.82, 0.54);
const CLOUD = vec3f(0.49, 0.29, 0.60);
const CLOUD_LIT = vec3f(1.0, 0.60, 0.54);
const BIRD = vec3f(0.13, 0.08, 0.20);
const FAR_CITY = vec3f(0.55, 0.30, 0.55);
const NEAR_CITY = vec3f(0.16, 0.09, 0.25);
const WINDOW = vec3f(1.0, 0.77, 0.42);
const GLOBE = vec3f(1.0, 0.80, 0.40);
const ARCH_LIGHT = vec3f(0.98, 0.64, 0.86);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn bayer4(p: vec2f) -> f32 {
  let m = array<f32, 16>(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  let i = vec2u(p) % 4u;
  return (m[i.y * 4u + i.x] + 0.5) / 16.0;
}

fn hash1(x: f32) -> f32 {
  return fract(sin(x * 127.1) * 43758.5453);
}

fn hash2(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1, 0)), u.x),
             mix(hash2(i + vec2f(0, 1)), hash2(i + vec2f(1, 1)), u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var sum = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p = p * 2.03 + vec2f(1.7, 9.2);
    amp *= 0.5;
  }
  return sum;
}

fn box(q: vec2f, x0: f32, x1: f32, top: f32) -> bool {
  return q.x > x0 && q.x < x1 && q.y < top;
}

fn capsule(p: vec2f, a: vec2f, b: vec2f, r: f32) -> bool {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) < r;
}

fn skyBands(y: f32, dither: f32) -> vec3f {
  let s = clamp(y / 0.95, 0.0, 1.0) * 6.0;
  let i = min(u32(s), 5u);
  let f = s - f32(i);
  return select(SKY[i], SKY[i + 1u], f + (dither - 0.5) * 0.3 > 0.5);
}

fn sun(q: vec2f, dither: f32, under: vec3f) -> vec3f {
  let c = vec2f(0.34, 0.2);
  let r = length(q - c) / 0.12;
  if (r > 1.0) {
    return select(under, mix(under, SUN_RIM, 0.35), r < 1.25 && dither < 0.5);
  }
  let below = (c.y - q.y) / 0.02;
  if (below > 0.0 && fract(below) < 0.12 + 0.1 * floor(below)) { return under; }
  return select(SUN_CORE, SUN_RIM, r > 0.8);
}

fn cloudDensity(q: vec2f, y0: f32, seed: f32) -> f32 {
  let n = fbm(vec2f(q.x * 2.2 + V.time * 0.012 + seed, (q.y - y0) * 16.0 + seed));
  return n - abs(q.y - y0) * 11.0;
}

fn clouds(q: vec2f, under: vec3f) -> vec3f {
  var col = under;
  let layers = array<vec2f, 3>(vec2f(0.72, 3.0), vec2f(0.55, 7.0), vec2f(0.4, 13.0));
  for (var i = 0; i < 3; i++) {
    let l = layers[i];
    if (cloudDensity(q, l.x, l.y) > 0.5) {
      let lit = cloudDensity(q - vec2f(0.0, 0.012), l.x, l.y) < 0.5;
      col = select(CLOUD, CLOUD_LIT, lit);
    }
  }
  return col;
}

fn inkAt(p: vec2f) -> f32 {
  let q = clamp(p, vec2f(0.0), V.pixels - 1.0);
  return f32(densityIn[u32(q.y) * u32(V.pixels.x) + u32(q.x)]) / 256.0;
}

fn birds(pix: vec2f, dither: f32, under: vec3f) -> vec3f {
  let own = 1.0 - exp(-inkAt(pix) * 0.2);
  if (own > dither) { return BIRD; }
  let crowd = step(0.01, inkAt(pix + vec2f(1, 0))) + step(0.01, inkAt(pix - vec2f(1, 0))) +
              step(0.01, inkAt(pix + vec2f(0, 1))) + step(0.01, inkAt(pix - vec2f(0, 1)));
  return select(under, mix(under, BIRD, 0.5), crowd >= 3.0);
}

fn falcon(pix: vec2f, under: vec3f) -> vec3f {
  let d = pix - floor(V.falcon);
  let s = V.falconSize;
  if (abs(d.x) > s || abs(d.y) > s) { return under; }
  let wing = round(abs(d.x) * mix(-0.55, 0.5, V.falconFlap));
  let body = d.x == 0.0 && d.y >= -1.0 && d.y <= 1.0;
  return select(under, BIRD * 0.6, d.y == wing || body);
}

fn farCity(q: vec2f) -> bool {
  let col = floor(q.x / 0.028);
  let h = 0.09 + hash1(col) * 0.07 + step(0.85, hash1(col + 0.5)) * 0.06;
  let kafd = smoothstep(0.35, 0.0, abs(q.x - 0.62)) * (0.12 + 0.08 * hash1(col + 3.0));
  let roof = (fract(q.x / 0.028) - 0.5) * 0.02 * step(0.01, kafd);
  let tv = box(q, -0.763, -0.757, 0.42) || length((q - vec2f(-0.76, 0.35)) / vec2f(1.0, 0.6)) < 0.014;
  return q.y < h + kafd + roof || tv;
}

fn kingdomCentre(q: vec2f, arch: ptr<function, bool>) -> bool {
  let x = q.x + 0.22;
  let base = 0.05;
  let height = 0.56;
  let w = 0.042;
  let t = (q.y - base) / height;
  let halfWidth = w * (1.0 - 0.3 * t * t);
  if (t < 0.0 || abs(x) > halfWidth || t > 0.93 + 0.07 * (x / halfWidth) * (x / halfWidth)) { return t < 0.0 && abs(x) < w; }
  let holeHalf = w * 0.8 * sqrt(max(t - 0.66, 0.0) / 0.34);
  let bridge = t > 0.84 && t < 0.865;
  let inHole = abs(x) < holeHalf && !bridge;
  *arch = !inHole && abs(x) < holeHalf + 0.0045 && t > 0.67;
  return !inHole;
}

fn faisaliah(q: vec2f, globe: ptr<function, bool>) -> bool {
  let x = q.x - 0.1;
  let t = (q.y - 0.05) / 0.42;
  *globe = length(vec2f(x, t * 0.42 - 0.3)) < 0.021;
  let body = t > 0.0 && t < 1.0 && abs(x) < 0.035 * pow(1.0 - t, 0.9);
  let spire = abs(x) < 0.0025 && t < 1.12;
  return body || spire || *globe;
}

fn palm(q: vec2f, root: vec2f, height: f32, lean: f32) -> bool {
  let top = root + vec2f(lean, height);
  let bend = root + vec2f(lean * 0.3, height * 0.5);
  if (capsule(q, root, bend, 0.0045) || capsule(q, bend, top, 0.0035)) { return true; }
  for (var k = 0; k < 9; k++) {
    let a = 0.15 + f32(k) / 8.0 * 2.84;
    let dir = vec2f(cos(a), sin(a)) * (0.05 + 0.012 * sin(f32(k) * 2.3));
    var prev = top;
    for (var s = 1; s <= 3; s++) {
      let u = f32(s) / 3.0;
      let next = top + dir * u - vec2f(0.0, 0.05 * u * u);
      if (capsule(q, prev, next, 0.0038 - 0.0008 * u)) { return true; }
      prev = next;
    }
  }
  return false;
}

fn nearCity(q: vec2f, pix: vec2f, under: vec3f) -> vec3f {
  var arch = false;
  var globe = false;
  let col = floor(q.x / 0.05 + 0.3);
  let blockTop = 0.05 + hash1(col + 11.0) * 0.07 * step(0.25, hash1(col + 4.0));
  let block = q.y < blockTop;
  let landmark = kingdomCentre(q, &arch) || faisaliah(q, &globe);
  let palms = palm(q, vec2f(-0.55, 0.02), 0.2, 0.03) || palm(q, vec2f(0.42, 0.02), 0.17, -0.02) ||
              palm(q, vec2f(0.62, 0.02), 0.23, 0.035) || palm(q, vec2f(-0.95, 0.02), 0.18, -0.03);
  if (!(block || landmark || palms || q.y < 0.05)) { return under; }
  if (globe) { return select(GLOBE, SUN_CORE, q.x < 0.095 && q.y > 0.35); }
  if (arch) { return ARCH_LIGHT; }
  let windowCell = floor(pix / vec2f(2.0, 3.0));
  let lit = hash2(windowCell + floor(V.time / 9.0) * 0.001 * step(0.97, hash2(windowCell * 1.3))) > 0.86;
  let isWindow = (block || landmark) && !palms && q.y > 0.06 && u32(pix.x) % 2u == 0u && u32(pix.y) % 3u == 0u;
  return select(NEAR_CITY, WINDOW, isWindow && lit);
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let pix = floor(frag.xy);
  let uv = (pix + 0.5) / V.pixels;
  let q = vec2f((uv.x - 0.5) * V.pixels.x / V.pixels.y, 1.0 - uv.y);
  let dither = bayer4(pix);

  var col = skyBands(q.y, dither);
  col = sun(q, dither, col);
  col = clouds(q, col);
  col = birds(pix, dither, col);
  col = falcon(pix, col);
  if (farCity(q)) { col = FAR_CITY; }
  col = nearCity(q, pix, col);
  return vec4f(col, 1.0);
}
