struct U {
  time: f32,
  aspect: f32,
  shadow: f32,
  count: u32,
  low: vec2f,
  screen: vec2f,
  core: u32,
  grid: u32,
}

struct Plate {
  pos: vec4f,
  ax: vec4f,
  ay: vec4f,
  az: vec4f,
}

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> plates: array<Plate>;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
@group(0) @binding(4) var scene: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> placed: array<Plate>;

const PI = 3.14159265;
const LOOP = 24.0;
const CORE = 1.0;
const SHELL = 1.12;
const THICK = 0.028;
const SHARDS = 13u;
const GROUND = -2.4;
const EYE = vec3f(0.0, -0.3, 5.2);
const TARGET = vec3f(0.0, 0.12, 0.0);
const FOV = 0.8;
const LIGHT_BOX = 2.7;

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn hash2(x: u32, y: u32) -> f32 { return hash(x * 73856093u + hash32(y)); }

fn hash32(n: u32) -> u32 { return u32(hash(n) * 4294967040.0); }

fn hash3(n: u32) -> vec3f {
  return vec3f(hash(n), hash(n + 0x9e3779b9u), hash(n + 0x7f4a7c15u)) * 2.0 - 1.0;
}

fn rotate(v: vec3f, axis: vec3f, a: f32) -> vec3f {
  return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a));
}

fn sunDir(t: f32) -> vec3f {
  let a = 2.35 + t * 2.0 * PI / 72.0;
  let e = 0.3 + 0.08 * sin(t * 2.0 * PI / 72.0);
  return vec3f(cos(a) * cos(e), sin(e), sin(a) * cos(e));
}

fn camera() -> mat3x3f {
  let f = normalize(TARGET - EYE);
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  return mat3x3f(r, cross(r, f), f);
}

fn lightSpace(w: vec3f) -> vec3f {
  let s = sunDir(u.time);
  let r = normalize(cross(s, vec3f(0.0, 1.0, 0.0)));
  return vec3f(dot(w, r) / LIGHT_BOX, dot(w, cross(r, s)) / LIGHT_BOX, 0.5 - dot(w, s) / 24.0);
}

fn toClip(w: vec3f) -> vec4f {
  if (u.shadow > 0.5) { return vec4f(lightSpace(w), 1.0); }
  let v = (w - EYE) * camera();
  let focal = 1.0 / tan(0.5 * FOV);
  let near = 0.05;
  let far = 200.0;
  return vec4f(v.x * focal / u.aspect, v.y * focal, (v.z - near) * far / (far - near), v.z);
}

fn site(k: u32) -> vec3f {
  let z = 1.0 - 2.0 * (f32(k) + 0.5) / f32(SHARDS);
  let a = f32(k) * 2.39996323;
  let r = sqrt(1.0 - z * z);
  return normalize(vec3f(r * cos(a), z, r * sin(a)) + 0.3 * hash3(k * 7u + 3u));
}

fn opening(k: u32, t: f32) -> f32 {
  let p = fract(t / LOOP);
  let d = 0.12 * hash(k * 13u + 1u);
  return smoothstep(0.08 + d, 0.42 + d, p) * (1.0 - smoothstep(0.62 + 0.5 * d, 0.94, p));
}

@compute @workgroup_size(64)
fn placePlates(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.count) { return; }
  let z = 1.0 - 2.0 * (f32(i) + 0.5) / f32(u.count);
  let a = 2.0 * PI * fract(f32(i) * 0.381966011);
  let rxz = sqrt(max(1.0 - z * z, 0.0));
  let n = vec3f(rxz * cos(a), z, rxz * sin(a));

  var best = -2.0;
  var second = -2.0;
  var k = 0u;
  for (var s = 0u; s < SHARDS; s++) {
    let d = dot(n, site(s));
    if (d > best) { second = best; best = d; k = s; } else if (d > second) { second = d; }
  }
  let crack = 1.0 - smoothstep(0.0, 0.03, best - second);

  let tilt = 0.09 * hash3(i * 3u + 1u);
  var az = normalize(n + tilt - n * dot(tilt, n));
  var ax = normalize(cross(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(az.y) > 0.9), az));
  var ay = cross(az, ax);
  var p = n * SHELL;

  let o = opening(k, u.time);
  let sk = site(k);
  let h = hash(k * 31u + 5u);
  let lift = o * select(0.35 + 0.6 * h, 0.03, h < 0.2);
  let axis = normalize(cross(sk, hash3(k * 17u + 9u)));
  let turn = o * (0.12 + 0.3 * hash(k * 5u + 2u)) * select(-1.0, 1.0, h > 0.55);
  let pivot = sk * SHELL;
  p = pivot + rotate(p - pivot, axis, turn) + sk * lift;
  ax = rotate(ax, axis, turn);
  ay = rotate(ay, axis, turn);
  az = rotate(az, axis, turn);

  let loose = o * o * (0.02 + 0.98 * crack * crack);
  let r = hash3(i * 5u + 7u);
  p += (az * (0.25 + 0.6 * abs(r.x)) + cross(az, r) * 0.35) * loose * 0.7;
  let tumbleAxis = normalize(r + vec3f(0.0, 0.0, 0.001));
  let tumble = loose * 3.0 * r.y;
  ax = rotate(ax, tumbleAxis, tumble);
  ay = rotate(ay, tumbleAxis, tumble);
  az = rotate(az, tumbleAxis, tumble);

  let spin = u.time * 2.0 * PI / (4.0 * LOOP);
  let up = vec3f(0.0, 1.0, 0.0);
  placed[i] = Plate(vec4f(rotate(p, up, spin), o), vec4f(rotate(ax, up, spin), 0.0),
                    vec4f(rotate(ay, up, spin), 0.0), vec4f(rotate(az, up, spin), 0.0));
}

struct Lit {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) albedo: vec3f,
  @location(3) @interpolate(flat) kind: u32,
}

fn corner(i: u32, k: u32, size: f32) -> vec2f {
  let j = k % 6u;
  let a = 2.0 * PI * hash(i * 11u) + f32(j) * PI / 3.0 + 0.3 * (hash(i * 7u + j) - 0.5);
  return size * (0.86 + 0.2 * hash(i * 13u + j)) * vec2f(cos(a), sin(a));
}

@vertex
fn vsPlate(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Lit {
  let pl = plates[i];
  let tri = v / 3u;
  let c = v % 3u;
  let size = 0.72 * SHELL * sqrt(4.0 * PI / f32(u.count));
  var local: vec3f;
  var nl: vec3f;
  if (tri < 12u) {
    let side = select(-1.0, 1.0, tri < 6u);
    var q = vec2f(0.0);
    if (c == 1u) { q = corner(i, tri, size); }
    if (c == 2u) { q = corner(i, tri + 1u, size); }
    local = vec3f(q, side * THICK);
    nl = vec3f(0.0, 0.0, side);
  } else {
    let s = (tri - 12u) / 2u;
    let a = corner(i, s, size);
    let b = corner(i, s + 1u, size);
    let useB = select(c == 2u, c != 1u, tri % 2u == 1u);
    let down = select(c == 1u, c >= 1u, tri % 2u == 1u);
    local = vec3f(select(a, b, useB), select(THICK, -THICK, down));
    nl = normalize(vec3f(b.y - a.y, a.x - b.x, 0.0));
  }
  let world = pl.pos.xyz + pl.ax.xyz * local.x + pl.ay.xyz * local.y + pl.az.xyz * local.z;
  let normal = pl.ax.xyz * nl.x + pl.ay.xyz * nl.y + pl.az.xyz * nl.z;

  var albedo = vec3f(0.80, 0.78, 0.74) * (0.88 + 0.2 * hash(i * 23u + 1u));
  if (hash(i * 19u + 3u) < 0.05) { albedo = vec3f(0.5, 0.49, 0.52); }
  if (tri >= 12u) { albedo *= 0.75; }
  return Lit(toClip(world), world, normal, albedo, 0u);
}

@vertex
fn vsCore(@builtin(vertex_index) v: u32) -> Lit {
  let quad = v / 6u;
  var corners = array(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let cell = vec2u(quad % (2u * u.core), quad / (2u * u.core)) + corners[v % 6u];
  let lon = f32(cell.x) * PI / f32(u.core);
  let lat = f32(cell.y) * PI / f32(u.core) - 0.5 * PI;
  let n = vec3f(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  return Lit(toClip(n * CORE), n * CORE, n, vec3f(0.96, 0.94, 0.9), 1u);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let w = f * f * (3.0 - 2.0 * f);
  let h = vec2u(vec2i(i) + 4096);
  let a = hash2(h.x, h.y);
  let b = hash2(h.x + 1u, h.y);
  let c = hash2(h.x, h.y + 1u);
  let d = hash2(h.x + 1u, h.y + 1u);
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn groundHeight(p: vec2f) -> f32 {
  var ridge = 0.0;
  var amp = 1.0;
  var q = p * 0.045;
  for (var o = 0; o < 5; o++) {
    ridge += amp * (1.0 - abs(2.0 * noise(q) - 1.0));
    q = q * 2.03 + vec2f(3.1, 1.7);
    amp *= 0.5;
  }
  let far = smoothstep(18.0, 60.0, length(p - vec2f(0.0, 8.0)));
  return GROUND + 0.25 * noise(p * 0.6) + far * (ridge * ridge * 5.5 - 1.0);
}

@vertex
fn vsGround(@builtin(vertex_index) v: u32) -> Lit {
  var corners = array(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let quad = v / 6u;
  let cell = vec2f(vec2u(quad % u.grid, quad / u.grid) + corners[v % 6u]) / f32(u.grid);
  let xz = vec2f(mix(-90.0, 90.0, cell.x), 8.0 - 130.0 * pow(cell.y, 1.5));
  let world = vec3f(xz.x, groundHeight(xz), xz.y);
  return Lit(toClip(world), world, vec3f(0.0, 1.0, 0.0), vec3f(0.028, 0.026, 0.034), 2u);
}

fn sunlight(w: vec3f, n: vec3f) -> f32 {
  let l = lightSpace(w + n * 0.02);
  let uv = vec2f(0.5 + 0.5 * l.x, 0.5 - 0.5 * l.y);
  let texel = 1.0 / f32(textureDimensions(shadowMap).x);
  var lit = 0.0;
  for (var j = 0; j < 4; j++) {
    let o = (vec2f(f32(j % 2), f32(j / 2)) - 0.5) * 1.5 * texel;
    lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + o, l.z - 0.001);
  }
  return select(1.0, 0.25 * lit, all(abs(l.xy) < vec2f(0.99)) && l.z < 1.0);
}

fn skyColor(rd: vec3f, s: vec3f) -> vec3f {
  var c = mix(vec3f(0.026, 0.025, 0.045), vec3f(0.006, 0.007, 0.016), smoothstep(-0.02, 0.45, rd.y));
  let toward = max(dot(normalize(rd.xz + vec2f(1e-4)), normalize(s.xz)), 0.0);
  return c + vec3f(0.12, 0.05, 0.025) * pow(toward, 4.0) * exp(-6.0 * max(rd.y, 0.0));
}

@fragment
fn fsLit(in: Lit) -> @location(0) vec4f {
  let facet = normalize(cross(dpdy(in.world), dpdx(in.world)));
  var n = normalize(in.normal);
  if (in.kind == 2u) { n = facet * select(-1.0, 1.0, facet.y >= 0.0); }
  let view = normalize(in.world - EYE);
  if (dot(n, view) > 0.0 && in.kind == 0u) { n = -n; }

  let s = sunDir(u.time);
  let sun = sunlight(in.world, n) * max(dot(n, s), 0.0);
  let sky = vec3f(0.09, 0.1, 0.17) * (0.55 + 0.45 * n.y);
  let bounce = vec3f(0.06, 0.045, 0.04) * max(-n.y, 0.0);
  var c = in.albedo * (vec3f(1.3, 1.0, 0.74) * 1.5 * sun + sky + bounce);
  if (in.kind == 1u) { c += in.albedo * vec3f(0.3, 0.3, 0.32); }
  let haze = 1.0 - exp(-max(length(in.world - EYE) - 10.0, 0.0) * 0.02);
  c = mix(c, skyColor(vec3f(view.x, 0.02, view.z), s), haze);
  return vec4f(c, 1.0);
}

struct Full { @builtin(position) clip: vec4f }

@vertex
fn vsFull(@builtin(vertex_index) v: u32) -> Full {
  let p = vec2f(f32((v << 1u) & 2u), f32(v & 2u));
  return Full(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}

@fragment
fn fsSky(in: Full) -> @location(0) vec4f {
  let ndc = vec2f(in.clip.x / u.low.x * 2.0 - 1.0, 1.0 - in.clip.y / u.low.y * 2.0);
  let t = tan(0.5 * FOV);
  let rd = normalize(camera() * vec3f(ndc.x * t * u.aspect, ndc.y * t, 1.0));
  let s = sunDir(u.time);
  var c = skyColor(rd, s);
  let cell = vec2u(in.clip.xy);
  let star = hash(cell.x * 1973u + cell.y * 9277u);
  if (star > 0.993 && rd.y > 0.04) { c += vec3f(0.5, 0.48, 0.45) * (star - 0.993) / 0.007; }
  if (dot(rd, s) > 0.99985) { c = vec3f(4.0, 3.0, 2.0); }
  return vec4f(c, 1.0);
}

const PALETTE = array(
  vec3f(0.027, 0.031, 0.059), vec3f(0.078, 0.086, 0.149), vec3f(0.141, 0.149, 0.231), vec3f(0.227, 0.227, 0.322),
  vec3f(0.341, 0.329, 0.416), vec3f(0.490, 0.471, 0.533), vec3f(0.655, 0.631, 0.659), vec3f(0.812, 0.784, 0.769),
  vec3f(0.925, 0.902, 0.863), vec3f(0.969, 0.949, 0.910), vec3f(0.851, 0.627, 0.400), vec3f(0.541, 0.353, 0.267),
  vec3f(0.169, 0.227, 0.310), vec3f(0.310, 0.416, 0.502),
);

const BAYER = array(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

@fragment
fn fsPost(in: Full) -> @location(0) vec4f {
  let p = vec2i(floor(in.clip.xy * u.low / u.screen));
  var c = textureLoad(scene, p, 0).rgb;
  c = c / (1.0 + c) * 1.3;
  c = pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  c += (BAYER[(p.y % 4) * 4 + p.x % 4] + 0.5) / 16.0 * 0.07 - 0.035;
  var best = PALETTE[0];
  var dist = 1e9;
  for (var k = 0; k < 14; k++) {
    let d = (PALETTE[k] - c) * vec3f(0.8, 1.0, 0.6);
    if (dot(d, d) < dist) { dist = dot(d, d); best = PALETTE[k]; }
  }
  return vec4f(best, 1.0);
}
