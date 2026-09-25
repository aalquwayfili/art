struct Params {
  count: u32,
  dt: f32,
  res: vec2f,
}

struct Step { time: f32 }
struct View { size: vec2f, time: f32 }

struct Grain {
  pos: vec4f,
  vel: vec4f,
  home: vec4f,
  goal: vec4f,
  normal: vec4f,
}

const PI = 3.14159265;
const TAU = 6.2831853;
const EYE = vec3f(0.0, 1.8, 2.75);
const LOOK = vec3f(0.0, 0.28, 0.0);
const TAN_HALF = 0.37;
const LIGHT = vec3f(-0.42, 0.85, 0.32);
const HEAP = 0.3;

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn hash2(p: vec2f) -> f32 {
  let q = vec2u(vec2i(floor(p)) + vec2i(4096));
  return hash(q.x * 1973u + q.y * 9277u);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn cylinder(p: vec3f, r: f32, y0: f32, y1: f32) -> f32 {
  let d = vec2f(length(p.xz) - r, abs(p.y - 0.5 * (y0 + y1)) - 0.5 * (y1 - y0));
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

fn lattice(p: vec3f) -> f32 {
  let base = min(cylinder(p, 0.2, 0.0, 0.07) - 0.01, cylinder(p, 0.075, 0.0, 0.34) - 0.008);
  let c = p - vec3f(0.0, 0.62, 0.0);
  let q = c * 15.0;
  let gyroid = abs(dot(sin(q), cos(q.yzx))) / 15.0 * 0.55 - 0.012;
  let ball = max(abs(length(c) - 0.23) - 0.07, gyroid);
  return min(base, ball);
}

fn latticeNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.002, 0.0);
  return normalize(vec3f(lattice(p + e.xyy) - lattice(p - e.xyy),
                         lattice(p + e.yxy) - lattice(p - e.yxy),
                         lattice(p + e.yyx) - lattice(p - e.yyx)));
}

fn spin(t: f32) -> f32 { return 0.1 * t; }

fn rotY(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn launchTime(i: u32, h: f32) -> f32 { return 6.4 + 3.2 * (0.75 * h + 0.25 * hash(i * 3u + 1u)); }
fn releaseTime(i: u32, h: f32) -> f32 { return 17.0 + 2.6 * (0.7 * (1.0 - h) + 0.3 * hash(i * 3u + 2u)); }

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> tick: Step;
@group(0) @binding(2) var<storage, read_write> grains: array<Grain>;

@compute @workgroup_size(256)
fn init(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  let a = TAU * hash(i * 7u);
  let r = HEAP * sqrt(hash(i * 7u + 1u));
  let rough = 0.012 * hash(i * 7u + 2u);
  let home = vec3f(r * cos(a), 0.2 * (1.0 - r / HEAP) * (1.0 - r / HEAP * 0.4) + rough, r * sin(a));
  var p = vec3f(hash(i * 7u + 3u) - 0.5, hash(i * 7u + 4u), hash(i * 7u + 5u) - 0.5) * vec3f(0.62, 0.95, 0.62);
  for (var k = 0; k < 10; k++) { p -= lattice(p) * latticeNormal(p); }
  grains[i] = Grain(vec4f(home, 0.0), vec4f(0.0), vec4f(home, 0.0),
                    vec4f(p, clamp(p.y / 0.9, 0.0, 1.0)), vec4f(latticeNormal(p), 0.0));
}

@compute @workgroup_size(256)
fn advect(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  var g = grains[i];
  let t = tick.time;
  let dt = params.dt;
  let launch = launchTime(i, g.goal.w);
  let release = releaseTime(i, g.goal.w);
  var pos = g.pos.xyz;
  var vel = g.vel.xyz;
  if (t < launch) {
    let shake = smoothstep(5.6, 6.0, t) * step(t, launch);
    pos = g.home.xyz + vec3f(0.0, shake * 0.012 * hash(i + u32(t * 30.0) * 7919u), 0.0);
    vel = vec3f(0.0);
  } else if (t < release) {
    let aim = rotY(g.goal.xyz, spin(t));
    let to = aim - pos;
    let far = min(length(to), 0.7);
    var acc = 34.0 * to - 8.5 * vel;
    acc += vec3f(-pos.z, 0.0, pos.x) * 22.0 * far + vec3f(0.0, 5.0 * far, 0.0);
    vel += acc * dt;
    pos += vel * dt;
  } else if (t < 21.0) {
    if (t - release < dt) {
      vel += rotY(g.normal.xyz, spin(t)) * (0.08 + 0.25 * hash(i * 5u)) - vel * 0.8;
    }
    vel.y -= 5.5 * dt;
    vel *= 0.995;
    pos += vel * dt;
    let ground = 0.004 + 0.01 * hash(i * 11u);
    if (pos.y < ground) {
      pos.y = ground;
      vel = vec3f(vel.x * 0.55, -vel.y * 0.2, vel.z * 0.55);
    }
  } else {
    let k = smoothstep(21.0, 23.8, t);
    pos = mix(pos, g.home.xyz, min(1.0, (0.3 + 12.0 * k * k) * dt));
    vel = vec3f(0.0);
    if (t > 23.85) { pos = g.home.xyz; }
  }
  g.pos = vec4f(pos, 0.0);
  g.vel = vec4f(vel, 0.0);
  grains[i] = g;
}

fn basis() -> mat3x3f {
  let f = normalize(LOOK - EYE);
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  return mat3x3f(r, cross(r, f), f);
}

fn ray(px: vec2f) -> vec3f {
  let b = basis();
  let ndc = vec2f(px.x / params.res.x * 2.0 - 1.0, 1.0 - px.y / params.res.y * 2.0);
  let aspect = params.res.x / params.res.y;
  return normalize(b[2] + b[0] * ndc.x * TAN_HALF * aspect + b[1] * ndc.y * TAN_HALF);
}

@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> grainsIn: array<Grain>;
@group(0) @binding(3) var<storage, read_write> image: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> shadow: array<atomic<u32>>;

const SHADOW_SIZE = 192u;
const SHADOW_EXTENT = 1.6;

fn circleLight(t: f32) -> f32 {
  let flare = smoothstep(5.5, 5.8, t) * (1.0 - smoothstep(6.4, 8.0, t));
  let charge = 0.35 * smoothstep(6.4, 7.5, t) * (1.0 - smoothstep(10.5, 13.0, t));
  return max(flare, charge);
}

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  let g = grainsIn[i];
  let t = view.time;
  let pos = g.pos.xyz;
  let L = normalize(LIGHT);

  let f = pos.xz - L.xz * (pos.y / L.y);
  let sc = vec2i(floor((f / SHADOW_EXTENT * 0.5 + 0.5) * f32(SHADOW_SIZE)));
  if (all(sc >= vec2i(0)) && all(sc < vec2i(i32(SHADOW_SIZE))) && pos.y > 0.03) {
    atomicAdd(&shadow[u32(sc.y) * SHADOW_SIZE + u32(sc.x)], 1u);
  }

  let b = basis();
  let d = pos - EYE;
  let z = dot(d, b[2]);
  let aspect = params.res.x / params.res.y;
  let ndc = vec2f(dot(d, b[0]) / (z * TAN_HALF * aspect), dot(d, b[1]) / (z * TAN_HALF));
  let px = vec2i(floor(vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * params.res));
  let size = vec2i(params.res);
  if (any(px < vec2i(0)) || any(px >= size) || z < 0.1) { return; }

  let held = 1.0 - smoothstep(0.01, 0.05, distance(pos, rotY(g.goal.xyz, spin(t))));
  let onHeap = 1.0 - smoothstep(0.02, 0.06, distance(pos, g.home.xyz));
  let radial = normalize(vec3f(g.home.x, 0.0, g.home.z) + 1e-5);
  let heapN = normalize(radial * 0.6 + vec3f(0.0, 1.0, 0.0));
  var n = mix(normalize(-d), heapN, onHeap);
  n = normalize(mix(n, rotY(g.normal.xyz, spin(t)), held));

  let grit = 0.85 + 0.3 * hash(i * 13u);
  let lamp = 0.14 + 0.8 * max(dot(n, L), 0.0);
  let glow = circleLight(t) * max(0.2 - n.y * 0.8, 0.0) * (1.0 - smoothstep(0.0, 0.9, pos.y));
  let lum = clamp((lamp + 0.5 * glow) * grit, 0.0, 1.0);
  let depth = u32(clamp((z - 1.0) / 4.0, 0.0, 1.0) * 1048575.0);
  let key = ((1048575u - depth) << 12u) | (u32(lum * 255.0) << 4u) | u32(clamp(glow * 30.0, 0.0, 15.0));
  let solid = select(1, 2, max(held, onHeap) > 0.5);
  for (var k = 0; k < solid * solid; k++) {
    let q = min(px + vec2i(k % 2, k / 2), size - 1);
    atomicMax(&image[u32(q.y * size.x + q.x)], key);
  }
}

@group(0) @binding(2) var<storage, read> imageIn: array<u32>;
@group(0) @binding(3) var<storage, read> shadowIn: array<u32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn rgb(h: u32) -> vec3f {
  return vec3f(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0;
}

const W = 0.009;

fn stroke(d: f32, u: f32, start: f32, dur: f32, t: f32) -> f32 {
  let progress = clamp((t - start) / dur, 0.0, 1.0);
  return select(0.0, 1.0, d < W && u <= progress);
}

fn ring(p: vec2f, R: f32, seed: f32, start: f32, dur: f32, t: f32) -> f32 {
  let a = atan2(p.y, p.x);
  var v = 0.0;
  for (var k = 0; k < 2; k++) {
    let fk = f32(k);
    let u = fract((a - seed * TAU - fk * 1.9) / TAU);
    let wobble = R + 0.005 * sin(2.0 * a + seed * 9.0 + fk * 2.0) + 0.003 * sin(7.0 * a + fk * 5.0) + 0.004 * fk;
    v = max(v, stroke(abs(length(p) - wobble), u, start + fk * 0.35 * dur, dur, t));
  }
  return v;
}

fn segment(p: vec2f, a: vec2f, b: vec2f, start: f32, dur: f32, t: f32) -> f32 {
  let ba = b - a;
  let h = dot(p - a, ba) / dot(ba, ba);
  let d = length(p - a - ba * clamp(h, -0.03, 1.03));
  return stroke(d, clamp(h, 0.0, 1.0), start, dur, t);
}

fn polar(r: f32, a: f32) -> vec2f { return r * vec2f(cos(a), sin(a)); }

fn glyph(q: vec2f, bits: u32) -> f32 {
  let w = W / 0.04;
  var d = 1e3;
  if ((bits & 1u) != 0u) { d = min(d, abs(q.x + 0.45) + max(abs(q.y) - 0.8, 0.0)); }
  if ((bits & 2u) != 0u) { d = min(d, abs(length(q - vec2f(0.3, 0.1)) - 0.42)); }
  if ((bits & 4u) != 0u) { d = min(d, abs(q.y - 0.7) + max(abs(q.x) - 0.8, 0.0)); }
  if ((bits & 8u) != 0u) { d = min(d, abs(q.x - q.y) * 0.707 + max(abs(q.x) - 0.75, 0.0)); }
  if ((bits & 16u) != 0u) { d = min(d, length(q - vec2f(0.55, -0.6)) - 0.1); }
  if ((bits & 32u) != 0u) { d = min(d, max(abs(length(q + vec2f(0.0, 0.6)) - 0.5), q.y + 0.6)); }
  return select(0.0, 1.0, d < w);
}

fn circle(p: vec2f, t: f32) -> f32 {
  var c = ring(p, 1.13, 0.1, 0.3, 1.2, t);
  c = max(c, ring(p, 1.02, 0.6, 1.2, 1.0, t));
  let a = atan2(p.y, p.x) + PI;
  let cells = 36.0;
  let cell = floor(a / TAU * cells);
  let local = vec2f((fract(a / TAU * cells) - 0.5) * TAU * 1.075 / cells, length(p) - 1.075) / 0.04;
  let shown = step(2.0 + 1.3 * cell / cells, t);
  let bits = u32(hash(u32(cell) + 11u) * 63.0) | (1u << (u32(cell) % 5u));
  c = max(c, shown * glyph(local, bits));
  c = max(c, shown * select(0.0, 1.0, abs(local.x) > 2.05 && abs(local.y) < 0.9));
  for (var k = 0; k < 7; k++) {
    let a0 = PI * 0.5 + f32(k * 3 % 7) * TAU / 7.0;
    let a1 = PI * 0.5 + f32((k + 1) * 3 % 7) * TAU / 7.0;
    c = max(c, segment(p, polar(1.0, a0), polar(1.0, a1), 3.0 + 0.2 * f32(k), 0.22, t));
  }
  for (var k = 0; k < 7; k++) {
    let o = polar(0.745, PI * 0.5 + (f32(k) + 0.5) * TAU / 7.0);
    c = max(c, ring(p - o, 0.06, f32(k) * 0.3, 4.4 + 0.08 * f32(k), 0.3, t));
  }
  c = max(c, ring(p, 0.52, 0.3, 4.2, 0.6, t));
  for (var k = 0; k < 3; k++) {
    c = max(c, segment(p, polar(0.52, -PI * 0.5 + f32(k) * TAU / 3.0), polar(0.52, -PI * 0.5 + f32(k + 1) * TAU / 3.0),
                       4.8 + 0.15 * f32(k), 0.16, t));
  }
  return max(c, ring(p, 0.34, 0.8, 5.0, 0.5, t));
}

fn crackle(p: vec2f, t: f32) -> f32 {
  let on = step(5.55, t) * step(t, 7.2);
  if (on == 0.0) { return 0.0; }
  let frame = u32(t * 12.0);
  var v = 0.0;
  for (var k = 0u; k < 7u; k++) {
    let s = frame * 31u + k * 7u;
    let a = TAU * hash(s);
    let A = polar(mix(0.5, 1.1, hash(s + 1u)), a);
    let B = polar(mix(0.5, 1.1, hash(s + 2u)), a + mix(0.3, 1.1, hash(s + 3u)));
    let ab = B - A;
    let u = dot(p - A, ab) / dot(ab, ab);
    let side = dot(p - A, vec2f(-ab.y, ab.x)) / length(ab);
    let jag = 0.07 * (noise(vec2f(u * 9.0, f32(s))) - 0.5) * sin(PI * clamp(u, 0.0, 1.0));
    v = max(v, select(0.0, 1.0, u > 0.0 && u < 1.0 && abs(side - jag) < 0.008));
  }
  return v;
}

fn stone(f: vec2f) -> vec3f {
  let size = vec2f(0.9, 0.6);
  let row = floor(f.y / size.y);
  let g = vec2f(f.x / size.x + 0.5 * hash(u32(row + 100.0)), f.y / size.y);
  let e = abs(fract(g) - 0.5) * size;
  let seam = smoothstep(0.012, 0.004, min(0.5 * size.x - e.x, 0.5 * size.y - e.y));
  let slab = hash2(floor(g) + 37.0);
  let grain = noise(f * 30.0) * 0.5 + noise(f * 90.0) * 0.3 + noise(f * 6.0) * 0.4;
  var c = mix(rgb(0x1a1c21u), rgb(0x2c2d31u), 0.35 * slab + 0.5 * grain);
  return mix(c, rgb(0x0c0d10u), seam);
}

fn bayer(p: vec2u) -> f32 {
  let m = array<f32, 16>(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[(p.y % 4u) * 4u + (p.x % 4u)] / 16.0 - 0.47;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let scale = max(view.size.x / params.res.x, view.size.y / params.res.y);
  let origin = 0.5 * (view.size - params.res * scale);
  let px = floor((frag.xy - origin) / scale);
  let t = view.time;
  let size = vec2i(params.res);
  let ip = clamp(vec2i(px), vec2i(0), size - 1);
  let key = imageIn[ip.y * size.x + ip.x];
  let light = circleLight(t);

  var c: vec3f;
  if (key != 0u) {
    let lum = f32((key >> 4u) & 255u) / 255.0;
    let cold = f32(key & 15u) / 15.0;
    c = mix(rgb(0x1b1a1cu), rgb(0x9c9384u), smoothstep(0.0, 0.7, lum));
    c = mix(c, rgb(0xe6dccbu), smoothstep(0.7, 1.0, lum));
    c = mix(c, rgb(0xcfe6ffu), cold);
  } else {
    let dir = ray(px + 0.5);
    let f = EYE.xz + dir.xz * (-EYE.y / min(dir.y, -1e-3));
    let r = length(f);
    let lamp = 0.25 + 0.9 * exp(-dot(f, f) * 0.5) + 0.3 * light * step(r, 1.14);
    c = stone(f) * lamp;
    let sc = vec2i(floor((f / SHADOW_EXTENT * 0.5 + 0.5) * f32(SHADOW_SIZE)));
    if (all(sc >= vec2i(0)) && all(sc < vec2i(i32(SHADOW_SIZE)))) {
      let n = f32(shadowIn[u32(sc.y) * SHADOW_SIZE + u32(sc.x)]);
      c *= 1.0 - 0.6 * smoothstep(0.0, 3.0e-5 * f32(params.count), n);
    }
    let tooth = hash2(px * 1.0 + 7.0);
    let erased = step(tooth, smoothstep(20.5, 23.6, t) * 1.05);
    let chalk = circle(f, t) * step(0.22, tooth) * (1.0 - erased);
    let chalkCol = mix(rgb(0xb8b3a6u), rgb(0xf2f8ffu), light) * mix(0.8, 1.0, tooth);
    c = mix(c, chalkCol, chalk);
    c = mix(c, rgb(0xf4fbffu), crackle(f, t));
    c *= 1.0 - smoothstep(2.2, 4.5, length(f - EYE.xz * 0.2));
  }
  let levels = 14.0;
  c = floor(c * levels + 0.5 + bayer(vec2u(px))) / levels;
  return vec4f(c, 1.0);
}
