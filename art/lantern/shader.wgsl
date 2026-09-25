struct Params {
  size: vec2<u32>,
  view: vec2<f32>,
  frame: u32,
  spp: u32,
  angle: f32,
  blend: f32,
  flame: f32,
  bounces: u32,
  exposure: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> P: Params;

@group(0) @binding(1) var<storage, read_write> accum: array<vec4<f32>>;

const PI = 3.14159265;
const TAU = 6.28318531;
const EPS = 1e-3;
const FAR = 1e9;

const ROOM_MIN = vec3f(-3.2, 0.0, -3.2);
const ROOM_MAX = vec3f(3.2, 3.4, 3.2);

const LANTERN = vec3f(0.0, 1.95, 0.0);
const BODY_R = vec3f(0.25, 0.33, 0.25);
const ROOF_Y0 = 0.24;
const ROOF_Y1 = 0.62;
const ROOF_R = 0.21;
const BANDS = 7.0;
const CELLS = 18.0;
const FINIAL_Y = -0.35;
const FINIAL_R = 0.045;
const CHAIN_R = 0.011;
const FLAME_R = 0.012;
const FLAME_I = vec3f(46.0, 26.0, 10.5);

const WIN_Z = 0.35;
const WIN_W = 1.1;
const WIN_Y0 = 1.05;
const WIN_Y1 = 2.55;
const MOON = vec3f(0.5, 0.78, 1.55);

const HAZE = 0.03;
const INDIRECT_LIMIT = 0.25;

const CAM_POS = vec3f(2.45, 1.15, 2.6);
const CAM_AT = vec3f(-0.7, 1.72, -1.1);
const CAM_FOV = 0.95;

const M_WALL = 0u;
const M_FLOOR = 1u;
const M_CEIL = 2u;
const M_BRASS = 3u;
const M_SADU = 4u;
const M_SEAT = 5u;
const M_WOOD = 6u;
const M_FLAME = 7u;
const M_WINDOW = 8u;

struct Hit { t: f32, n: vec3f, mat: u32 };

var<private> seed: u32;

fn rand() -> f32 {
  seed = seed * 747796405u + 2891336453u;
  var w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  w = (w >> 22u) ^ w;
  return f32(w >> 8u) * (1.0 / 16777216.0);
}

fn cosineDir(n: vec3f) -> vec3f {
  let r = sqrt(rand());
  let a = TAU * rand();
  let s = select(-1.0, 1.0, n.z >= 0.0);
  let k = -1.0 / (s + n.z);
  let b = n.x * n.y * k;
  let t = vec3f(1.0 + s * n.x * n.x * k, s * b, -s * n.x);
  let u = vec3f(b, s + n.y * n.y * k, -n.y);
  return normalize(t * (r * cos(a)) + u * (r * sin(a)) + n * sqrt(max(0.0, 1.0 - r * r)));
}

fn star8(x: f32, y: f32, r: f32) -> bool {
  let ax = abs(x);
  let ay = abs(y);
  return max(ax, ay) < r || ax + ay < r * 1.414;
}

fn arch(x: f32, y: f32, r: f32) -> bool {
  if (y < -0.85 * r) { return false; }
  if (y < 0.2 * r) { return abs(x) < 0.42 * r; }
  return length(vec2f(abs(x) + 0.42 * r, y - 0.2 * r)) < 0.84 * r;
}

fn twinDots(x: f32, y: f32, w: f32, r: f32) -> bool {
  return length(vec2f(abs(x) - 0.22 * w, y)) < r;
}

fn bodyHole(q: vec3f) -> bool {
  let v = q.y / BODY_R.y;
  if (v > 0.76) { return true; }
  if (v < -0.80) { return false; }
  let b = (v + 0.80) / 1.56 * BANDS;
  let band = u32(b);
  let shift = 0.5 * f32(band & 1u);
  let a = atan2(q.z, q.x) / TAU * CELLS + shift;
  let w = TAU * BODY_R.x * sqrt(max(0.0, 1.0 - v * v)) / CELLS;
  let h = 1.56 * BODY_R.y / BANDS;
  let x = (fract(a) - 0.5) * w;
  let y = (fract(b) - 0.5) * h;
  let s = 0.5 * min(w, h);
  switch band % 3u {
    case 0u: { return star8(x, y, 0.55 * s); }
    case 1u: { return arch(x, y, 0.85 * s); }
    default: { return twinDots(x, y, w, 0.3 * s); }
  }
}

fn roofHole(q: vec3f) -> bool {
  let t = (q.y - ROOF_Y0) / (ROOF_Y1 - ROOF_Y0);
  let r = ROOF_R * (1.0 - t);
  let a = atan2(q.z, q.x) / TAU;
  if (t > 0.12 && t < 0.36) {
    let w = TAU * r / 16.0;
    let h = 0.24 * (ROOF_Y1 - ROOF_Y0);
    return star8((fract(a * 16.0) - 0.5) * w, ((t - 0.12) / 0.24 - 0.5) * h, 0.3 * min(w, h));
  }
  if (t > 0.46 && t < 0.60) {
    let w = TAU * r / 10.0;
    let d = vec2f((fract(a * 10.0 + 0.5) - 0.5) * w, ((t - 0.46) / 0.14 - 0.5) * 0.14 * (ROOF_Y1 - ROOF_Y0));
    return length(d) < 0.3 * min(w, 0.14 * (ROOF_Y1 - ROOF_Y0));
  }
  return false;
}

fn keep(h: ptr<function, Hit>, t: f32, n: vec3f, mat: u32) {
  if (t > EPS && t < (*h).t) { *h = Hit(t, n, mat); }
}

fn sphere(h: ptr<function, Hit>, ro: vec3f, rd: vec3f, c: vec3f, r: f32, mat: u32) {
  let o = ro - c;
  let b = dot(o, rd);
  let d = b * b - dot(o, o) + r * r;
  if (d < 0.0) { return; }
  let t = -b - sqrt(d);
  keep(h, t, (o + rd * t) / r, mat);
}

fn body(h: ptr<function, Hit>, ro: vec3f, rd: vec3f) {
  let o = ro / BODY_R;
  let d = rd / BODY_R;
  let a = dot(d, d);
  let b = dot(o, d);
  let disc = b * b - a * (dot(o, o) - 1.0);
  if (disc < 0.0) { return; }
  let s = sqrt(disc);
  for (var i = 0; i < 2; i++) {
    let t = (-b + select(-s, s, i == 1)) / a;
    let q = ro + rd * t;
    if (t > EPS && t < (*h).t && !bodyHole(q)) {
      keep(h, t, normalize(q / (BODY_R * BODY_R)), M_BRASS);
      return;
    }
  }
}

fn roof(h: ptr<function, Hit>, ro: vec3f, rd: vec3f) {
  let k2 = pow(ROOF_R / (ROOF_Y1 - ROOF_Y0), 2.0);
  let oy = ro.y - ROOF_Y1;
  let a = rd.x * rd.x + rd.z * rd.z - k2 * rd.y * rd.y;
  let b = ro.x * rd.x + ro.z * rd.z - k2 * oy * rd.y;
  let c = ro.x * ro.x + ro.z * ro.z - k2 * oy * oy;
  let disc = b * b - a * c;
  if (disc < 0.0 || abs(a) < 1e-8) { return; }
  let s = sqrt(disc);
  let t0 = min((-b - s) / a, (-b + s) / a);
  let t1 = max((-b - s) / a, (-b + s) / a);
  for (var i = 0; i < 2; i++) {
    let t = select(t0, t1, i == 1);
    let q = ro + rd * t;
    if (t > EPS && t < (*h).t && q.y > ROOF_Y0 && q.y < ROOF_Y1 && !roofHole(q)) {
      keep(h, t, normalize(vec3f(q.x, k2 * (ROOF_Y1 - q.y), q.z)), M_BRASS);
      return;
    }
  }
}

fn cylinder(h: ptr<function, Hit>, ro: vec3f, rd: vec3f, cx: f32, cz: f32, r: f32, y0: f32, y1: f32, mat: u32) {
  let o = ro.xz - vec2f(cx, cz);
  let a = dot(rd.xz, rd.xz);
  let b = dot(o, rd.xz);
  let disc = b * b - a * (dot(o, o) - r * r);
  if (disc < 0.0) { return; }
  let t = (-b - sqrt(disc)) / max(a, 1e-8);
  let y = ro.y + rd.y * t;
  if (y > y0 && y < y1) {
    keep(h, t, vec3f(o.x + rd.x * t, 0.0, o.y + rd.z * t) / r, mat);
    return;
  }
  let tc = (select(y0, y1, y > y1) - ro.y) / rd.y;
  let p = o + rd.xz * tc;
  if (dot(p, p) < r * r) { keep(h, tc, vec3f(0.0, select(-1.0, 1.0, y > y1), 0.0), mat); }
}

fn box(h: ptr<function, Hit>, ro: vec3f, rd: vec3f, lo: vec3f, hi: vec3f, mat: u32) {
  let inv = 1.0 / rd;
  let ta = (lo - ro) * inv;
  let tb = (hi - ro) * inv;
  let tn = min(ta, tb);
  let tf = max(ta, tb);
  let t0 = max(max(tn.x, tn.y), tn.z);
  let t1 = min(min(tf.x, tf.y), tf.z);
  if (t0 > t1 || t0 < EPS || t0 > (*h).t) { return; }
  let n = -sign(rd) * step(tn.yzx, tn) * step(tn.zxy, tn);
  keep(h, t0, n, mat);
}

fn rotY(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
}

fn lantern(h: ptr<function, Hit>, ro: vec3f, rd: vec3f) {
  let o = ro - LANTERN;
  let b = dot(o, rd);
  let c = dot(o, o) - 0.5;
  if (b * b - c < 0.0 || (c > 0.0 && b > 0.0)) { return; }
  let lo = rotY(o, -P.angle);
  let ld = rotY(rd, -P.angle);
  var l = *h;
  body(&l, lo, ld);
  roof(&l, lo, ld);
  sphere(&l, lo, ld, vec3f(0.0, FINIAL_Y, 0.0), FINIAL_R, M_BRASS);
  if (l.t < (*h).t) { *h = Hit(l.t, rotY(l.n, P.angle), l.mat); }
}

fn furniture(h: ptr<function, Hit>, ro: vec3f, rd: vec3f) {
  box(h, ro, rd, vec3f(-3.2, 0.0, -3.2), vec3f(3.2, 0.36, -2.45), M_SEAT);
  box(h, ro, rd, vec3f(-3.2, 0.36, -3.2), vec3f(3.2, 0.92, -2.98), M_SADU);
  box(h, ro, rd, vec3f(-3.2, 0.0, -2.45), vec3f(-2.45, 0.36, 1.9), M_SEAT);
  box(h, ro, rd, vec3f(-3.2, 0.36, -2.98), vec3f(-2.98, 0.92, 1.9), M_SADU);
  cylinder(h, ro, rd, 0.0, 0.0, 0.62, 0.30, 0.35, M_WOOD);
  cylinder(h, ro, rd, 0.0, 0.0, 0.13, 0.0, 0.30, M_WOOD);
}

fn windowOpen(y: f32, z: f32) -> bool {
  let x = z - WIN_Z;
  let r = 0.5 * WIN_W;
  let spring = WIN_Y1 - 0.9 * r * 1.6;
  if (abs(x) > r || y < WIN_Y0) { return false; }
  if (y > spring && length(vec2f(abs(x) + 0.6 * r, y - spring)) > 1.6 * r) { return false; }
  let g = vec2f(x + y, x - y) * 7.0;
  let f = abs(fract(g) - 0.5);
  return min(f.x, f.y) > 0.11;
}

fn room(ro: vec3f, rd: vec3f) -> Hit {
  let t = (select(ROOM_MIN, ROOM_MAX, rd > vec3f(0.0)) - ro) / rd;
  let tm = min(min(t.x, t.y), t.z);
  let p = ro + rd * tm;
  if (tm == t.y) {
    return Hit(tm, vec3f(0.0, -sign(rd.y), 0.0), select(M_FLOOR, M_CEIL, rd.y > 0.0));
  }
  if (tm == t.x) {
    let lit = rd.x < 0.0 && windowOpen(p.y, p.z);
    return Hit(tm, vec3f(-sign(rd.x), 0.0, 0.0), select(M_WALL, M_WINDOW, lit));
  }
  return Hit(tm, vec3f(0.0, 0.0, -sign(rd.z)), M_WALL);
}

fn trace(ro: vec3f, rd: vec3f) -> Hit {
  var h = room(ro, rd);
  lantern(&h, ro, rd);
  furniture(&h, ro, rd);
  cylinder(&h, ro, rd, LANTERN.x, LANTERN.z, CHAIN_R, LANTERN.y + ROOF_Y1, ROOM_MAX.y, M_BRASS);
  sphere(&h, ro, rd, LANTERN, FLAME_R, M_FLAME);
  return h;
}

fn sadu(y: f32, s: f32) -> vec3f {
  let band = fract(y * 9.0);
  let tri = abs(fract(s * 4.5) - 0.5) * 2.0;
  if (band < 0.18) { return vec3f(0.62, 0.55, 0.42); }
  if (band < 0.5) { return select(vec3f(0.05, 0.04, 0.04), vec3f(0.62, 0.55, 0.42), (band - 0.18) / 0.32 > tri); }
  return vec3f(0.42, 0.06, 0.04);
}

fn rug(x: f32, z: f32) -> vec3f {
  let e = min(2.0 - abs(x), 1.55 - abs(z));
  if (e < 0.0) { return vec3f(0.13, 0.08, 0.05); }
  if (e < 0.05 || (e > 0.22 && e < 0.25)) { return vec3f(0.6, 0.5, 0.36); }
  if (e < 0.25) { return vec3f(0.06, 0.08, 0.2); }
  let d = abs(fract(vec2f(x, z) * 1.6) - 0.5);
  if (abs(d.x + d.y - 0.3) < 0.03) { return vec3f(0.6, 0.5, 0.36); }
  return vec3f(0.38, 0.06, 0.05);
}

fn albedo(mat: u32, p: vec3f) -> vec3f {
  switch mat {
    case M_FLOOR: { return rug(p.x, p.z); }
    case M_CEIL: { return select(vec3f(0.3, 0.25, 0.2), vec3f(0.1, 0.06, 0.04), fract(p.z * 1.4) < 0.14); }
    case M_BRASS: { return vec3f(0.95, 0.68, 0.3); }
    case M_SADU: { return sadu(p.y, p.x + p.z); }
    case M_SEAT: { return vec3f(0.36, 0.07, 0.05); }
    case M_WOOD: { return vec3f(0.26, 0.14, 0.07); }
    default: {
      if (p.y < 0.9) { return select(vec3f(0.16, 0.3, 0.31), vec3f(0.6, 0.5, 0.36), p.y > 0.86); }
      return vec3f(0.5, 0.43, 0.35);
    }
  }
}

const SHINE = 40.0;
const BRASS_DIFFUSE = 0.3;

fn bsdf(mat: u32, a: vec3f, n: vec3f, wo: vec3f, wi: vec3f) -> vec3f {
  if (mat != M_BRASS) { return a / PI; }
  let c = max(0.0, dot(reflect(-wo, n), wi));
  return a * (BRASS_DIFFUSE / PI + (1.0 - BRASS_DIFFUSE) * (SHINE + 2.0) / TAU * pow(c, SHINE));
}

struct Query { o: vec3f, d: vec3f, dist: f32, gain: vec3f };

const NO_QUERY = Query(vec3f(0.0), vec3f(0.0, 1.0, 0.0), 0.0, vec3f(0.0));

fn flameQuery(p: vec3f, n: vec3f, wo: vec3f, mat: u32, a: vec3f) -> Query {
  let l = LANTERN - p;
  let d2 = dot(l, l);
  let wi = l * inverseSqrt(d2);
  let c = dot(n, wi);
  if (c <= 0.0) { return NO_QUERY; }
  return Query(p, wi, sqrt(d2) - 2.0 * FLAME_R, FLAME_I * P.flame * bsdf(mat, a, n, wo, wi) * c / d2);
}

fn windowQuery(p: vec3f, n: vec3f, wo: vec3f, mat: u32, a: vec3f) -> Query {
  let y = mix(WIN_Y0, WIN_Y1, rand());
  let z = WIN_Z + (rand() - 0.5) * WIN_W;
  if (!windowOpen(y, z)) { return NO_QUERY; }
  let l = vec3f(ROOM_MIN.x, y, z) - p;
  let d2 = dot(l, l);
  let wi = l * inverseSqrt(d2);
  let c = dot(n, wi);
  let cl = -wi.x;
  if (c <= 0.0 || cl <= 0.0) { return NO_QUERY; }
  let area = WIN_W * (WIN_Y1 - WIN_Y0);
  return Query(p, wi, sqrt(d2) - 2.0 * EPS, MOON * bsdf(mat, a, n, wo, wi) * c * cl * area / d2);
}

fn hazeQuery(ro: vec3f, rd: vec3f, tmax: f32) -> Query {
  let delta = dot(LANTERN - ro, rd);
  let D = max(length(ro + rd * delta - LANTERN), 1e-3);
  let a0 = atan2(-delta, D);
  let a1 = atan2(tmax - delta, D);
  let p = ro + rd * (delta + D * tan(mix(a0, a1, rand())));
  let l = LANTERN - p;
  let dist = length(l);
  return Query(p, l / dist, dist - 2.0 * FLAME_R, FLAME_I * P.flame * HAZE / (4.0 * PI) * (a1 - a0) / D);
}

fn emitted(mat: u32) -> vec3f {
  if (mat == M_FLAME) { return FLAME_I * P.flame / (PI * FLAME_R * FLAME_R); }
  if (mat == M_WINDOW) { return MOON; }
  return vec3f(0.0);
}

fn nextDir(mat: u32, n: vec3f, wo: vec3f, a: vec3f, weight: ptr<function, vec3f>) -> vec3f {
  if (mat != M_BRASS || rand() < BRASS_DIFFUSE) {
    *weight = a;
    return cosineDir(n);
  }
  let r = reflect(-wo, n);
  let c = pow(rand(), 1.0 / (SHINE + 1.0));
  let s = sqrt(max(0.0, 1.0 - c * c));
  let phi = TAU * rand();
  let t = normalize(cross(select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(r.x) > 0.9), r));
  let wi = normalize(r * c + (t * cos(phi) + cross(r, t) * sin(phi)) * s);
  *weight = a * max(0.0, dot(n, wi)) * (SHINE + 2.0) / (SHINE + 1.0);
  return wi;
}

fn push(queue: ptr<function, array<Query, 3>>, pending: ptr<function, u32>, q: Query, throughput: vec3f, limit: f32) {
  if (q.dist <= 0.0) { return; }
  (*queue)[*pending] = Query(q.o, q.d, q.dist, min(q.gain * throughput, vec3f(limit)));
  *pending += 1u;
}

fn radiance(camPos: vec3f, camDir: vec3f) -> vec3f {
  var queue: array<Query, 3>;
  var pending = 0u;
  var pathO = camPos;
  var pathD = camDir;
  var depth = 0u;
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  loop {
    let shadow = pending > 0u;
    var ro = pathO;
    var rd = pathD;
    if (shadow) {
      pending--;
      ro = queue[pending].o;
      rd = queue[pending].d;
    } else if (depth > P.bounces) {
      break;
    }
    let h = trace(ro, rd);
    if (shadow) {
      if (h.t >= queue[pending].dist) { L += queue[pending].gain; }
      continue;
    }
    depth++;
    if (depth == 1u) {
      L += emitted(h.mat);
      push(&queue, &pending, hazeQuery(ro, rd, h.t), vec3f(1.0), FAR);
    }
    if (h.mat >= M_FLAME) {
      depth = P.bounces + 1u;
      continue;
    }
    let p = ro + rd * h.t;
    let n = faceForward(h.n, rd, h.n);
    let a = albedo(h.mat, p);
    pathO = p + n * EPS;
    let limit = select(INDIRECT_LIMIT, FAR, depth == 1u);
    push(&queue, &pending, flameQuery(pathO, n, -rd, h.mat, a), T, limit);
    push(&queue, &pending, windowQuery(pathO, n, -rd, h.mat, a), T, limit);
    var w: vec3f;
    pathD = nextDir(h.mat, n, -rd, a, &w);
    T *= w;
  }
  return L;
}

fn cameraRay(px: vec2f) -> vec3f {
  let res = vec2f(P.size);
  let uv = (2.0 * px - res) / res.y * tan(0.5 * CAM_FOV);
  let f = normalize(CAM_AT - CAM_POS);
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  let u = cross(r, f);
  return normalize(f + r * uv.x - u * uv.y);
}

@compute @workgroup_size(8, 8)
fn accumulate(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= P.size.x || id.y >= P.size.y) { return; }
  let i = id.y * P.size.x + id.x;
  seed = i * 1973u + P.frame * 9277u + 26699u;
  seed = seed * 747796405u + 2891336453u;
  var sum = vec3f(0.0);
  for (var s = 0u; s < P.spp; s++) {
    let px = vec2f(id.xy) + vec2f(rand(), rand());
    sum += radiance(CAM_POS, cameraRay(px));
  }
  let fresh = sum / f32(P.spp);
  if (all(fresh == fresh)) { accum[i] = mix(accum[i], vec4f(fresh, 1.0), P.blend); }
}

@group(0) @binding(1) var<storage, read> accumIn: array<vec4<f32>>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn bayer4(p: vec2<u32>) -> f32 {
  var m = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[(p.y & 3u) * 4u + (p.x & 3u)] + 0.5) / 16.0;
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let res = vec2f(P.size);
  let q = min(vec2<u32>(pos.xy / P.view * res), P.size - 1u);
  let hdr = accumIn[q.y * P.size.x + q.x].rgb * P.exposure;
  let uv = pos.xy / P.view - 0.5;
  let vignette = 1.0 - 0.55 * dot(uv, uv);
  let c = pow(aces(hdr * vignette), vec3f(1.0 / 2.2));
  let levels = 31.0;
  let d = floor(c * levels + bayer4(q)) / levels;
  return vec4f(d, 1.0);
}
