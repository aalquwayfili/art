struct Frame {
  eye: vec4f,
  right: vec4f,
  up: vec4f,
  fwd: vec4f,
  screen: vec4f,
  clock: vec4f,
  area: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI = 3.14159265;

const HX = 13.0;
const HZ = 11.0;
const WALL_H = 8.0;
const BATTER = 0.045;
const TOWER_R0 = 3.0;
const TOWER_R1 = 2.25;
const TOWER_H = 11.4;
const KEEP_AT = vec2f(-6.0, -1.5);
const KEEP_H = 15.2;
const GATE_X = -1.5;
const PALMS = array<vec4f, 2>(vec4f(20.0, 6.0, 13.5, 1.0), vec4f(-17.0, -2.0, 15.0, 2.0));
const LEANS = array<vec2f, 2>(vec2f(-2.0, 0.4), vec2f(-0.8, -0.6));
const SUN = vec3f(-0.55, 0.55, 0.62);

const GROUND = 1.0;
const WALL = 2.0;
const TOWER = 3.0;
const KEEP = 4.0;
const DOOR = 5.0;
const HOLE = 6.0;
const PALM = 7.0;

const T_BUILD = 0.6;
const T_LINE = 3.6;
const T_LINE_SPAN = 5.8;
const T_WASH = 17.2;
const T_TURN = 24.2;

fn pcg3(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

fn rand3(v: vec3u) -> vec3f { return vec3f(pcg3(v)) / 4294967295.0; }

fn randi(a: i32, b: i32, c: u32) -> vec3f { return rand3(vec3u(bitcast<u32>(a), bitcast<u32>(b), c)); }

fn noise(p: vec2f) -> f32 {
  let i = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(randi(i.x, i.y, 5u).x, randi(i.x + 1, i.y, 5u).x, u.x),
             mix(randi(i.x, i.y + 1, 5u).x, randi(i.x + 1, i.y + 1, 5u).x, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 { return 0.55 * noise(p) + 0.3 * noise(p * 2.3 + 7.1) + 0.15 * noise(p * 5.1 + 3.7); }

fn project(P: vec3f) -> vec2f {
  let q = P - frame.eye.xyz;
  let z = dot(q, frame.fwd.xyz);
  let f = frame.eye.w;
  return vec2f(0.5 * frame.screen.x + f * dot(q, frame.right.xyz) / z + frame.screen.z,
               0.5 * frame.screen.y - f * dot(q, frame.up.xyz) / z - frame.screen.w);
}

fn rayDir(p: vec2f) -> vec3f {
  let f = frame.eye.w;
  let x = (p.x - 0.5 * frame.screen.x - frame.screen.z) / f;
  let y = (0.5 * frame.screen.y - p.y - frame.screen.w) / f;
  return normalize(frame.right.xyz * x + frame.up.xyz * y + frame.fwd.xyz);
}

@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdRect(p: vec2f, b: vec2f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
}

fn sdTri(p0: vec2f, q: vec2f) -> f32 {
  let p = vec2f(abs(p0.x), p0.y);
  let a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  let b = p - q * vec2f(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  let s = -sign(q.y);
  let d = min(vec2f(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2f(dot(b, b), s * (p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}

fn merlon(a: f32, y: f32) -> f32 { return sdTri(vec2f(a, 0.95 - y), vec2f(0.4, 0.95)); }

fn rep(x: f32, period: f32) -> f32 { return x - period * round(x / period); }

struct Hit { d: f32, id: f32 }

fn closer(a: Hit, b: Hit) -> Hit { if (b.d < a.d) { return b; } return a; }

fn carve(solid: Hit, holes: f32) -> Hit {
  if (-holes > solid.d) { return Hit(-holes, HOLE); }
  return solid;
}

fn wallOpenings(a: f32, y: f32, depth: f32, half: f32, gate: bool) -> f32 {
  let slab = abs(depth + 0.2) - 0.55;
  let vent = sdTri(vec2f(rep(a - 1.5, 3.0), 7.1 - y), vec2f(0.24, 0.5));
  let slit = sdRect(vec2f(rep(a - 2.25, 4.5), y - 3.5), vec2f(0.1, 0.5));
  let win = sdRect(vec2f(rep(a, 9.0), y - 5.4), vec2f(0.24, 0.32));
  var h = min(vent, slit);
  if (!gate || abs(a - GATE_X) > 4.2) { h = min(h, win); }
  if (gate && abs(a - GATE_X) < 3.4) { h = vent; }
  return max(max(h, slab), abs(a) - half + 3.6);
}

fn walls(p: vec3f) -> Hit {
  let hx = HX - BATTER * p.y;
  let hz = HZ - BATTER * p.y;
  let lump = 0.035 * sin(1.7 * p.x + sin(2.1 * p.y)) * sin(1.3 * p.y + 1.1 * p.z);
  var d = sdBox(p - vec3f(0.0, WALL_H * 0.5, 0.0), vec3f(hx - 0.25, WALL_H * 0.5 - 0.25, hz - 0.25)) - 0.25 + lump;
  if (d > 1.5) { return Hit(d - 1.1, WALL); }

  let surround = sdBox(vec3f(p.x - GATE_X, p.y - 3.1, p.z - hz), vec3f(2.45, 3.1, 0.32)) - 0.06;
  d = min(d, surround);

  if (p.y > WALL_H - 0.3) {
    let top = WALL_H - 0.05;
    let hxT = HX - BATTER * top;
    let hzT = HZ - BATTER * top;
    let y = p.y - top;
    let front = max(max(merlon(rep(p.x, 1.5), y), abs(abs(p.z) - hzT + 0.3) - 0.3), abs(p.x) - hxT + 2.2);
    let side = max(max(merlon(rep(p.z, 1.5), y), abs(abs(p.x) - hxT + 0.3) - 0.3), abs(p.z) - hzT + 2.2);
    d = min(d, min(front, side));
  }

  let spout = sdBox(vec3f(rep(p.x - 3.0, 6.0), p.y - 7.55, p.z - hz - 0.25), vec3f(0.09, 0.08, 0.45));
  d = min(d, max(spout, abs(p.x) - HX + 3.0));

  var hit = Hit(d, WALL);

  let recess = sdBox(vec3f(p.x - GATE_X, p.y - 2.3, p.z - HZ), vec3f(1.55, 2.3, 0.95));
  if (-recess > hit.d) {
    hit.d = -recess;
    if (p.z < HZ - 0.9 && p.y < 4.55 && abs(p.x - GATE_X) < 1.52) { hit.id = DOOR; }
  }
  let doorFace = abs(p.z - (HZ - 0.95)) - 0.05;
  let inDoor = max(abs(p.x - GATE_X) - 1.5, abs(p.y - 2.3) - 2.25);
  let plank = abs(rep(p.x - GATE_X + 0.21, 0.42)) - 0.018;
  let wicket = abs(sdRect(vec2f(p.x - GATE_X - 0.55, p.y - 1.0), vec2f(0.4, 0.75))) - 0.04;
  let grooves = max(max(min(plank, wicket), doorFace), inDoor);
  hit.d = max(hit.d, -grooves);

  let front = wallOpenings(p.x, p.y, abs(p.z) - hz, HX, p.z > 0.0);
  let side = wallOpenings(p.z, p.y, abs(p.x) - hx, HZ, false);
  return carve(hit, min(front, side));
}

fn towers(p: vec3f) -> Hit {
  let l = vec3f(abs(p.x) - HX, p.y, abs(p.z) - HZ);
  let r = length(l.xz);
  let reach = max(r - 3.4, max(l.y - TOWER_H - 1.8, -l.y));
  if (reach > 0.4) { return Hit(reach, TOWER); }
  let y = clamp(l.y, 0.0, TOWER_H);
  let radius = mix(TOWER_R0, TOWER_R1, y / TOWER_H) + 0.12 * sin(PI * y / TOWER_H) + 0.12 * smoothstep(0.8, 0.0, y);
  var d = max(r - radius, max(l.y - TOWER_H, -l.y));
  let rTop = TOWER_R1 + 0.16;
  d = min(d, max(r - rTop, abs(l.y - TOWER_H - 0.2) - 0.35));
  if (l.y > TOWER_H) {
    let a = atan2(l.z, l.x);
    let sector = 2.0 * PI / 13.0;
    d = min(d, max(merlon(rep(a, sector) * rTop, l.y - TOWER_H - 0.55), abs(r - rTop + 0.28) - 0.28));
  }
  let a = atan2(l.z, l.x);
  let slab = abs(r - radius + 0.2) - 0.55;
  let s1 = sdRect(vec2f(rep(a, 2.0 * PI / 6.0) * radius, l.y - 4.2), vec2f(0.1, 0.55));
  let s2 = sdRect(vec2f(rep(a + PI / 6.0, 2.0 * PI / 6.0) * radius, l.y - 7.6), vec2f(0.1, 0.5));
  let v = sdTri(vec2f(rep(a, 2.0 * PI / 9.0) * radius, 10.5 - l.y), vec2f(0.22, 0.45));
  return carve(Hit(d, TOWER), max(min(min(s1, s2), v), slab));
}

fn keep(p: vec3f) -> Hit {
  let l = vec3f(p.x - KEEP_AT.x, p.y, p.z - KEEP_AT.y);
  let reach = sdBox(l - vec3f(0.0, 0.5 * KEEP_H + 0.6, 0.0), vec3f(3.0, 0.5 * KEEP_H + 0.7, 3.0));
  if (reach > 0.4) { return Hit(reach, KEEP); }
  let hw = 2.9 - 0.035 * p.y;
  var d = sdBox(l - vec3f(0.0, KEEP_H * 0.5, 0.0), vec3f(hw - 0.2, KEEP_H * 0.5 - 0.2, hw - 0.2)) - 0.2;
  let topW = 2.9 - 0.035 * KEEP_H;
  if (l.y > KEEP_H - 0.3) {
    let y = l.y - KEEP_H + 0.05;
    let fx = max(max(merlon(rep(l.x - 0.6, 1.2), y), abs(abs(l.z) - topW + 0.25) - 0.25), abs(l.x) - topW + 0.2);
    let fz = max(max(merlon(rep(l.z - 0.6, 1.2), y), abs(abs(l.x) - topW + 0.25) - 0.25), abs(l.z) - topW + 0.2);
    d = min(d, min(fx, fz));
  }
  let faceX = abs(l.x) - hw;
  let faceZ = abs(l.z) - hw;
  let slab = min(abs(faceX + 0.2) - 0.5, abs(faceZ + 0.2) - 0.5);
  let along = select(l.x, l.z, abs(l.x) > abs(l.z));
  let vents = sdTri(vec2f(rep(along, 1.2), 14.35 - l.y), vec2f(0.18, 0.4));
  let win = sdRect(vec2f(rep(along, 2.4), l.y - 11.6), vec2f(0.22, 0.4));
  let slit = sdRect(vec2f(along, l.y - 9.4), vec2f(0.1, 0.45));
  let open = max(max(min(min(vents, win), slit), slab), abs(along) - hw + 0.5);
  return carve(Hit(d, KEEP), open);
}

fn palm(p: vec3f, base: vec2f, height: f32, lean: vec2f, seed: u32) -> Hit {
  let axis = base + lean * 0.5;
  let reach = length(p.xz - axis) - 6.0;
  if (reach > 0.5 || p.y > height + 4.0) { return Hit(max(reach, p.y - height - 3.5), PALM); }
  let y = clamp(p.y, 0.0, height);
  let c = base + lean * (y / height) * (y / height);
  let radius = mix(0.42, 0.27, y / height) + 0.06 * pow(abs(sin(y * 5.5)), 3.0);
  var d = max(0.8 * (length(p.xz - c) - radius), max(p.y - height + 0.3, -p.y));
  d = min(d, length(p - vec3f(base.x + lean.x, height - 0.1, base.y + lean.y)) - 0.5);

  let top = vec3f(base.x + lean.x, height, base.y + lean.y);
  let rel = p - top;
  let count = 13.0;
  let k0 = round(atan2(rel.z, rel.x) / (2.0 * PI) * count);
  for (var dk = -1.0; dk <= 1.0; dk += 1.0) {
    let k = k0 + dk;
    let h = rand3(vec3u(u32(k + count), seed, 21u));
    let a = (k + 0.3 * (h.x - 0.5)) * 2.0 * PI / count;
    let dir = vec2f(cos(a), sin(a));
    let len = 3.6 + 1.3 * h.y;
    let rise = mix(-0.25, 0.9, h.z);
    let droop = mix(0.35, 0.95, h.y);
    let along = dot(rel.xz, dir);
    let s = clamp(along / len, 0.0, 1.0);
    let lat = rel.x * dir.y - rel.z * dir.x;
    let curve = along * rise - droop * along * along / len;
    let dy = rel.y - curve;
    let width = 0.62 * sqrt(sin(PI * s)) * (1.0 - 0.35 * s);
    let slope = rise - 2.0 * droop * along / len;
    var blade = max(abs(lat) - width, abs(dy) / sqrt(1.0 + slope * slope) - 0.03);
    blade = max(blade, max(-along, along - len));
    let leaflet = (abs(fract(s * 22.0 - abs(lat) * 1.6) - 0.5) - 0.3) * len / 22.0;
    blade = max(blade, leaflet);
    let rib = length(vec2f(lat, dy / sqrt(1.0 + slope * slope))) - 0.05 * (1.0 - s);
    d = min(d, min(blade, max(rib, max(-along, along - len))));
  }
  return Hit(d, PALM);
}

fn solids(p: vec3f) -> Hit {
  var h = palm(p, PALMS[0].xy, PALMS[0].z, LEANS[0], u32(PALMS[0].w));
  h = closer(h, palm(p, PALMS[1].xy, PALMS[1].z, LEANS[1], u32(PALMS[1].w)));
  let bound = sdBox(p - vec3f(0.0, 8.5, 0.0), vec3f(16.5, 8.6, 14.5));
  if (bound > 0.5) { return closer(h, Hit(bound, WALL)); }
  h = closer(h, walls(p));
  h = closer(h, towers(p));
  h = closer(h, keep(p));
  return h;
}

fn map(p: vec3f) -> Hit { return closer(Hit(p.y, GROUND), solids(p)); }

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.004, -0.004);
  return normalize(e.xyy * map(p + e.xyy).d + e.yyx * map(p + e.yyx).d +
                   e.yxy * map(p + e.yxy).d + e.xxx * map(p + e.xxx).d);
}

fn softShadow(p: vec3f, l: vec3f) -> f32 {
  var lit = 1.0;
  var t = 0.05;
  for (var i = 0; i < i32(frame.up.w); i++) {
    let d = solids(p + l * t).d;
    lit = min(lit, 14.0 * d / t);
    t += clamp(d, 0.03, 1.2);
    if (lit < 0.01 || t > 40.0) { break; }
  }
  return clamp(lit, 0.0, 1.0);
}

fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var o = 0.0;
  for (var k = 1; k <= 5; k++) {
    let h = 0.25 * f32(k);
    o += (h - map(p + n * h).d) / h;
  }
  return clamp(1.0 - 0.35 * o, 0.0, 1.0);
}

struct Scene { @location(0) geo: vec4f, @location(1) tone: vec4f }

@fragment
fn fsScene(@builtin(position) fc: vec4f) -> Scene {
  let ro = frame.eye.xyz;
  let rd = rayDir(fc.xy);
  let toGround = select(1e4, -ro.y / rd.y, rd.y < 0.0);
  var t = 0.0;
  var hit = false;
  for (var i = 0; i < i32(frame.right.w); i++) {
    let d = solids(ro + rd * t).d;
    if (d < 0.0015 * t) { hit = true; break; }
    t += d * 0.85;
    if (t > min(toGround, 400.0)) { break; }
  }
  if (!hit) {
    if (toGround > 150.0) { return Scene(vec4f(0.0, 0.0, 0.0, 1e4), vec4f(0.0, select(0.0, GROUND, toGround < 1e4), 1.0, 0.0)); }
    t = toGround;
  }

  let p = ro + rd * t;
  let id = map(p).id;
  let n = normalAt(p);
  let L = normalize(SUN);
  let sun = softShadow(p + n * 0.02, L) * max(dot(n, L), 0.0);
  let ao = occlusion(p, n);
  var dark = 0.72 - 0.54 * smoothstep(0.0, 0.6, sun) + 0.35 * (1.0 - ao);
  if (id == GROUND) {
    let near = sdRect(p.xz, vec2f(HX + 1.0, HZ + 1.0));
    let dust = 0.3 * smoothstep(9.0, 0.0, near) * smoothstep(0.35, 0.75, fbm(p.xz * vec2f(0.35, 0.9)));
    dark = 0.55 * (1.0 - smoothstep(0.0, 0.5, sun)) + 0.5 * (1.0 - ao) + dust;
  }
  if (id == WALL || id == TOWER || id == KEEP) { dark += 0.14 * smoothstep(1.4, 0.2, p.y); }
  if (id == DOOR) { dark = max(dark, 0.72); }
  if (id == PALM) {
    let i = select(0, 1, p.x < 0.0);
    let top = vec3f(PALMS[i].x + LEANS[i].x, PALMS[i].z, PALMS[i].y + LEANS[i].y);
    dark = max(dark, 0.8 * smoothstep(1.9, 0.9, length(p - top)));
  }
  if (id == HOLE) { dark = 0.97; }
  return Scene(vec4f(n, t), vec4f(clamp(dark, 0.0, 1.0), id, ao, sun));
}

const NEVER = 1000.0;

@group(0) @binding(1) var gGeo: texture_2d<f32>;
@group(0) @binding(2) var gTone: texture_2d<f32>;

fn texel(t: texture_2d<f32>, p: vec2f) -> vec4f {
  let size = vec2i(textureDimensions(t));
  return textureLoad(t, clamp(vec2i(floor(p)), vec2i(0), size - 1), 0);
}

struct Surface { st: vec2f, ds: vec3f, dt: vec3f, face: u32, kind: u32 }

fn surface(P: vec3f, n: vec3f, id: f32) -> Surface {
  let upT = (vec3f(0.0, 1.0, 0.0) - n * n.y) / max(1.0 - n.y * n.y, 0.05);
  if (id == GROUND || id == 0.0 || abs(n.y) > 0.75) {
    return Surface(P.xz, vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), 1u, 1u);
  }
  if (id == PALM) {
    let i = select(0, 1, P.x < 0.0);
    let y = clamp(P.y / PALMS[i].z, 0.0, 1.0);
    let l = P.xz - PALMS[i].xy - LEANS[i] * y * y;
    let a = atan2(l.y, l.x);
    return Surface(vec2f(a * 0.4, P.y), vec3f(-l.y, 0.0, l.x) / 0.4, upT, 8u + u32(i), 2u);
  }
  if (id == TOWER || (id == HOLE && length(vec2f(abs(P.x) - HX, abs(P.z) - HZ)) < TOWER_R0 + 0.3)) {
    let c = vec2f(sign(P.x) * HX, sign(P.z) * HZ);
    let l = P.xz - c;
    let toEye = normalize(frame.eye.xz - c);
    let a = atan2(toEye.x * l.y - toEye.y * l.x, dot(toEye, l));
    let tangent = vec3f(-l.y, 0.0, l.x) / TOWER_R0;
    let key = 16u + u32(c.x > 0.0) * 2u + u32(c.y > 0.0);
    return Surface(vec2f(a * TOWER_R0, P.y), tangent, upT, key, 0u);
  }
  let base = u32(id) * 8u + 32u;
  if (abs(n.x) > abs(n.z)) {
    return Surface(vec2f(P.z, P.y), vec3f(0.0, 0.0, 1.0), upT, base + u32(n.x > 0.0), 0u);
  }
  return Surface(vec2f(P.x, P.y), vec3f(1.0, 0.0, 0.0), upT, base + 2u + u32(n.z > 0.0), 0u);
}

fn screenStep(P: vec3f, T: vec3f) -> vec2f {
  let q = P - frame.eye.xyz;
  let z = dot(q, frame.fwd.xyz);
  let f = frame.eye.w / z;
  let tf = dot(T, frame.fwd.xyz);
  return vec2f(f * (dot(T, frame.right.xyz) - dot(q, frame.right.xyz) / z * tf),
               -f * (dot(T, frame.up.xyz) - dot(q, frame.up.xyz) / z * tf));
}

var<private> ANGLES: array<vec4f, 3> = array<vec4f, 3>(
  vec4f(1.5708, 0.95, 0.06, 2.25),
  vec4f(0.0, 0.42, -0.35, 1.3),
  vec4f(0.0, 0.6, 1.5708, -0.7));
var<private> TONE_FROM: array<f32, 4> = array<f32, 4>(0.1, 0.36, 0.56, 0.74);
var<private> TONE_SPAN: array<f32, 4> = array<f32, 4>(0.3, 0.26, 0.2, 0.18);
var<private> LAYER_AT: array<f32, 4> = array<f32, 4>(8.6, 11.0, 13.0, 14.6);
var<private> LAYER_SPAN: array<f32, 4> = array<f32, 4>(4.0, 3.4, 3.0, 2.8);

fn hatch(s: Surface, J: mat2x2f, dark: f32, fam: u32) -> vec2f {
  let jitter = rand3(vec3u(s.face, fam, 3u)).x - 0.5;
  let ang = ANGLES[s.kind][fam] + 0.16 * jitter;
  let du = vec2f(cos(ang), sin(ang));
  let dv = vec2f(-du.y, du.x);
  let u = dot(s.st, du);
  let v = dot(s.st, dv);
  let gv = max(length(transpose(J) * dv), 1e-5);
  let px = frame.clock.y;
  let S = 4.3 * px * frame.fwd.w;
  let spacingPx = S / gv;
  let key = s.face * 4u + fam;
  let j0 = i32(floor(v / S));
  var best = vec2f(0.0, NEVER);
  for (var dj = -1; dj <= 1; dj++) {
    let row = j0 + dj;
    let thin = select(1.0, smoothstep(2.2, 3.2, spacingPx), (row & 1) == 1);
    if (thin <= 0.0) { continue; }
    let r = randi(row, 0, key);
    let len = S * (5.5 + 2.5 * r.x);
    let shift = r.y * len;
    let k0 = i32(floor((u + shift) / len));
    for (var dk = -1; dk <= 0; dk++) {
      let k = k0 + dk;
      let h = randi(row, k, key + 7919u);
      let g = randi(row, k, key + 104729u);
      let u0 = f32(k) * len - shift + (h.x - 0.5) * 0.35 * len;
      let l = len * (0.8 + 0.45 * h.y);
      let a = (u - u0) / l;
      if (a < -0.02 || a > 1.02) { continue; }
      let thr = TONE_FROM[fam] + TONE_SPAN[fam] * g.z;
      let need = smoothstep(thr, thr + 0.06, dark);
      if (need <= 0.0) { continue; }
      let centre = (f32(row) + 0.5 + 0.4 * (h.z - 0.5)) * S
                   + (g.x - 0.5) * 0.35 * S * (2.0 * a - 1.0)
                   + (g.y - 0.5) * 0.4 * S * sin(PI * a);
      let d = abs(v - centre) / gv;
      let pressure = (0.55 + 0.45 * h.z) * mix(1.0, 0.45, a * a);
      let width = (0.35 + 0.45 * pressure) * px;
      var ink = (1.0 - smoothstep(width - 0.5, width + 0.6, d)) * pressure;
      ink *= smoothstep(-0.02, 0.02, a) * smoothstep(1.02, 0.97, a);
      let group = randi(i32(floor(f32(row) / 7.0)), i32(floor(f32(k) / 2.0)), key + 31u).x;
      let order = clamp(0.45 * (1.0 - dark) + 0.4 * group + 0.15 * g.x, 0.0, 1.0);
      let born = LAYER_AT[fam] + LAYER_SPAN[fam] * order;
      ink *= need * thin;
      if (ink > best.x) { best = vec2f(ink, born + 0.22 * clamp(a, 0.0, 1.0)); }
    }
  }
  return best;
}

fn marks(s: Surface, a: vec2f, b: vec2f, dark: f32) -> vec2f {
  if (s.kind != 0u || dark > 0.55) { return vec2f(0.0, NEVER); }
  let px = frame.clock.y;
  let cell = vec2f(1.3, 0.55);
  let c0 = vec2i(floor(s.st / cell));
  var best = vec2f(0.0, NEVER);
  for (var k = 0; k < 9; k++) {
    let c = c0 + vec2i(k % 3 - 1, k / 3 - 1);
    let h = randi(c.x, c.y, s.face + 500u);
    if (h.x > 0.3) { continue; }
    let g = randi(c.x, c.y, s.face + 900u);
    let centre = (vec2f(c) + vec2f(h.y, h.z)) * cell - s.st;
    let half = vec2f(0.15 + 0.3 * g.x, 0.05 * (g.y - 0.5));
    let pit = g.x < 0.25;
    let e0 = a * (centre.x - select(half.x, 0.02, pit)) + b * (centre.y - half.y);
    let e1 = a * (centre.x + select(half.x, 0.02, pit)) + b * (centre.y + half.y);
    let seg = segment(vec2f(0.0), e0, e1);
    let width = select(0.45, 0.9, pit) * px;
    let born = LAYER_AT[0] + LAYER_SPAN[0] * g.z;
    let ink = (1.0 - smoothstep(width - 0.4, width + 0.6, seg.x)) * (0.5 + 0.4 * g.z) * smoothstep(0.55, 0.35, dark);
    if (ink > best.x) { best = vec2f(ink, born + 0.15 * seg.y); }
  }
  return best;
}

fn contour(q: vec2f, r: f32) -> vec2f {
  let g = texel(gGeo, q);
  let m = texel(gTone, q);
  var edge = 0.0;
  var outer = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = select(vec2f(0.0, r), vec2f(r, 0.0), k < 2) * select(-1.0, 1.0, k % 2 == 0);
    let go = texel(gGeo, q + o);
    let mo = texel(gTone, q + o);
    if (m.y < 1.5 && mo.y < 1.5) { continue; }
    let jump = smoothstep(0.015, 0.05, abs(g.w - go.w) / min(g.w, go.w));
    let crease = smoothstep(0.1, 0.35, 1.0 - dot(g.xyz, go.xyz));
    let seam = select(0.0, 1.0, abs(m.y - mo.y) > 0.5);
    edge = max(edge, max(jump, max(0.75 * crease, 0.7 * seam)));
    outer = max(outer, select(0.0, 1.0, min(m.y, mo.y) < 1.5));
  }
  return vec2f(edge, outer);
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return vec2f(length(p - a - ab * h), h);
}

var<private> RULED: array<vec3f, 26> = array<vec3f, 26>(
  vec3f(-17.0, 0.0, 11.0), vec3f(19.0, 0.0, 11.0),
  vec3f(13.0, 0.0, 16.0), vec3f(13.0, 0.0, -30.0),
  vec3f(-16.0, 8.0, 10.6), vec3f(17.0, 8.0, 10.6),
  vec3f(12.6, 8.0, 14.0), vec3f(12.6, 8.0, -26.0),
  vec3f(13.0, -0.8, 11.0), vec3f(13.0, 13.8, 11.0),
  vec3f(-13.0, -0.8, 11.0), vec3f(-13.0, 13.6, 11.0),
  vec3f(13.0, -0.6, -11.0), vec3f(13.0, 13.4, -11.0),
  vec3f(-8.9, 17.0, 1.4), vec3f(-8.9, 6.0, 1.4),
  vec3f(-3.1, 17.2, 1.4), vec3f(-3.1, 6.5, 1.4),
  vec3f(-10.2, 15.2, 1.4), vec3f(-1.6, 15.2, 1.4),
  vec3f(-16.5, 11.4, 11.0), vec3f(16.5, 11.4, 11.0),
  vec3f(-3.0, 0.0, 11.0), vec3f(-3.0, 5.0, 11.0),
  vec3f(0.0, 0.0, 11.0), vec3f(0.0, 5.0, 11.0));

fn construction(p: vec2f) -> vec2f {
  let px = frame.clock.y;
  let hy = 0.5 * frame.screen.y - frame.screen.w + 2.0 * px * (noise(vec2f(p.x / (90.0 * px), 3.0)) - 0.5);
  let hx = (p.x - (frame.area.x - 1.35 * frame.area.z)) / (2.7 * frame.area.z);
  let horizon = (1.0 - smoothstep(0.3 * px, 1.1 * px, abs(p.y - hy))) * step(0.0, hx) * step(hx, 1.0);
  var best = vec2f(0.8 * horizon, T_BUILD + 0.8 * clamp(hx, 0.0, 1.0));
  for (var i = 0; i < 13; i++) {
    let a = project(RULED[2 * i]);
    let b = project(RULED[2 * i + 1]);
    let s = segment(p, a, b);
    let wob = 1.3 * px * (noise(vec2f(s.y * 6.0, f32(i) * 3.7)) - 0.5);
    let line = (1.0 - smoothstep(0.25 * px, 1.0 * px, abs(s.x + wob))) * (0.55 + 0.35 * rand3(vec3u(u32(i), 1u, 1u)).x);
    if (line > best.x) { best = vec2f(line, T_BUILD + 0.8 + 0.22 * f32(i) + 0.4 * s.y); }
  }
  return best;
}

var<private> GROUND_LINES: array<vec4f, 6> = array<vec4f, 6>(
  vec4f(-21.0, 14.0, -12.0, 14.5), vec4f(-4.0, 16.5, 7.0, 16.0), vec4f(9.0, 13.5, 17.0, 13.2),
  vec4f(16.0, 9.0, 16.5, -6.0), vec4f(-17.0, 20.0, -9.0, 20.5), vec4f(20.5, 12.0, 21.0, 2.0));

fn groundStrokes(p: vec2f) -> vec2f {
  let px = frame.clock.y;
  var best = vec2f(0.0, NEVER);
  for (var i = 0; i < 6; i++) {
    let g = GROUND_LINES[i];
    let seg = segment(p, project(vec3f(g.x, 0.0, g.y)), project(vec3f(g.z, 0.0, g.w)));
    let wob = 1.2 * px * (noise(vec2f(seg.y * 5.0, f32(i) * 7.3)) - 0.5);
    let pressure = mix(1.0, 0.3, seg.y) * smoothstep(0.0, 0.04, seg.y);
    let width = (0.3 + 0.5 * pressure) * px;
    let ink = (1.0 - smoothstep(width - 0.4, width + 0.6, abs(seg.x + wob))) * pressure;
    if (ink > best.x) { best = vec2f(ink, 9.4 + 0.5 * f32(i) + 0.3 * seg.y); }
  }
  return best;
}

fn blot(p: vec2f, c: vec2f, radius: f32, seed: u32, grow: f32) -> f32 {
  let q = (p - c) / radius;
  if (dot(q, q) > 16.0) { return 0.0; }
  let edge = 1.0 + 0.35 * (fbm(q * 1.6 + f32(seed) * 5.3) - 0.5);
  var ink = 1.0 - smoothstep(edge * grow - 0.06, edge * grow + 0.02, length(q));
  for (var k = 0u; k < 6u; k++) {
    let h = rand3(vec3u(seed, k, 9u));
    let at = (h.xy - 0.5) * 5.0;
    let r = (0.06 + 0.16 * h.z) * grow;
    ink = max(ink, 1.0 - smoothstep(r - 0.05, r + 0.02, length(q - at)));
  }
  return ink;
}

fn stronger(a: vec2f, b: vec2f) -> vec2f { return select(a, b, b.x > a.x); }

struct Plan { @location(0) hatchA: vec4f, @location(1) hatchB: vec4f, @location(2) lines: vec4f, @location(3) page: vec4f }

@fragment
fn fsPlan(@builtin(position) fc: vec4f) -> Plan {
  let p = fc.xy;
  let px = frame.clock.y;
  let q = p / px;
  let geo = texel(gGeo, p);
  let tone = texel(gTone, p);
  let id = tone.y;
  let world = frame.eye.xyz + rayDir(p) * min(geo.w, 400.0);
  let s = surface(world, geo.xyz, id);

  let a = screenStep(world, s.ds);
  let b = screenStep(world, s.dt);
  let det = a.x * b.y - b.x * a.y;
  let J = mat2x2f(b.y, -a.y, -b.x, a.x) * (1.0 / select(det, 1e-6, abs(det) < 1e-6));

  let area = (p - frame.area.xy) / (frame.area.zw * vec2f(1.25, 1.35));
  let vignette = smoothstep(1.0, 0.72, length(area) + 0.3 * (fbm(q / 70.0) - 0.5));
  var dark = tone.x + 0.08 * (fbm(q / 35.0) - 0.5);
  if (id == GROUND) { dark *= vignette; }
  if (id == 0.0) { dark = 0.0; }

  var h0 = vec2f(0.0, NEVER); var h1 = h0; var h2 = h0; var h3 = h0;
  if (dark > 0.08) {
    h0 = hatch(s, J, dark, 0u);
    h1 = hatch(s, J, dark, 1u);
    h2 = hatch(s, J, dark, 2u);
    h3 = hatch(s, J, dark, 3u);
  }
  var extra = vec2f(smoothstep(0.9, 0.96, dark), 16.4 + 0.8 * noise(q / 20.0));
  extra = stronger(extra, marks(s, a, b, dark));
  extra = stronger(extra, groundStrokes(p));

  let w1 = vec2f(noise(q / 40.0), noise(q / 40.0 + 17.0)) - 0.5;
  let w2 = vec2f(noise(q / 21.0 + 41.0), noise(q / 21.0 + 63.0)) - 0.5;
  let c1 = contour(p + w1 * 3.0 * px, 1.2 * px);
  let c2 = contour(p + w2 * 4.5 * px, 1.2 * px);
  let pressure = 0.6 + 0.4 * noise(q / 25.0);
  let line = max(c1.x * (0.75 + 0.25 * c1.y), 0.45 * c2.x) * pressure;
  let start = frame.area.xy + vec2f(-0.9 * frame.area.z, -0.8 * frame.area.w);
  let order = length((p - start) / frame.area.zw) / 2.6 + 0.12 * (noise(q / 50.0) - 0.5);

  let o = (vec2f(fbm(q / 90.0), fbm(q / 90.0 + 11.0)) - 0.5) * 30.0 * px;
  var body = 0.0;
  var shade = 0.0;
  for (var k = 0; k < 8; k++) {
    let ang = f32(k) * 0.785 + 0.4;
    let t2 = texel(gTone, p + o + vec2f(cos(ang), sin(ang)) * 9.0 * px);
    body += select(0.0, 1.0, t2.y > 1.5) / 8.0;
    shade += select(t2.x, 0.0, t2.y < 0.5) * select(1.0, vignette, t2.y < 1.5) / 8.0;
  }
  body *= (0.35 + 0.9 * fbm(q / 55.0 + 4.0)) * vignette;
  shade = shade * (0.6 + 0.6 * fbm(q / 40.0 + 9.0)) + 0.1 * vignette;

  let ruled = construction(p);
  return Plan(vec4f(h0, h1), vec4f(h2, h3), vec4f(line, T_LINE + T_LINE_SPAN * order, extra),
              vec4f(ruled, body, shade));
}

@group(0) @binding(3) var planA: texture_2d<f32>;
@group(0) @binding(4) var planB: texture_2d<f32>;
@group(0) @binding(5) var planLines: texture_2d<f32>;
@group(0) @binding(6) var planPage: texture_2d<f32>;

fn due(mark: vec2f, T: f32) -> f32 { return mark.x * smoothstep(mark.y, mark.y + 0.04, T); }

@fragment
fn fsSketch(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy;
  let px = frame.clock.y;
  let T = frame.clock.x;
  let q = p / px;
  let A = texel(planA, p);
  let B = texel(planB, p);
  let L = texel(planLines, p);
  let P = texel(planPage, p);

  let hatching = 1.0 - (1.0 - due(A.xy, T)) * (1.0 - due(A.zw, T)) * (1.0 - due(B.xy, T)) * (1.0 - due(B.zw, T))
                     * (1.0 - due(L.zw, T));
  let line = due(L.xy, T);

  let c = frame.area.xy;
  let z = frame.area.zw;
  var spill = blot(p, c + vec2f(0.82, 0.93) * z, 7.0 * px, 3u, smoothstep(7.2, 7.4, T));
  spill = max(spill, blot(p, c + vec2f(-1.05, -0.55) * z, 4.0 * px, 8u, smoothstep(15.1, 15.25, T)));

  let spread = smoothstep(T_WASH, T_WASH + 2.8, T);
  let th = mix(1.3, 0.6, spread);
  let w1a = smoothstep(th, th + 0.07, P.z);
  let washA = 0.34 * w1a + 0.7 * w1a * (1.0 - w1a);
  let washB = 0.42 * smoothstep(0.5, 0.56, P.w) * smoothstep(T_WASH + 1.0, T_WASH + 3.2, T);

  let tooth = 0.5 * noise(q / 1.2) + 0.3 * noise(q / 3.1 + 9.0) + 0.2 * noise(vec2f(q.x / 14.0, q.y / 1.5));
  let uv = p / frame.screen.xy;
  let mottle = 0.965 + 0.035 * noise(q / 140.0) - 0.06 * dot(uv - 0.5, uv - 0.5);
  let blank = vec3f(0.957, 0.935, 0.878) * mottle * (0.985 + 0.03 * tooth);
  var col = blank;
  col = mix(col, vec3f(0.42, 0.42, 0.45), 0.4 * due(P.xy, T) * (0.4 + 0.8 * tooth));
  col *= mix(vec3f(1.0), vec3f(0.84, 0.66, 0.45), washA);
  col *= mix(vec3f(1.0), vec3f(0.62, 0.45, 0.3), washB);
  let inkAmt = 1.0 - (1.0 - hatching * 0.92) * (1.0 - line) * (1.0 - spill);
  col = mix(col, vec3f(0.13, 0.1, 0.085), clamp(inkAmt * (0.88 + 0.12 * tooth), 0.0, 1.0));

  let turn = smoothstep(T_TURN, T_TURN + 1.4, T);
  if (turn > 0.0) {
    let W = frame.screen.x;
    let fold = W * (1.06 - 1.3 * turn) + (uv.y - 0.5) * 0.18 * W * sin(PI * turn);
    let band = 0.16 * W * sin(PI * min(turn, 0.999)) + 1.0;
    if (p.x > fold) {
      col = blank * (1.0 - 0.22 * exp(-(p.x - fold) / (0.04 * W)) * sin(PI * turn));
    } else if (p.x > fold - band) {
      let x = (fold - p.x) / band;
      col = blank * (0.9 + 0.1 * sin(PI * x)) * (0.97 + 0.03 * x);
    }
  }
  return vec4f(col, 1.0);
}
