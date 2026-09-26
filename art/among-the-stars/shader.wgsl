struct Params {
  size: vec2u,
  texel: f32,
  dt: f32,
}

struct Step { time: f32 }
struct View { size: vec2f, time: f32 }

struct Stroke {
  a: vec2f,
  b: vec2f,
  width: f32,
  t0: f32,
  t1: f32,
  water: f32,
  pigment: vec3f,
  clip: f32,
}

struct Ship {
  x: f32,
  heading: f32,
  turn: f32,
  radius: f32,
  length: f32,
  t0: f32,
  dur: f32,
}

const PI = 3.14159265;
const TAU = 6.2831853;
const PLANET = vec3f(0.05, -0.62, 0.85);
const MOON = vec3f(0.33, 0.73, 0.034);

const INDIGO = vec3f(1.0, 0.0, 0.0);
const OCHRE = vec3f(0.0, 1.0, 0.0);
const SIENNA = vec3f(0.0, 0.0, 1.0);

const STROKE_COUNT = 21u;
const STROKES = array<Stroke, STROKE_COUNT>(
  Stroke(vec2f(-0.25, 0.19), vec2f(0.6, 0.172), 0.07, 1.8, 2.6, 1.0, OCHRE * 0.2, 1.0),
  Stroke(vec2f(0.72, 0.12), vec2f(-0.6, 0.125), 0.075, 2.6, 3.5, 1.0, OCHRE * 0.18, 1.0),
  Stroke(vec2f(-0.75, 0.06), vec2f(0.8, 0.05), 0.08, 3.5, 4.4, 1.0, OCHRE * 0.16 + SIENNA * 0.04, 1.0),
  Stroke(vec2f(0.85, -0.01), vec2f(-0.85, -0.01), 0.06, 4.4, 5.0, 1.0, OCHRE * 0.14 + SIENNA * 0.05, 1.0),
  Stroke(vec2f(0.2, 0.2), vec2f(0.48, 0.0), 0.07, 5.0, 5.7, 0.6, INDIGO * 0.3 + SIENNA * 0.2, 1.0),
  Stroke(vec2f(0.45, 0.15), vec2f(0.72, -0.02), 0.07, 5.7, 6.2, 0.6, INDIGO * 0.4 + SIENNA * 0.15, 1.0),
  Stroke(vec2f(-0.92, 0.935), vec2f(0.25, 0.9), 0.09, 3.0, 3.6, 0.9, vec3f(0.0), 0.0),
  Stroke(vec2f(0.2, 0.84), vec2f(-0.85, 0.82), 0.08, 3.6, 4.2, 0.9, vec3f(0.0), 0.0),
  Stroke(vec2f(-0.85, 0.95), vec2f(-0.08, 0.93), 0.045, 4.3, 5.0, 0.5, INDIGO * 0.5, 0.0),
  Stroke(vec2f(-0.62, 0.88), vec2f(-0.36, 0.86), 0.03, 5.0, 5.4, 0.5, INDIGO * 0.7, 0.0),
  Stroke(vec2f(0.315, 0.735), vec2f(0.345, 0.725), 0.06, 6.3, 6.6, 1.0, OCHRE * 0.4 + SIENNA * 0.2, 2.0),
  Stroke(vec2f(-0.2, 0.875), vec2f(-0.19, 0.872), 0.04, 7.6, 7.7, 1.3, vec3f(0.0), 0.0),
  Stroke(vec2f(-0.1, 0.214), vec2f(0.1, 0.216), 0.025, 8.2, 8.6, 1.0, SIENNA * 0.2, 1.0),
  Stroke(vec2f(0.34, 0.13), vec2f(0.62, -0.04), 0.05, 11.0, 11.7, 1.0, INDIGO * 0.3, 1.0),
  Stroke(vec2f(0.33, 0.748), vec2f(0.352, 0.728), 0.022, 12.2, 12.4, 1.0, SIENNA * 0.45, 2.0),
  Stroke(vec2f(0.17, 0.6), vec2f(0.17, 0.6), 0.018, 9.5, 9.6, 1.0, INDIGO * 0.6, 0.0),
  Stroke(vec2f(-0.22, 0.52), vec2f(-0.22, 0.52), 0.015, 13.0, 13.1, 1.0, INDIGO * 0.5 + SIENNA * 0.2, 0.0),
  Stroke(vec2f(0.55, 0.86), vec2f(0.55, 0.86), 0.02, 15.6, 15.7, 1.0, INDIGO * 0.55, 0.0),
  Stroke(vec2f(-0.58, 0.6), vec2f(-0.58, 0.6), 0.016, 17.5, 17.6, 1.0, INDIGO * 0.45 + OCHRE * 0.2, 0.0),
  Stroke(vec2f(0.04, 0.8), vec2f(0.04, 0.8), 0.014, 19.0, 19.1, 1.0, INDIGO * 0.6, 0.0),
  Stroke(vec2f(0.3, 0.45), vec2f(0.3, 0.45), 0.012, 20.0, 20.1, 1.0, INDIGO * 0.5, 0.0),
);

const FIRST_STAR = 15u;

const SHIP_COUNT = 7u;
const SHIPS = array<Ship, SHIP_COUNT>(
  Ship(-0.08, 1.85, 1.0, 1.0, 1.1, 5.0, 13.0),
  Ship(0.12, 1.3, -1.0, 0.8, 0.8, 6.4, 11.0),
  Ship(0.02, 1.62, 1.0, 2.0, 0.75, 8.0, 12.0),
  Ship(0.28, 1.15, -1.0, 0.6, 0.9, 9.4, 11.0),
  Ship(-0.25, 2.05, 1.0, 0.6, 0.8, 10.8, 10.0),
  Ship(0.2, 1.45, 1.0, 1.4, 0.7, 12.6, 9.0),
  Ship(-0.15, 1.75, -1.0, 2.4, 0.62, 14.4, 8.0),
);

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

fn paperCoarse(p: vec2f) -> f32 {
  return 0.62 * noise(p * vec2f(78.0, 84.0)) + 0.38 * noise(p * 185.0 + 7.1);
}

fn paper(p: vec2f) -> f32 {
  return 0.8 * paperCoarse(p) + 0.2 * noise(p * 420.0 + 3.7);
}

fn segDist(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  return length(p - a - ab * h);
}

fn surfaceY(x: f32) -> f32 {
  let dx = x - PLANET.x;
  return PLANET.y + sqrt(max(PLANET.z * PLANET.z - dx * dx, 0.0));
}

fn shipCircle(k: u32) -> vec3f {
  let sh = SHIPS[k];
  let start = vec2f(sh.x, surfaceY(sh.x) + 0.003);
  let centre = start + sh.turn * sh.radius * vec2f(-sin(sh.heading), cos(sh.heading));
  return vec3f(centre, atan2(start.y - centre.y, start.x - centre.x));
}

fn shipAt(k: u32, t: f32) -> vec4f {
  let sh = SHIPS[k];
  let u = clamp((t - sh.t0) / sh.dur, 0.0, 1.0);
  let s = sh.length * u * u * (3.0 - 2.0 * u);
  let c = shipCircle(k);
  let a = c.z + sh.turn * s / sh.radius;
  return vec4f(c.xy + sh.radius * vec2f(cos(a), sin(a)), sh.turn * vec2f(-sin(a), cos(a)));
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> tick: Step;
@group(0) @binding(2) var<storage, read> src: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> plan: Plan;
@group(0) @binding(5) var<storage, read_write> paint: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> grain: array<f32>;

fn cellPos(c: vec2u) -> vec2f {
  let t = params.texel;
  return vec2f((f32(c.x) + 0.5) * t - 0.5 * f32(params.size.x) * t, (f32(c.y) + 0.5) * t);
}

@compute @workgroup_size(8, 8)
fn paperGrain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  grain[id.y * params.size.x + id.x] = paperCoarse(cellPos(id.xy));
}

struct Brush {
  a: vec2f,
  dir: vec2f,
  len: f32,
  span: vec2f,
  radius: f32,
  pigment: vec3f,
  water: f32,
  clip: f32,
  seed: f32,
}

struct Plan {
  count: u32,
  brushes: array<Brush, STROKE_COUNT>,
  ships: array<vec4f, SHIP_COUNT>,
}

@compute @workgroup_size(1)
fn prepare() {
  let t = tick.time;
  var n = 0u;
  for (var k = 0u; k < STROKE_COUNT; k++) {
    let s = STROKES[k];
    if (t < s.t0 || t > s.t1 + params.dt) { continue; }
    let span = max(s.t1 - s.t0, 1e-3);
    let len = max(length(s.b - s.a), 1e-4);
    let dir = select(vec2f(1.0, 0.0), (s.b - s.a) / len, len > 1e-3);
    plan.brushes[n] = Brush(s.a, dir, len,
      vec2f(clamp((t - params.dt - s.t0) / span, 0.0, 1.0), clamp((t - s.t0) / span, 0.0, 1.0)),
      0.5 * s.width, s.pigment * s.water, s.water, s.clip, f32(k));
    n++;
  }
  plan.count = n;
  for (var k = 0u; k < SHIP_COUNT; k++) {
    plan.ships[k] = vec4f(shipAt(k, t).xy, select(0.0, 1.0, t >= SHIPS[k].t0), 0.0);
  }
}

const FLOW = 0.2;
const DIFFUSE = 0.18;
const WET = 0.02;
const SPREAD = 0.25;
const EVAP = 0.0045;
const EDGE_EVAP = 4.0;
const SETTLE = 0.003;

fn flux(wa: f32, wb: f32, ha: f32, hb: f32) -> f32 {
  let wetA = wa > WET;
  let wetB = wb > WET;
  if (!wetA && !wetB) { return 0.0; }
  if (!wetB && wa < SPREAD + 0.6 * hb) { return 0.0; }
  if (!wetA && wb < SPREAD + 0.6 * ha) { return 0.0; }
  return FLOW * (wa - wb);
}

fn cover(b: Brush, p: vec2f, h: f32) -> f32 {
  let rel = p - b.a;
  let u = dot(rel, b.dir) / b.len;
  let wander = noise(vec2f(u * b.len * 9.0, b.seed * 5.1)) + 0.5 * noise(vec2f(u * b.len * 31.0, b.seed * 3.7));
  let side = dot(rel, vec2f(-b.dir.y, b.dir.x)) - 0.6 * b.radius * (wander - 0.75);
  let off = (u - clamp(u, b.span.x, b.span.y)) * b.len;
  let d = length(vec2f(off, side));
  let taper = 0.55 + 0.45 * sqrt(sin(PI * clamp(u, 0.0, 1.0)));
  let r = b.radius * taper * (0.75 + 0.5 * noise(vec2f(u * 11.0, b.seed * 7.3)));
  var c = 1.0 - smoothstep(0.85 * r, r, d);
  if (d > 0.75 * r && h > 0.78) { c = 0.0; }
  if (b.clip > 0.5) {
    let circle = select(PLANET, MOON, b.clip > 1.5);
    if (length(p - circle.xy) > circle.z - 0.003 + 0.004 * (noise(p * 55.0) - 0.5)) { c = 0.0; }
  }
  return c;
}

@compute @workgroup_size(8, 8)
fn flow(@builtin(global_invocation_id) id: vec3u) {
  let size = params.size;
  if (id.x >= size.x || id.y >= size.y) { return; }
  let t = tick.time;
  let i = id.y * size.x + id.x;
  let me = src[i];
  let p = cellPos(id.xy);
  let h = grain[i];

  var w = me.x;
  var g = me.yzw;
  var d = paint[i].xyz;
  let conc = g / max(w, 1e-4);

  var dw = 0.0;
  var dg = vec3f(0.0);
  var dryNeighbours = 0.0;
  let offsets = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var k = 0u; k < 4u; k++) {
    let c = vec2i(id.xy) + offsets[k];
    if (c.x < 0 || c.y < 0 || c.x >= i32(size.x) || c.y >= i32(size.y)) { continue; }
    let j = u32(c.y) * size.x + u32(c.x);
    let n = src[j];
    let wn = n.x;
    let concN = n.yzw / max(wn, 1e-4);
    let f = flux(w, wn, h, grain[j]);
    dg -= f * select(concN, conc, f > 0.0);
    dw -= f;
    dg += DIFFUSE * (concN - conc) * min(w, wn) * smoothstep(0.25, 0.7, min(w, wn));
    if (wn <= WET) { dryNeighbours += 1.0; }
  }
  w += dw;
  g = max(g + dg, vec3f(0.0));

  if (w > WET) {
    w -= EVAP * (1.0 + EDGE_EVAP * dryNeighbours) * (0.85 + 0.3 * h);
    let settle = clamp(SETTLE * (0.3 + 2.0 * (1.0 - h)) + 0.075 * (1.0 - smoothstep(0.03, 0.15, w)), 0.0, 1.0);
    d += g * settle;
    g -= g * settle;
  }
  if (w <= WET) {
    d += g;
    g = vec3f(0.0);
    w = 0.0;
  }

  for (var k = 0u; k < plan.count; k++) {
    let b = plan.brushes[k];
    let c = cover(b, p, h);
    if (c > 0.0) {
      w = max(w, b.water * c);
      g = max(g, b.pigment * c);
    }
  }

  if (t > 10.0 && t < 10.5) {
    for (var k = 0u; k < 4u; k++) {
      let at = 10.0 + 0.4 * f32(k) / 4.0;
      if (t < at || t > at + params.dt) { continue; }
      let q = vec2f(-0.35 + 0.7 * hash(k * 3u + 1u), 0.45 + 0.45 * hash(k * 3u + 2u));
      if (length(p - q) < mix(0.004, 0.007, hash(k * 3u + 3u))) {
        w = max(w, 0.7);
        g = max(g, INDIGO * 0.4);
      }
    }
  }

  let beat = u32(round(t / params.dt));
  for (var k = 0u; k < SHIP_COUNT; k++) {
    let s = plan.ships[k];
    if (s.z > 0.0 && hash(beat * 7u + k) < 0.55 && length(p - s.xy) < max(0.003, 0.6 * params.texel)) {
      w = max(w, 0.3);
      g = max(g, (INDIGO * 0.3 + SIENNA * 0.7) * 0.04);
    }
  }

  dst[i] = vec4f(w, g);
  paint[i] = vec4f(d, 0.0);
}

@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> waterIn: array<vec4f>;
@group(0) @binding(3) var<storage, read> paintIn: array<vec4f>;

struct Sample {
  water: vec4f,
  paint: vec4f,
  cover: f32,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

fn sampleCells(p: vec2f) -> Sample {
  let size = vec2f(params.size);
  let g = vec2f(p.x / params.texel + 0.5 * size.x, p.y / params.texel) - 0.5;
  let i0 = floor(g);
  let f = smoothstep(vec2f(0.0), vec2f(1.0), g - i0);
  var out = Sample(vec4f(0.0), vec4f(0.0), 0.0);
  for (var k = 0u; k < 4u; k++) {
    let o = vec2f(f32(k & 1u), f32(k >> 1u));
    let c = i0 + o;
    if (c.x < 0.0 || c.y < 0.0 || c.x >= size.x || c.y >= size.y) { continue; }
    let wgt = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
    let j = u32(c.y) * params.size.x + u32(c.x);
    let water = waterIn[j];
    let paint = paintIn[j];
    out.water += water * wgt;
    out.paint += paint * wgt;
    out.cover += wgt * step(0.004, dot(paint.xyz + water.yzw, vec3f(1.0)));
  }
  return out;
}

const K_INDIGO = vec3f(1.7, 1.3, 0.72);
const S_INDIGO = vec3f(0.04, 0.05, 0.07);
const K_OCHRE = vec3f(0.05, 0.22, 0.8);
const S_OCHRE = vec3f(0.3, 0.22, 0.1);
const K_SIENNA = vec3f(0.22, 0.8, 1.35);
const S_SIENNA = vec3f(0.1, 0.07, 0.05);

fn kubelkaMunk(q: vec3f, rg: vec3f) -> vec3f {
  let K = q.x * K_INDIGO + q.y * K_OCHRE + q.z * K_SIENNA + 1e-4;
  let S = q.x * S_INDIGO + q.y * S_OCHRE + q.z * S_SIENNA + 1e-4;
  let a = 1.0 + K / S;
  let b = sqrt(a * a - 1.0);
  let bs = min(b * S, vec3f(20.0));
  let c = a * sinh(bs) + b * cosh(bs);
  let r = sinh(bs) / c;
  let tr = b / c;
  return r + tr * tr * rg / (1.0 - r * rg);
}

fn arc(p: vec2f, c: vec2f, r: f32, a0: f32, sweep: f32) -> vec2f {
  let d = p - c;
  var rel = (atan2(d.y, d.x) - a0) * sign(sweep);
  rel -= TAU * floor(rel / TAU);
  let along = rel / abs(sweep);
  if (along > 1.0) { return vec2f(1e3, -1.0); }
  return vec2f(abs(length(d) - r), along);
}

fn graphite(dist: f32, along: f32, drawn: f32, px: f32, weight: f32) -> f32 {
  if (along < 0.0 || along > drawn) { return 0.0; }
  let press = weight * (0.35 + 0.65 * smoothstep(0.0, 0.12, along) * smoothstep(1.0, 0.8, along));
  return press * (1.0 - smoothstep(0.35 * px, 1.25 * px, dist));
}

fn reveal(t: f32, t0: f32, t1: f32) -> f32 {
  return clamp((t - t0) / (t1 - t0), 0.0, 1.0);
}

fn pencil(p: vec2f, t: f32, px: f32) -> f32 {
  var a = 0.0;
  let wob = 0.0015 * (noise(p * 9.0) - 0.5);
  var l = arc(p, PLANET.xy, PLANET.z + wob, 0.66, 1.84);
  a = max(a, graphite(l.x, l.y, reveal(t, 0.2, 1.6), px, 0.8));
  l = arc(p, PLANET.xy + vec2f(0.004, -0.002), PLANET.z + 0.003 + wob, 0.95, 1.1);
  a = max(a, graphite(l.x, l.y, reveal(t, 1.4, 2.2), px, 0.45));
  l = arc(p, MOON.xy, MOON.z + 0.4 * wob, 2.2, 6.9);
  a = max(a, graphite(l.x, l.y, reveal(t, 1.8, 2.5), px, 0.6));
  for (var k = 0u; k < 3u; k++) {
    let sh = SHIPS[k];
    let c = shipCircle(k);
    l = arc(p, c.xy, sh.radius + wob, c.z + sh.turn * 0.04 / sh.radius, sh.turn * sh.length * 0.75 / sh.radius);
    let dashed = step(0.4, noise(vec2f(l.y * 30.0, f32(k))));
    a = max(a, dashed * graphite(l.x, l.y, reveal(t, 2.0 + 0.3 * f32(k), 3.2 + 0.3 * f32(k)), px, 0.28));
  }
  for (var k = 0; k < 7; k++) {
    let x = 0.43 + 0.035 * f32(k);
    let top = surfaceY(x) - 0.012 - 0.01 * hash(u32(k) + 40u);
    let s0 = vec2f(x, top);
    let s1 = s0 + vec2f(0.05, -0.07 - 0.02 * hash(u32(k) + 50u));
    let u = clamp(dot(p - s0, s1 - s0) / dot(s1 - s0, s1 - s0), 0.0, 1.0);
    a = max(a, graphite(segDist(p, s0, s1), u, reveal(t, 2.6 + 0.07 * f32(k), 2.75 + 0.07 * f32(k)), px, 0.4));
  }
  return a;
}

fn pen(p: vec2f, a: vec2f, b: vec2f, w: f32, px: f32) -> f32 {
  return 1.0 - smoothstep(w - 0.5 * px, w + 0.5 * px, segDist(p, a, b));
}

fn figure(p: vec2f, base: vec2f, h: f32, wave: bool, seed: u32, px: f32) -> f32 {
  let w = max(0.0006, 0.55 * px);
  let j = (vec2f(hash(seed), hash(seed + 1u)) - 0.5) * 0.04 * h;
  let hip = base + vec2f(0.0, 0.42 * h) + j;
  let neck = base + vec2f(0.01 * h, 0.78 * h);
  let shoulder = base + vec2f(0.01 * h, 0.72 * h);
  var ink = pen(p, hip, neck, w, px);
  ink = max(ink, pen(p, hip, base + vec2f(-0.13 * h, 0.0), w, px));
  ink = max(ink, pen(p, hip, base + vec2f(0.12 * h, 0.0) + j, w, px));
  ink = max(ink, pen(p, shoulder, base + vec2f(-0.15 * h, 0.44 * h), w, px));
  let hand = select(base + vec2f(0.16 * h, 0.44 * h), base + vec2f(0.22 * h, 1.02 * h), wave);
  ink = max(ink, pen(p, shoulder, hand, w, px));
  let head = length(p - base - vec2f(0.015 * h, 0.9 * h)) - 0.1 * h;
  return max(ink, 1.0 - smoothstep(-0.5 * px, 0.5 * px, head));
}

fn stars(p: vec2f, t: f32, px: f32) -> vec2f {
  let cell = 0.048;
  let id = floor(p / cell);
  var ink = 0.0;
  var lead = 0.0;
  for (var k = 0; k < 9; k++) {
    let c = id + vec2f(f32(k % 3 - 1), f32(k / 3 - 1));
    if (hash2(c + 0.5) > 0.4) { continue; }
    let q = (c + 0.15 + 0.7 * vec2f(hash2(c + 11.3), hash2(c + 27.1))) * cell;
    if (q.y < surfaceY(q.x) + 0.05 || q.y > 0.985) { continue; }
    let appear = 2.8 + 7.0 * hash2(c + 5.9);
    if (t < appear) { continue; }
    let d = length(p - q);
    if (hash2(c + 13.7) < 0.06) {
      let arm = 0.004 + 0.003 * hash2(c + 3.3);
      let tilt = 0.3 * (hash2(c + 8.1) - 0.5);
      let u = vec2f(cos(tilt), sin(tilt)) * arm;
      let v = vec2f(-u.y, u.x) * (1.1 + 0.5 * hash2(c + 2.2));
      let cross = min(segDist(p, q - u, q + 0.8 * u), segDist(p, q - 0.7 * v, q + v));
      lead = max(lead, 0.55 * (1.0 - smoothstep(0.35 * px, 1.2 * px, cross)));
    } else {
      let r = mix(0.0006, 0.0024, pow(hash2(c + 7.7), 3.0)) + 0.00025 * (noise(p * 2500.0) - 0.5);
      ink = max(ink, (1.0 - smoothstep(r - 0.5 * px, r + 0.5 * px, d)) * min((t - appear) * 4.0, 1.0));
    }
  }
  for (var k = FIRST_STAR; k < STROKE_COUNT; k++) {
    let s = STROKES[k];
    let r = 0.0017;
    let dot = 1.0 - smoothstep(r - 0.5 * px, r + 0.5 * px, length(p - s.a));
    ink = max(ink, dot * smoothstep(s.t0 + 1.5, s.t0 + 1.8, t));
  }
  return vec2f(ink, lead);
}

fn ship(p: vec2f, k: u32, t: f32, px: f32) -> vec2f {
  if (t < SHIPS[k].t0) { return vec2f(0.0); }
  let at = shipAt(k, t);
  let dir = at.zw;
  let local = vec2f(dot(p - at.xy, dir), dot(p - at.xy, vec2f(-dir.y, dir.x)));
  let len = 0.0068;
  let wid = 0.0024 * (1.0 - 0.25 * clamp(-local.x / len, 0.0, 1.0));
  let sd = (length(local / vec2f(len, wid)) - 1.0) * wid;
  let lw = max(0.0005, 0.45 * px);
  var ink = 1.0 - smoothstep(lw - 0.5 * px, lw + 0.5 * px, abs(sd));
  ink = max(ink, pen(local, vec2f(-len, 0.0), vec2f(-len - 0.007, 0.0015 * sin(t * 1.3 + f32(k))), 0.6 * lw, px));
  let lamp = 1.0 - smoothstep(0.0008, 0.0008 + px, length(local - vec2f(0.35 * len, 0.0)));
  return vec2f(ink, lamp * step(sd, 0.0));
}

const PAPER = vec3f(0.9, 0.87, 0.8);
const GRAPHITE = vec3f(0.3, 0.3, 0.32);
const SEPIA = vec3f(0.07, 0.05, 0.04);
const INK_BLUE = vec3f(0.04, 0.05, 0.09);
const LAMP = vec3f(0.95, 0.62, 0.2);
const GRANULATION = vec3f(0.35, 0.5, 0.2);

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let px = 1.0 / view.size.y;
  let p = vec2f((frag.x - 0.5 * view.size.x) * px, 1.0 - frag.y * px);
  let t = view.time;

  let h = paper(p);
  let slope = vec2f(paper(p + vec2f(px, 0.0)) - h, paper(p + vec2f(0.0, px)) - h) / px;
  let rg = PAPER * (1.0 + 0.00035 * dot(slope, vec2f(-0.7, 0.7))) * (0.97 + 0.05 * h);

  let warp = vec2f(noise(p * 150.0), noise(p * 150.0 + 31.7)) + 0.5 * vec2f(noise(p * 380.0 + 5.3), noise(p * 380.0 + 9.1));
  let cell = sampleCells(p + (warp - 0.75) * 0.9 * params.texel);
  let edge = smoothstep(0.42, 0.58, cell.cover + 0.7 * (h - 0.5));
  var q = (cell.paint.xyz + 0.9 * cell.water.yzw) / max(cell.cover, 0.25) * edge;
  q *= max(vec3f(0.0), 1.0 + GRANULATION * (0.55 - h) * 2.4);
  var col = kubelkaMunk(q, rg);
  col *= 1.0 - 0.07 * smoothstep(0.03, 0.6, cell.water.x);

  let tooth = smoothstep(0.3, 0.7, h);
  let st = stars(p, t, px);
  let lead = max(pencil(p, t, px), st.y) * (0.35 + 0.65 * tooth);
  col *= 1.0 - lead * (1.0 - GRAPHITE);

  col = mix(col, INK_BLUE, st.x * 0.9);
  let x0 = -0.045;
  var ink = figure(p, vec2f(x0, surfaceY(x0) - 0.001), 0.03, false, 1u, px);
  ink = max(ink, figure(p, vec2f(x0 + 0.02, surfaceY(x0 + 0.02) - 0.001), 0.0205, false, 5u, px));
  ink = max(ink, figure(p, vec2f(x0 + 0.075, surfaceY(x0 + 0.075) - 0.001), 0.029, true, 9u, px));
  col = mix(col, SEPIA, ink * 0.85 * smoothstep(3.0, 3.6, t));
  for (var k = 0u; k < SHIP_COUNT; k++) {
    let s = ship(p, k, t, px);
    col = mix(col, SEPIA, s.x * 0.85);
    col = mix(col, LAMP * rg, s.y * 0.8);
  }

  col = mix(col, rg, smoothstep(21.4, 23.8, t));
  let dither = (hash(u32(frag.x) * 1973u + u32(frag.y) * 9277u) - 0.5) / 255.0;
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2)) + dither, 1.0);
}
