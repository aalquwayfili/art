struct Frame {
  eye: vec4f,
  right: vec4f,
  up: vec4f,
  fwd: vec4f,
  sun: vec4f,
  sunColor: vec4f,
  skyTop: vec4f,
  skyLow: vec4f,
  res: vec4f,
}

struct Brick { lo: vec3f, time: f32, size: vec3f, mat: u32 }
struct Box { lo: vec4f, hi: vec4f }

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> cells: array<u32>;
@group(0) @binding(2) var<storage, read> bricks: array<Brick>;
@group(0) @binding(3) var<storage, read> coarse: array<u32>;
@group(0) @binding(4) var<storage, read> boxes: array<Box>;
@group(0) @binding(5) var<storage, read> studs: array<vec4f>;
@group(0) @binding(6) var<storage, read> shadowBoxes: array<Box>;
@group(0) @binding(7) var hdr: texture_2d<f32>;

const PLATE = 0.4;
const GRID = vec3i(192, 128, 192);
const FALL = 0.5;
const STUD_R = 0.3;
const STUD_H = 0.53;
const BEVEL = 0.045;
const NEAR = 10.0;
const FAR = 1200.0;
const TAU = 6.2831853;

var<private> PALETTE: array<vec3f, 35> = array<vec3f, 35>(
  vec3f(0.0),
  vec3f(0.8, 0.78, 0.74),
  vec3f(0.584, 0.541, 0.451),
  vec3f(0.93, 0.93, 0.92),
  vec3f(0.72, 0.73, 0.74),
  vec3f(0.45, 0.46, 0.47),
  vec3f(0.19, 0.2, 0.21),
  vec3f(0.55, 0.62, 0.66),
  vec3f(0.38, 0.45, 0.52),
  vec3f(0.8, 0.6, 0.25),
  vec3f(0.46, 0.56, 0.43),
  vec3f(0.3, 0.39, 0.31),
  vec3f(0.45, 0.38, 0.32),
  vec3f(0.96, 0.8, 0.2),
  vec3f(0.26, 0.28, 0.31),
  vec3f(0.96, 0.93, 0.82),
  vec3f(0.79, 0.1, 0.05),
  vec3f(0.05, 0.35, 0.75),
  vec3f(0.25, 0.7, 0.78),
  vec3f(0.82, 0.6, 0.4),
  vec3f(0.98, 0.52, 0.1),
  vec3f(0.28, 0.31, 0.34),
  vec3f(0.7, 0.72, 0.74),
  vec3f(0.6, 0.08, 0.05),
  vec3f(0.12, 0.55, 0.58),
  vec3f(0.66, 0.42, 0.2),
  vec3f(0.12, 0.26, 0.6),
  vec3f(0.72, 0.75, 0.78),
  vec3f(0.84, 0.7, 0.45),
  vec3f(0.24, 0.58, 0.4),
  vec3f(0.6, 0.72, 0.75),
  vec3f(0.66, 0.62, 0.74),
  vec3f(0.78, 0.7, 0.58),
  vec3f(0.86, 0.79, 0.67),
  vec3f(0.84, 0.82, 0.77),
);

fn albedo(m: u32) -> vec3f { return pow(PALETTE[m & 255u], vec3f(2.2)); }

fn hash3(c: vec3i) -> f32 {
  var x = (u32(c.x) * 73856093u) ^ (u32(c.y) * 19349663u) ^ (u32(c.z) * 83492791u);
  x = x * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn axisVec(a: i32) -> vec3f { return vec3f(f32(a == 0), f32(a == 1), f32(a == 2)); }
fn axisInt(a: i32) -> vec3i { return vec3i(i32(a == 0), i32(a == 1), i32(a == 2)); }

fn inGrid(c: vec3i) -> bool { return all(c >= vec3i(0)) && all(c < GRID); }

fn cellAt(c: vec3i) -> u32 {
  if (!inGrid(c)) { return 0u; }
  return cells[u32((c.y * GRID.z + c.z) * GRID.x + c.x)];
}

fn solid(c: vec3i) -> u32 {
  let id = cellAt(c);
  if (id != 0u && bricks[id].time + FALL <= F.fwd.w) { return id; }
  return 0u;
}

fn isTile(id: u32) -> bool { return (bricks[id].mat >> 8u) == 2u; }
fn blockUsed(b: vec3i) -> bool { return coarse[u32((b.y * 24 + b.z) * 24 + b.x)] != 0u; }
fn occ(c: vec3i) -> f32 { return f32(solid(c) != 0u); }

struct Span { t0: f32, t1: f32, a0: i32, a1: i32 }

fn span(ro: vec3f, inv: vec3f, lo: vec3f, hi: vec3f) -> Span {
  let ta = (lo - ro) * inv;
  let tb = (hi - ro) * inv;
  let tn = min(ta, tb);
  let tf = max(ta, tb);
  var s: Span;
  s.t0 = max(tn.x, max(tn.y, tn.z));
  s.t1 = min(tf.x, min(tf.y, tf.z));
  s.a0 = select(select(2, 1, tn.y >= tn.z), 0, tn.x >= tn.y && tn.x >= tn.z);
  s.a1 = select(select(2, 1, tf.y <= tf.z), 0, tf.x <= tf.y && tf.x <= tf.z);
  return s;
}

fn stud(ro: vec3f, rd: vec3f, c: vec3i, t0: f32, t1: f32) -> vec4f {
  let ctr = vec2f(f32(c.x) + 0.5, f32(c.z) + 0.5);
  let yb = f32(c.y);
  let yt = yb + STUD_H;
  var best = vec4f(0.0, 0.0, 0.0, -1.0);
  if (rd.y < 0.0) {
    let tc = (yt - ro.y) / rd.y;
    let q = ro.xz + rd.xz * tc - ctr;
    if (tc >= t0 - 1e-4 && tc <= t1 && dot(q, q) <= STUD_R * STUD_R) { best = vec4f(0.0, 1.0, 0.0, tc); }
  }
  let oc = ro.xz - ctr;
  let a = dot(rd.xz, rd.xz);
  let b = dot(oc, rd.xz);
  let disc = b * b - a * (dot(oc, oc) - STUD_R * STUD_R);
  if (disc > 0.0 && a > 1e-12) {
    let ts = (-b - sqrt(disc)) / a;
    let y = ro.y + rd.y * ts;
    if (ts >= t0 - 1e-4 && ts <= t1 && y >= yb && y <= yt && (best.w < 0.0 || ts < best.w)) {
      let q = oc + rd.xz * ts;
      best = vec4f(q.x / STUD_R, 0.0, q.y / STUD_R, ts);
    }
  }
  return best;
}

struct Hit { t: f32, n: vec3f, cell: vec3i, id: u32, stud: bool }

fn trace(roW: vec3f, rdW: vec3f) -> Hit {
  var h: Hit;
  h.t = -1.0;
  let ro = roW * vec3f(1.0, 1.0 / PLATE, 1.0);
  var rd = rdW * vec3f(1.0, 1.0 / PLATE, 1.0);
  rd = select(rd, vec3f(1e-7), abs(rd) < vec3f(1e-7));
  let inv = 1.0 / rd;
  let dir = vec3i(sign(rd));
  let g = span(ro, inv, vec3f(0.0), vec3f(GRID));
  if (g.t1 <= max(g.t0, 0.0)) { return h; }
  let grid = GRID;
  var t = max(g.t0, 0.0);
  var axis = g.a0;
  var c = clamp(vec3i(floor(ro + rd * t)), vec3i(0), grid - vec3i(1));
  if (g.t0 > 0.0) { c[axis] = select(grid[axis] - 1, 0, dir[axis] > 0); }
  for (var outer = 0; outer < 96; outer++) {
    if (!inGrid(c)) { break; }
    let b = c / 8;
    if (!blockUsed(b)) {
      let s = span(ro, inv, vec3f(b * 8), vec3f(b * 8 + 8));
      t = s.t1;
      axis = s.a1;
      c = clamp(vec3i(floor(ro + rd * t)), b * 8, b * 8 + vec3i(7));
      c[axis] = select(b[axis] * 8 - 1, b[axis] * 8 + 8, dir[axis] > 0);
      continue;
    }
    var tMax = (vec3f(c) + select(vec3f(0.0), vec3f(1.0), rd > vec3f(0.0)) - ro) * inv;
    let tDelta = abs(inv);
    var tEnter = t;
    var left = false;
    for (var i = 0; i < 25; i++) {
      let tExit = min(tMax.x, min(tMax.y, tMax.z));
      let id = solid(c);
      if (id != 0u) {
        h.t = tEnter;
        h.n = -axisVec(axis) * sign(rd[axis]);
        h.cell = c;
        h.id = id;
        return h;
      }
      if (c.y > 0) {
        let below = solid(c - vec3i(0, 1, 0));
        if (below != 0u && !isTile(below)) {
          let s = stud(ro, rd, c, tEnter, tExit);
          if (s.w >= 0.0) {
            h.t = s.w;
            h.n = s.xyz;
            h.cell = c - vec3i(0, 1, 0);
            h.id = below;
            h.stud = true;
            return h;
          }
        }
      }
      if (tMax.x < tMax.y && tMax.x < tMax.z) { axis = 0; } else if (tMax.y < tMax.z) { axis = 1; } else { axis = 2; }
      tEnter = tMax[axis];
      c[axis] += dir[axis];
      tMax[axis] += tDelta[axis];
      if (any(c < b * 8) || any(c >= b * 8 + 8)) { left = true; break; }
    }
    if (!left) { break; }
    t = tEnter;
  }
  return h;
}

fn sky(d: vec3f) -> vec3f {
  var c = mix(F.skyLow.rgb, F.skyTop.rgb, smoothstep(0.0, 0.7, d.y));
  return c + F.sunColor.rgb * 0.05 * pow(max(dot(d, F.sun.xyz), 0.0), 12.0);
}

fn shadow(p: vec3f, l: vec3f) -> f32 {
  if (trace(p, l).t >= 0.0) { return 0.0; }
  if (props(p, l).t > 0.0) { return 0.0; }
  let inv = 1.0 / select(l, vec3f(1e-7), abs(l) < vec3f(1e-7));
  let n = u32(F.skyLow.w);
  for (var i = 0u; i < n; i++) {
    let s = span(p, inv, shadowBoxes[i].lo.xyz, shadowBoxes[i].hi.xyz);
    if (s.t1 > max(s.t0, 0.0)) { return 0.0; }
  }
  return 1.0;
}

fn emission(m: u32, c: vec3i) -> vec3f {
  let night = F.sun.w;
  if (m == 14u) { return vec3f(1.0, 0.7, 0.36) * 1.4 * step(hash3(c), 0.4) * night; }
  if (m == 15u) { return vec3f(1.0, 0.8, 0.5) * 1.1 * night; }
  if (m == 30u) { return vec3f(0.2, 0.85, 1.0) * 2.2 * night; }
  if (m == 31u) { return vec3f(0.65, 0.35, 1.0) * 2.2 * night; }
  if (m == 32u) { return vec3f(1.0, 0.6, 0.2) * 2.2 * night; }
  if (m == 23u) { return vec3f(1.0, 0.12, 0.06) * 3.0 * night; }
  if (m == 22u) { return vec3f(0.15, 0.3, 1.0) * 0.45 * night; }
  return vec3f(0.0);
}

fn shade(p: vec3f, n: vec3f, mat: u32, ao: f32, seam: f32, emit: vec3f, v: vec3f) -> vec3f {
  let m = mat & 255u;
  let base = albedo(m);
  let glass = m == 7u || m == 8u || m == 14u || m == 21u || (m >= 24u && m <= 29u);
  let metal = m == 9u;
  let l = F.sun.xyz;
  let ndl = max(dot(n, l), 0.0);
  var vis = 0.0;
  if (ndl > 0.0 && F.sunColor.r > 0.001) { vis = shadow(p + n * 0.004, l); }
  let hv = normalize(l + v);
  let nv = max(dot(n, v), 0.0);
  let f0 = select(select(0.045, 0.08, glass), 0.6, metal);
  let fres = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
  let shin = select(90.0, 400.0, glass || metal);
  let spec = pow(max(dot(n, hv), 0.0), shin) * (shin + 8.0) / 25.0 * fres;
  let amb = mix(F.skyLow.rgb * vec3f(0.8, 0.7, 0.55), F.skyTop.rgb, n.y * 0.5 + 0.5) * 0.75;
  let tinted = m >= 24u && m <= 29u;
  let kd = select(select(select(1.0, 0.55, glass), 0.85, tinted), 0.45, metal);
  let tint = select(vec3f(1.0), base * 1.6, metal);
  var c = base * kd * (F.sunColor.rgb * ndl * vis + amb * ao);
  c += F.sunColor.rgb * spec * vis * tint;
  c += sky(reflect(-v, n)) * fres * ao * tint * select(0.5, 1.0, glass || metal);
  return c * (1.0 - 0.6 * seam) + emit;
}

struct Bevel { n: vec3f, seam: f32 }

fn bevel(p: vec3f, n: vec3f, lo: vec3f, hi: vec3f) -> Bevel {
  var o: Bevel;
  o.n = n;
  o.seam = 0.0;
  for (var k = 0; k < 3; k++) {
    if (abs(n[k]) > 0.5) { continue; }
    let e0 = p[k] - lo[k];
    let e1 = hi[k] - p[k];
    let w = 1.0 - smoothstep(0.0, BEVEL, min(e0, e1));
    o.n += axisVec(k) * select(1.0, -1.0, e0 < e1) * w * 0.9;
    o.seam = max(o.seam, 1.0 - smoothstep(0.0, 0.018, min(e0, e1)));
  }
  o.n = normalize(o.n);
  return o;
}

fn faceAO(c: vec3i, n: vec3f, pg: vec3f) -> f32 {
  let a = select(select(2, 1, abs(n.y) > 0.5), 0, abs(n.x) > 0.5);
  let u = (a + 1) % 3;
  let v = (a + 2) % 3;
  let front = c + vec3i(n);
  let f = fract(pg);
  let du = axisInt(u);
  let dv = axisInt(v);
  let wu0 = 1.0 - smoothstep(0.0, 0.75, f[u]);
  let wu1 = 1.0 - smoothstep(0.0, 0.75, 1.0 - f[u]);
  let wv0 = 1.0 - smoothstep(0.0, 0.75, f[v]);
  let wv1 = 1.0 - smoothstep(0.0, 0.75, 1.0 - f[v]);
  var ao = 1.0;
  ao -= 0.3 * (occ(front - du) * wu0 + occ(front + du) * wu1 + occ(front - dv) * wv0 + occ(front + dv) * wv1);
  ao -= 0.2 * (occ(front - du - dv) * wu0 * wv0 + occ(front + du - dv) * wu1 * wv0
             + occ(front - du + dv) * wu0 * wv1 + occ(front + du + dv) * wu1 * wv1);
  return max(ao, 0.3);
}

fn ink(d: f32, w: f32, px: f32) -> f32 { return 1.0 - smoothstep(w, w + px, d); }

fn fn_line(q: vec2f, px: f32) -> f32 {
  let g1 = abs(fract(q / 4.0 + 0.5) - 0.5) * 4.0;
  let g8 = abs(fract(q / 32.0 + 0.5) - 0.5) * 32.0;
  var a = max(ink(min(g1.x, g1.y), 0.04, px) * 0.3, ink(min(g8.x, g8.y), 0.12, px) * 0.7);
  let front = ink(abs(q.y - 202.0), 0.2, px) * step(0.0, q.x) * step(q.x, 192.0);
  let frontTicks = ink(min(abs(q.x), abs(q.x - 192.0)), 0.2, px) * step(abs(q.y - 202.0), 4.0);
  let side = ink(abs(q.x + 10.0), 0.2, px) * step(0.0, q.y) * step(q.y, 192.0);
  let sideTicks = ink(min(abs(q.y), abs(q.y - 192.0)), 0.2, px) * step(abs(q.x + 10.0), 4.0);
  a = max(a, max(max(front, frontTicks), max(side, sideTicks)));
  let e = min(min(q.x + 24.0, 216.0 - q.x), min(q.y + 22.0, 216.0 - q.y));
  return max(a, ink(abs(e), 0.25, px));
}

struct Prop { t: f32, n: vec3f, alb: vec3f, rough: f32, metal: f32 }

fn capCyl(ro: vec3f, rd: vec3f, pa: vec3f, pb: vec3f, ra: f32) -> vec4f {
  let ba = pb - pa;
  let oc = ro - pa;
  let baba = dot(ba, ba);
  let bard = dot(ba, rd);
  let baoc = dot(ba, oc);
  let k2 = baba - bard * bard;
  let k1 = baba * dot(oc, rd) - baoc * bard;
  let k0 = baba * dot(oc, oc) - baoc * baoc - ra * ra * baba;
  var h = k1 * k1 - k2 * k0;
  if (h < 0.0) { return vec4f(-1.0); }
  h = sqrt(h);
  var t = (-k1 - h) / k2;
  let y = baoc + t * bard;
  if (y > 0.0 && y < baba) { return vec4f(t, (oc + t * rd - ba * y / baba) / ra); }
  t = (select(baba, 0.0, y < 0.0) - baoc) / bard;
  if (abs(k1 + k2 * t) < h) { return vec4f(t, ba * sign(y) / sqrt(baba)); }
  return vec4f(-1.0);
}

fn turnedBox(ro: vec3f, rd: vec3f, c: vec3f, s: vec3f, a: f32) -> vec4f {
  let cs = cos(a);
  let sn = sin(a);
  let rot = mat2x2f(cs, -sn, sn, cs);
  let o = ro - c;
  let lo = vec3f(rot * o.xz, o.y).xzy;
  let ld = vec3f(rot * rd.xz, rd.y).xzy;
  let inv = 1.0 / select(ld, vec3f(1e-7), abs(ld) < vec3f(1e-7));
  let s0 = span(lo, inv, -s, s);
  if (s0.t1 <= max(s0.t0, 0.0)) { return vec4f(-1.0); }
  var n = -axisVec(s0.a0) * sign(ld[s0.a0]);
  let back = mat2x2f(cs, sn, -sn, cs);
  n = vec3f(back * n.xz, n.y).xzy;
  return vec4f(s0.t0, n);
}

fn keep(best: Prop, t: f32, n: vec3f, alb: vec3f, rough: f32, metal: f32) -> Prop {
  if (t > 0.0 && (best.t < 0.0 || t < best.t)) { return Prop(t, normalize(n), alb, rough, metal); }
  return best;
}

fn props(ro: vec3f, rd: vec3f) -> Prop {
  var b = Prop(-1.0, vec3f(0.0), vec3f(0.0), 0.0, 0.0);
  let p0 = vec3f(58.0, 0.44, 214.0);
  let p1 = vec3f(76.0, 0.44, 200.0);
  let dir = normalize(p1 - p0);
  var h = capCyl(ro, rd, p0, p1 - dir * 2.6, 0.44);
  b = keep(b, h.x, h.yzw, pow(vec3f(0.07, 0.1, 0.22), vec3f(2.2)), 0.25, 0.0);
  h = capCyl(ro, rd, p0 - dir * 0.01, p0 + dir * 0.7, 0.445);
  b = keep(b, h.x, h.yzw, pow(vec3f(0.78, 0.62, 0.3), vec3f(2.2)), 0.3, 1.0);
  for (var i = 0; i < 4; i++) {
    let a = p1 - dir * (2.6 - f32(i) * 0.6);
    h = capCyl(ro, rd, a, a + dir * 0.6, 0.4 - f32(i) * 0.09);
    b = keep(b, h.x, h.yzw, pow(vec3f(0.82, 0.66, 0.46), vec3f(2.2)), 0.8, 0.0);
  }
  h = capCyl(ro, rd, p1 - dir * 0.2, p1 + dir * 0.35, 0.06);
  b = keep(b, h.x, h.yzw, vec3f(0.02), 0.5, 0.0);
  h = turnedBox(ro, rd, vec3f(126.0, 0.12, 205.0), vec3f(18.75, 0.12, 2.2), 0.05);
  if (h.x > 0.0) {
    let p = ro + rd * h.x - vec3f(126.0, 0.12, 205.0);
    let u = cos(0.05) * p.x + sin(0.05) * p.z;
    let v = -sin(0.05) * p.x + cos(0.05) * p.z;
    let mm = fract(u / 0.125 + 0.5);
    let cm = fract(u / 1.25 + 0.5);
    let tick = select(0.0, 1.0, abs(mm - 0.5) > 0.44 && v < -1.2) + select(0.0, 1.0, abs(cm - 0.5) > 0.46 && v < -0.6);
    let top = h.z > 0.5;
    b = keep(b, h.x, h.yzw, mix(vec3f(0.62, 0.63, 0.65), vec3f(0.02), select(0.0, min(tick, 1.0), top)), 0.35, 1.0);
  }
  h = capCyl(ro, rd, vec3f(178.0, 0.0, 214.0), vec3f(178.0, 12.0, 214.0), 5.0);
  if (h.x > 0.0) {
    let top = h.z > 0.5;
    b = keep(b, h.x, h.yzw, select(vec3f(0.85, 0.84, 0.8), pow(vec3f(0.16, 0.09, 0.05), vec3f(2.2)), top), select(0.2, 0.05, top), 0.0);
  }
  h = turnedBox(ro, rd, vec3f(70.0, 0.03, 214.0), vec3f(26.0, 0.03, 18.5), -0.12);
  if (h.x > 0.0) {
    let p = ro + rd * h.x;
    let g = abs(fract(p.xz / 3.0) - 0.5);
    let ink = select(0.0, 0.35, min(g.x, g.y) < 0.03) + select(0.0, 0.5, fract(sin(dot(floor(p.xz / 3.0), vec2f(12.9, 78.2))) * 43758.5) > 0.82);
    b = keep(b, h.x, h.yzw, mix(vec3f(0.8, 0.78, 0.72), vec3f(0.18, 0.2, 0.28), min(ink, 0.8)), 0.9, 0.0);
  }
  h = turnedBox(ro, rd, vec3f(-44.0, 0.03, 60.0), vec3f(18.5, 0.03, 26.0), 0.09);
  if (h.x > 0.0) {
    let p = ro + rd * h.x;
    let g = abs(fract(p.xz / 2.0) - 0.5);
    b = keep(b, h.x, h.yzw, mix(vec3f(0.8, 0.78, 0.72), vec3f(0.18, 0.2, 0.28), select(0.0, 0.3, min(g.x, g.y) < 0.03)), 0.9, 0.0);
  }
  return b;
}

fn shadeProp(p: vec3f, n: vec3f, pr: Prop, v: vec3f) -> vec3f {
  let l = F.sun.xyz;
  let ndl = max(dot(n, l), 0.0);
  var vis = 0.0;
  if (ndl > 0.0 && F.sunColor.r > 0.001) { vis = shadow(p + n * 0.01, l); }
  let hv = normalize(l + v);
  let shin = mix(400.0, 20.0, pr.rough);
  let f0 = mix(0.04, 0.7, pr.metal);
  let fres = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let amb = mix(F.skyLow.rgb * 0.5, F.skyTop.rgb, n.y * 0.5 + 0.5);
  let tint = mix(vec3f(1.0), pr.alb * 1.4, pr.metal);
  var c = pr.alb * (1.0 - pr.metal * 0.7) * (F.sunColor.rgb * ndl * vis + amb);
  c += F.sunColor.rgb * pow(max(dot(n, hv), 0.0), shin) * (shin + 8.0) / 25.0 * fres * vis * tint;
  c += sky(reflect(-v, n)) * fres * tint * 0.4;
  return c;
}

fn viewDepth(p: vec3f) -> f32 { return dot(p - F.eye.xyz, F.fwd.xyz); }

fn project(p: vec3f) -> vec4f {
  let q = p - F.eye.xyz;
  let d = dot(q, F.fwd.xyz);
  return vec4f(dot(q, F.right.xyz) / F.right.w, dot(q, F.up.xyz) / F.up.w, FAR * (d - NEAR) / (FAR - NEAR), d);
}

@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

struct TraceOut { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 }

@fragment fn fsTrace(@builtin(position) pos: vec4f) -> TraceOut {
  let ndc = vec2f(pos.x / F.res.x * 2.0 - 1.0, 1.0 - pos.y / F.res.y * 2.0);
  let rd = normalize(F.fwd.xyz + F.right.xyz * ndc.x * F.right.w + F.up.xyz * ndc.y * F.up.w);
  let ro = F.eye.xyz;
  let v = -rd;
  var col = vec3f(0.0);
  var p = ro + rd * FAR * 0.9;
  let h = trace(ro, rd);
  let pr = props(ro, rd);
  if (pr.t > 0.0 && (h.t < 0.0 || pr.t < h.t)) {
    p = ro + rd * pr.t;
    col = shadeProp(p, pr.n, pr, v);
  } else if (h.t >= 0.0) {
    p = ro + rd * h.t;
    let b = bricks[h.id];
    let m = b.mat & 255u;
    let emit = emission(m, h.cell);
    if (h.stud) {
      var n = h.n;
      let r = p.xz - (vec2f(h.cell.xz) + 0.5);
      if (n.y > 0.5) { n = normalize(n + vec3f(r.x, 0.0, r.y) * smoothstep(STUD_R - 0.05, STUD_R, length(r)) * 4.0); }
      col = shade(p, n, b.mat, 1.0, 0.0, emit, v);
    } else {
      let lo = b.lo * vec3f(1.0, PLATE, 1.0);
      let bv = bevel(p, h.n, lo, lo + b.size * vec3f(1.0, PLATE, 1.0));
      var ao = faceAO(h.cell, h.n, p * vec3f(1.0, 1.0 / PLATE, 1.0));
      if (h.n.y > 0.5 && !isTile(h.id) && solid(h.cell + vec3i(0, 1, 0)) == 0u) {
        ao *= mix(0.6, 1.0, smoothstep(STUD_R, STUD_R + 0.14, length(p.xz - vec2f(h.cell.xz) - 0.5)));
      }
      col = shade(p, bv.n, b.mat, ao, bv.seam, emit, v);
    }
  } else if (rd.y < 0.0) {
    p = ro + rd * (-ro.y / rd.y);
    var vis = 0.0;
    if (F.sunColor.r > 0.001) { vis = shadow(p + vec3f(0.0, 0.004, 0.0), F.sun.xyz); }
    let light = F.sunColor.rgb * max(F.sun.y, 0.0) + F.skyTop.rgb;
    let level = clamp(dot(light, vec3f(0.3, 0.5, 0.2)) / 1.6, 0.06, 1.0);
    let pool = exp(-pow(length(p.xz - vec2f(96.0)) / 190.0, 2.0));
    var base = vec3f(0.012, 0.012, 0.014) + vec3f(0.07, 0.066, 0.06) * pool;
    let q = p.xz;
    if (q.x > -28.0 && q.x < 220.0 && q.y > -26.0 && q.y < 220.0) {
      let px = length(p - ro) * 2.0 * F.up.w / F.res.y;
      base = mix(base * 1.25, vec3f(0.5, 0.47, 0.42) * (0.25 + 0.75 * pool), fn_line(q, px) * 0.8);
    }
    col = base * mix(0.6, 1.0, vis) * level;
  } else {
    col = vec3f(0.01, 0.01, 0.012);
  }
  var o: TraceOut;
  let d = viewDepth(p);
  o.color = vec4f(col, d);
  o.depth = clamp(FAR * (d - NEAR) / ((FAR - NEAR) * d), 0.0, 1.0);
  return o;
}

struct BoxOut {
  @builtin(position) pos: vec4f,
  @location(0) p: vec3f,
  @location(1) @interpolate(flat) n: vec3f,
  @location(2) @interpolate(flat) lo: vec3f,
  @location(3) @interpolate(flat) hi: vec3f,
  @location(4) @interpolate(flat) mat: u32,
}

@vertex fn vsBox(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BoxOut {
  let b = boxes[ii];
  let f = vi / 6u;
  let a = f / 2u;
  let s = f32(f % 2u);
  var quad = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let uv = quad[vi % 6u];
  var w = vec3f(0.0);
  w[a] = s;
  w[(a + 1u) % 3u] = uv.x;
  w[(a + 2u) % 3u] = uv.y;
  var o: BoxOut;
  o.p = mix(b.lo.xyz, b.hi.xyz, w);
  o.pos = project(o.p);
  o.n = vec3f(0.0);
  o.n[a] = s * 2.0 - 1.0;
  o.lo = b.lo.xyz;
  o.hi = b.hi.xyz;
  o.mat = u32(b.lo.w);
  return o;
}

@fragment fn fsBox(i: BoxOut) -> @location(0) vec4f {
  let bv = bevel(i.p, i.n, i.lo, i.hi);
  return vec4f(shade(i.p, bv.n, i.mat, 1.0, bv.seam, emission(i.mat, vec3i(0)), normalize(F.eye.xyz - i.p)), viewDepth(i.p));
}

struct StudOut {
  @builtin(position) pos: vec4f,
  @location(0) p: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) mat: u32,
}

@vertex fn vsStud(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> StudOut {
  let s = studs[ii];
  let seg = vi / 9u;
  let k = vi % 9u;
  var side = array<u32, 6>(0u, 1u, 1u, 0u, 1u, 0u);
  var high = array<f32, 6>(0.0, 0.0, 1.0, 0.0, 1.0, 1.0);
  var ang = f32(seg) / 12.0 * TAU;
  var y = 1.0;
  var r = STUD_R;
  var n = vec3f(0.0, 1.0, 0.0);
  if (k < 6u) {
    ang = f32(seg + side[k]) / 12.0 * TAU;
    y = high[k];
    n = vec3f(cos(ang), 0.0, sin(ang));
  } else if (k == 6u) {
    r = 0.0;
  } else {
    ang = f32(seg + k - 7u) / 12.0 * TAU;
  }
  var o: StudOut;
  o.p = s.xyz + vec3f(cos(ang) * r, y * STUD_H * PLATE, sin(ang) * r);
  o.pos = project(o.p);
  o.n = n;
  o.mat = u32(s.w);
  return o;
}

@fragment fn fsStud(i: StudOut) -> @location(0) vec4f {
  return vec4f(shade(i.p, normalize(i.n), i.mat, 1.0, 0.0, vec3f(0.0), normalize(F.eye.xyz - i.p)), viewDepth(i.p));
}

fn blurRadius(d: f32) -> f32 {
  return min(abs(d - F.skyTop.w) / F.skyTop.w * F.res.y * 0.015, F.res.y * 0.004);
}

@fragment fn fsPost(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(hdr));
  let uv = pos.xy / F.res.zw;
  let ip = clamp(vec2i(uv * vec2f(size)), vec2i(0), size - 1);
  let c0 = textureLoad(hdr, ip, 0);
  let rad = blurRadius(c0.a);
  var col = c0.rgb;
  if (rad > 0.6) {
    var acc = vec3f(0.0);
    var wsum = 0.0;
    for (var i = 0; i < 36; i++) {
      let r = rad * sqrt((f32(i) + 0.5) / 36.0);
      let a = f32(i) * 2.39996;
      let q = clamp(ip + vec2i(round(vec2f(cos(a), sin(a)) * r)), vec2i(0), size - 1);
      let c = textureLoad(hdr, q, 0);
      let w = select(clamp(blurRadius(c.a) - r + 1.0, 0.0, 1.0), 1.0, c.a >= c0.a - 0.5);
      acc += c.rgb * w;
      wsum += w;
    }
    col = acc / max(wsum, 1e-4);
  }
  var glow = vec3f(0.0);
  let gr = F.res.y * 0.012;
  for (var j = 0; j < 16; j++) {
    let r = gr * sqrt((f32(j) + 0.5) / 16.0);
    let a = f32(j) * 2.39996 + 0.7;
    let q = clamp(ip + vec2i(round(vec2f(cos(a), sin(a)) * r)), vec2i(0), size - 1);
    glow += max(textureLoad(hdr, q, 0).rgb - 1.5, vec3f(0.0));
  }
  col += glow / 16.0 * 0.9;
  let x = col * F.sunColor.w;
  var c = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
  let e = uv - 0.5;
  c *= 1.0 - 0.35 * dot(e, e);
  c = pow(c, vec3f(1.0 / 2.2));
  c += (hash3(vec3i(vec2i(pos.xy), 7)) - 0.5) / 255.0;
  return vec4f(c, 1.0);
}
