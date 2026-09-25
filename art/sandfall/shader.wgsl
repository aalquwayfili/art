struct Params {
  grid: vec2i,
  count: u32,
  birthPerStep: f32,
  dt: f32,
  gravity: f32,
  mu: f32,
  lambda: f32,
  alpha: f32,
}

struct Step { index: u32 }

fn hash11(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn boxDistance(p: vec2f, lo: vec2f, hi: vec2f) -> f32 {
  let c = 0.5 * (lo + hi);
  let q = abs(p - c) - 0.5 * (hi - lo);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
}

const CRACK = vec2f(0.19, 0.84);

fn cliffFace(y: f32) -> f32 {
  let rough = 0.012 * sin(y * 23.0) + 0.008 * sin(y * 61.0 + 1.3) + 0.004 * sin(y * 150.0);
  let overhang = 0.03 * smoothstep(0.75, 1.0, y);
  let crack = 0.07 * (1.0 - smoothstep(0.0, 0.028, abs(y - CRACK.y)));
  return 0.23 + rough + overhang - crack;
}

fn rockUnits(p: vec2f) -> f32 {
  let cliff = p.x - cliffFace(p.y);
  let ledge = boxDistance(p, vec2f(0.1, 0.55 + 0.02 * p.x), vec2f(0.46, 0.6 + 0.02 * p.x)) - 0.01;
  let dropX = 0.95 + 0.02 * sin(p.y * 40.0);
  let floorTop = 0.3 + 0.012 * sin(p.x * 9.0) - 0.03 * smoothstep(dropX - 0.3, dropX, p.x);
  let mesa = boxDistance(p, vec2f(-1.0, -1.0), vec2f(dropX, floorTop)) - 0.005;
  return min(cliff, min(ledge, mesa));
}

fn rock(p: vec2f, grid: vec2i) -> f32 {
  let h = f32(grid.y);
  return rockUnits(p / h) * h;
}

fn rockNormal(p: vec2f, grid: vec2i) -> vec2f {
  let e = vec2f(0.5, 0.0);
  let n = vec2f(rock(p + e.xy, grid) - rock(p - e.xy, grid), rock(p + e.yx, grid) - rock(p - e.yx, grid));
  return n / max(length(n), 1e-6);
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> tick: Step;

struct Particle {
  pos: vec2f,
  vel: vec2f,
  C: mat2x2f,
  F: mat2x2f,
  tone: f32,
  vc: f32,
}

struct Node { x: atomic<i32>, y: atomic<i32>, m: atomic<i32> }

@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read> gridVel: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> nodes: array<Node>;

const FIXED = 65536.0;
const MASS = 1.0;
const VOLUME = 0.25;
const MAX_VC = 0.6;
const BAND_SECONDS = 7.0;

fn weights(fx: vec2f) -> array<vec2f, 3> {
  return array<vec2f, 3>(
    0.5 * (1.5 - fx) * (1.5 - fx),
    0.75 - (fx - 1.0) * (fx - 1.0),
    0.5 * (fx - 0.5) * (fx - 0.5));
}

fn nodeIndex(c: vec2i) -> i32 {
  let q = clamp(c, vec2i(0), params.grid - 1);
  return q.y * params.grid.x + q.x;
}

fn spawn(i: u32) -> Particle {
  let seed = i * 7919u + tick.index * 104729u;
  let jitter = vec2f(hash11(seed), hash11(seed + 1u)) - 0.5;
  let h = f32(params.grid.y);
  var p: Particle;
  p.pos = (CRACK + jitter * vec2f(0.012, 0.03)) * h;
  p.vel = vec2f(0.2 + 0.04 * jitter.y, -0.05) * h;
  p.C = mat2x2f(0.0, 0.0, 0.0, 0.0);
  p.F = mat2x2f(1.0, 0.0, 0.0, 1.0);
  p.vc = 0.0;
  p.tone = 1.0 - abs(2.0 * fract(f32(tick.index) * params.dt / BAND_SECONDS) - 1.0);
  return p;
}

fn gather(p: ptr<function, Particle>) {
  let base = vec2i(floor((*p).pos - 0.5));
  let fx = (*p).pos - vec2f(base);
  let w = weights(fx);
  var v = vec2f(0.0);
  var C = mat2x2f(0.0, 0.0, 0.0, 0.0);
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      let weight = w[i].x * w[j].y;
      let dpos = vec2f(f32(i), f32(j)) - fx;
      let gv = gridVel[nodeIndex(base + vec2i(i, j))];
      v += weight * gv;
      C += 4.0 * weight * mat2x2f(gv * dpos.x, gv * dpos.y);
    }
  }
  (*p).vel = v;
  (*p).C = C;
}

struct Svd { U: mat2x2f, s: vec2f, Vt: mat2x2f }

fn rotation(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(c, s, -s, c);
}

fn svd2(M: mat2x2f) -> Svd {
  let e = 0.5 * (M[0][0] + M[1][1]);
  let f = 0.5 * (M[0][0] - M[1][1]);
  let g = 0.5 * (M[0][1] + M[1][0]);
  let h = 0.5 * (M[0][1] - M[1][0]);
  let q = sqrt(e * e + h * h);
  let r = sqrt(f * f + g * g);
  let a1 = atan2(g, f);
  let a2 = atan2(h, e);
  return Svd(rotation(0.5 * (a2 + a1)), vec2f(q + r, q - r), rotation(0.5 * (a2 - a1)));
}

fn projectSand(eps: vec2f) -> vec2f {
  let tr = eps.x + eps.y;
  if (tr >= 0.0) { return vec2f(0.0); }
  let dev = eps - 0.5 * tr;
  let devNorm = length(dev);
  let yieldAmount = devNorm + (params.lambda + params.mu) / params.mu * tr * params.alpha;
  if (yieldAmount <= 0.0 || devNorm < 1e-9) { return eps; }
  return eps - yieldAmount * dev / devNorm;
}

fn scatter(p: Particle, U: mat2x2f, eps: vec2f) {
  let principal = 2.0 * params.mu * eps + params.lambda * (eps.x + eps.y);
  let tau = U * mat2x2f(principal.x, 0.0, 0.0, principal.y) * transpose(U);
  let affine = -params.dt * VOLUME * 4.0 * tau + MASS * p.C;

  let base = vec2i(floor(p.pos - 0.5));
  let fx = p.pos - vec2f(base);
  let w = weights(fx);
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      let weight = w[i].x * w[j].y;
      let dpos = vec2f(f32(i), f32(j)) - fx;
      let momentum = weight * (MASS * p.vel + affine * dpos);
      let n = nodeIndex(base + vec2i(i, j));
      atomicAdd(&nodes[n].x, i32(round(clamp(momentum.x, -1e4, 1e4) * FIXED)));
      atomicAdd(&nodes[n].y, i32(round(clamp(momentum.y, -1e4, 1e4) * FIXED)));
      atomicAdd(&nodes[n].m, i32(round(weight * MASS * FIXED)));
    }
  }
}

fn outOfWorld(pos: vec2f) -> bool {
  return pos.y < 3.0 || pos.x > f32(params.grid.x) - 3.0 || pos.x < 3.0 || pos.y > f32(params.grid.y) - 3.0;
}

@compute @workgroup_size(256)
fn stepParticles(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  let bornAt = u32(f32(i) / params.birthPerStep);
  if (tick.index < bornAt) { return; }

  var p = particles[i];
  var U = mat2x2f(1.0, 0.0, 0.0, 1.0);
  var eps = vec2f(0.0);
  if (tick.index == bornAt) {
    p = spawn(i);
  } else {
    gather(&p);
    let maxSpeed = 0.9 / params.dt;
    p.vel *= min(1.0, maxSpeed / max(length(p.vel), 1e-6));
    p.pos += params.dt * p.vel;
    let d = rock(p.pos, params.grid);
    if (d < 0.0) { p.pos -= d * rockNormal(p.pos, params.grid); }
    if (outOfWorld(p.pos)) { p = spawn(i); }
    let F = (mat2x2f(1.0, 0.0, 0.0, 1.0) + params.dt * p.C) * p.F;
    let svd = svd2(F);
    let logS = log(max(svd.s, vec2f(1e-4)));
    eps = projectSand(logS + 0.5 * p.vc);
    p.vc = min(p.vc + (logS.x + logS.y) - (eps.x + eps.y), MAX_VC);
    U = svd.U;
    let s = exp(eps);
    p.F = U * mat2x2f(s.x, 0.0, 0.0, s.y) * svd.Vt;
  }
  particles[i] = p;
  scatter(p, U, eps);
}

struct NodeSum { x: i32, y: i32, m: i32 }

@group(0) @binding(1) var<storage, read_write> nodeSums: array<NodeSum>;
@group(0) @binding(2) var<storage, read_write> gridVelOut: array<vec2f>;

const FRICTION = 0.8;

fn collide(v: vec2f, pos: vec2f) -> vec2f {
  let d = rock(pos, params.grid);
  if (d > 1.0) { return v; }
  let n = rockNormal(pos, params.grid);
  let vn = dot(v, n);
  if (vn >= 0.0) { return v; }
  let vt = v - vn * n;
  let speed = length(vt);
  return vt * max(0.0, 1.0 - FRICTION * -vn / max(speed, 1e-6));
}

@compute @workgroup_size(16, 16)
fn stepGrid(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (any(c >= params.grid)) { return; }
  let i = c.y * params.grid.x + c.x;
  let node = nodeSums[i];
  nodeSums[i] = NodeSum(0, 0, 0);
  var v = vec2f(0.0);
  if (node.m > 0) {
    v = vec2f(f32(node.x), f32(node.y)) / f32(node.m);
    v.y -= params.dt * params.gravity;
    v = collide(v, vec2f(c));
  }
  gridVelOut[i] = v;
}

struct Pixel {
  count: atomic<u32>,
  speed: atomic<u32>,
  tone: atomic<u32>,
}

@group(0) @binding(2) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(3) var<storage, read_write> canvas: array<Pixel>;
@group(0) @binding(4) var<storage, read_write> density: array<vec2f>;

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count || u32(f32(i) / params.birthPerStep) >= tick.index) { return; }
  let p = particlesIn[i];
  let size = params.grid * 2;
  let c = clamp(vec2i(floor(p.pos * 2.0)), vec2i(0), size - 1);
  let k = c.y * size.x + c.x;
  atomicAdd(&canvas[k].count, 1u);
  atomicAdd(&canvas[k].speed, u32(min(length(p.vel) / f32(params.grid.y), 4.0) * 256.0));
  atomicAdd(&canvas[k].tone, u32(p.tone * 256.0));
}

@compute @workgroup_size(16, 16)
fn soften(@builtin(global_invocation_id) id: vec3u) {
  let size = params.grid * 2;
  let c = vec2i(id.xy);
  if (any(c >= size)) { return; }
  var sum = 0.0;
  var tone = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let q = c + vec2i(i, j);
      if (all(q >= vec2i(0)) && all(q < size)) {
        let w = f32((3 - abs(i)) * (3 - abs(j)));
        let k = q.y * size.x + q.x;
        sum += w * f32(atomicLoad(&canvas[k].count));
        tone += w * f32(atomicLoad(&canvas[k].tone)) / 256.0;
      }
    }
  }
  density[c.y * size.x + c.x] = vec2f(sum / 81.0, tone / max(sum, 1e-6));
}

struct View {
  size: vec2f,
}

struct PixelSum { count: u32, speed: u32, tone: u32 }

@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> canvasIn: array<PixelSum>;
@group(0) @binding(3) var<storage, read> densityIn: array<vec2f>;

const ROWS = 270.0;
const SUN = vec2f(1.32, 0.62);
const LIGHT = vec2f(0.8, 0.6);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn rgb(h: u32) -> vec3f {
  return vec3f(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0;
}

fn toWorld(px: vec2f) -> vec2f {
  let aspect = f32(params.grid.x) / f32(params.grid.y);
  let scale = max(view.size.x / aspect, view.size.y);
  let origin = 0.5 * (view.size - vec2f(aspect, 1.0) * scale);
  let q = (px - origin) / scale;
  return vec2f(q.x, 1.0 - q.y);
}

fn sky(p: vec2f) -> vec3f {
  var c = mix(rgb(0xf6a15eu), rgb(0xc4507au), smoothstep(0.25, 0.62, p.y));
  c = mix(c, rgb(0x2b1d52u), smoothstep(0.6, 1.0, p.y));
  let d = length(p - SUN);
  c = mix(c, rgb(0xffcf8au), 0.35 * exp(-d * 6.0));
  return mix(c, rgb(0xffe6b0u), step(d, 0.085));
}

fn escarpment(p: vec2f, c: vec3f) -> vec3f {
  var out = c;
  for (var k = 0; k < 3; k++) {
    let f = f32(k);
    let x = p.x * (1.0 + 0.6 * f) + 3.1 * f;
    let top = 0.5 - 0.07 * f + 0.05 * smoothstep(0.2, 0.6, fract(x * 0.35)) * step(fract(x * 0.35), 0.8)
            + 0.008 * sin(x * 13.0);
    let haze = mix(rgb(0xd9737au), rgb(0x5a2a5cu), f / 2.0);
    out = select(out, haze, p.y < top);
  }
  return out;
}

fn sandstone(p: vec2f) -> vec3f {
  let grid = params.grid;
  let cells = p * f32(grid.y);
  let y = p.y + 0.01 * sin(p.x * 17.0) + 0.004 * sin(p.x * 53.0 + p.y * 9.0);
  let bed = fract(y * 9.0 + 0.35 * sin(y * 23.0));
  let shade = hash11(u32(floor(y * 9.0 + 0.35 * sin(y * 23.0)) + 1000.0));
  var c = mix(rgb(0x6b2c44u), rgb(0x9a4a4au), shade);
  c = mix(c, rgb(0x4a1f3fu), smoothstep(0.8, 0.97, bed));
  c = mix(c, rgb(0x3d1a3cu), smoothstep(0.02, 0.0, abs(y - 0.93)));
  let n = rockNormal(cells, grid);
  let depth = -rock(cells, grid) / f32(grid.y);
  let rim = 1.0 - smoothstep(0.0, 0.03, depth);
  return mix(c, rgb(0xf08a5au), 0.7 * rim * max(dot(n, normalize(LIGHT)), 0.0));
}

fn canvasIndex(c: vec2i) -> i32 {
  let size = params.grid * 2;
  let q = clamp(c, vec2i(0), size - 1);
  return q.y * size.x + q.x;
}

fn sandTone(t: f32) -> vec3f {
  return mix(mix(rgb(0xa8433cu), rgb(0xe0914cu), smoothstep(0.1, 0.5, t)), rgb(0xf6dcaau), smoothstep(0.55, 0.95, t));
}

fn sand(p: vec2f) -> vec4f {
  let size = params.grid * 2;
  let c = vec2i(floor(p * f32(params.grid.y) * 2.0));
  if (any(c < vec2i(0)) || any(c >= size)) { return vec4f(0.0); }
  let here = canvasIn[canvasIndex(c)];
  let soft = densityIn[canvasIndex(c)];
  let d = soft.x;
  if (here.count == 0u && d < 0.3) { return vec4f(0.0); }
  let slope = vec2f(densityIn[canvasIndex(c + vec2i(1, 0))].x - densityIn[canvasIndex(c - vec2i(1, 0))].x,
                    densityIn[canvasIndex(c + vec2i(0, 1))].x - densityIn[canvasIndex(c - vec2i(0, 1))].x);
  let n = -slope / max(length(slope), 1e-4);
  let surface = smoothstep(0.02, 0.15, length(slope)) * (1.0 - smoothstep(0.55, 0.85, d));
  let lit = dot(n, normalize(LIGHT)) * surface;
  let grains = max(f32(here.count), 1.0);
  var col = sandTone(soft.y);
  col *= 0.92 + 0.35 * lit;
  let speed = f32(here.speed) / 256.0 / grains;
  col = mix(col, rgb(0xfff0c8u), smoothstep(0.5, 1.5, speed) * 0.4);
  return vec4f(col, 1.0);
}

fn bayer(p: vec2u) -> f32 {
  let m = array<f32, 16>(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[(p.y % 4u) * 4u + (p.x % 4u)] / 16.0 - 0.47;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let block = max(1.0, floor(view.size.y / ROWS));
  let px = floor(pos.xy / block) * block + 0.5 * block;
  let p = toWorld(px);
  var c = escarpment(p, sky(p));
  if (rock(p * f32(params.grid.y), params.grid) < 0.0) { c = sandstone(p); }
  let s = sand(p);
  c = mix(c, s.rgb, s.a);
  let levels = 12.0;
  c = floor(c * levels + 0.5 + bayer(vec2u(pos.xy / block))) / levels;
  return vec4f(c, 1.0);
}
