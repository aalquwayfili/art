struct Params {
  grid: vec2<u32>,
  view: vec2<f32>,
  time: f32,
  dt: f32,
  pad: vec2f,
  pointer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> vel: array<vec2f>;

fn index(c: vec2i) -> u32 {
  let q = clamp(c, vec2i(0), vec2i(P.grid) - 1);
  return u32(q.y) * P.grid.x + u32(q.x);
}

fn cell(id: vec3u) -> bool {
  return id.x < P.grid.x && id.y < P.grid.y;
}

@group(0) @binding(1) var<storage, read> velIn: array<vec2f>;
@group(0) @binding(2) var<storage, read> src: array<vec2f>;
@group(0) @binding(3) var<storage, read> hat: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> dst: array<vec2f>;

const DENSITY_FADE = 0.1;
const HEAT_FADE = 0.55;
const DRAG = 0.4;

struct Taps { i: vec4<u32>, f: vec2f };

fn taps(p: vec2f) -> Taps {
  let q = p - 0.5;
  let c = vec2i(floor(q));
  let i = vec4<u32>(index(c), index(c + vec2i(1, 0)), index(c + vec2i(0, 1)), index(c + vec2i(1, 1)));
  return Taps(i, q - floor(q));
}

fn lerp4(a: vec2f, b: vec2f, c: vec2f, d: vec2f, f: vec2f) -> vec2f {
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn sampleVel(p: vec2f) -> vec2f {
  let t = taps(p);
  return lerp4(velIn[t.i.x], velIn[t.i.y], velIn[t.i.z], velIn[t.i.w], t.f);
}

fn sampleSrc(p: vec2f) -> vec2f {
  let t = taps(p);
  return lerp4(src[t.i.x], src[t.i.y], src[t.i.z], src[t.i.w], t.f);
}

fn sampleHat(p: vec2f) -> vec2f {
  let t = taps(p);
  return lerp4(hat[t.i.x], hat[t.i.y], hat[t.i.z], hat[t.i.w], t.f);
}

fn backtrace(p: vec2f) -> vec2f {
  let mid = p - 0.5 * P.dt * sampleVel(p);
  return p - P.dt * sampleVel(mid);
}

@compute @workgroup_size(8, 8)
fn advectVelocity(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let p = vec2f(id.xy) + 0.5;
  dst[index(vec2i(id.xy))] = sampleVel(backtrace(p)) * exp(-DRAG * P.dt);
}

@compute @workgroup_size(8, 8)
fn advectForward(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let p = vec2f(id.xy) + 0.5;
  dst[index(vec2i(id.xy))] = sampleSrc(backtrace(p));
}

@compute @workgroup_size(8, 8)
fn advectCorrect(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let i = index(vec2i(id.xy));
  let p = vec2f(id.xy) + 0.5;
  let back = backtrace(p);
  let ahead = p + P.dt * sampleVel(p);
  var value = hat[i] + 0.5 * (src[i] - sampleHat(ahead));

  let t = taps(back);
  let s0 = src[t.i.x];
  let s1 = src[t.i.y];
  let s2 = src[t.i.z];
  let s3 = src[t.i.w];
  value = clamp(value, min(min(s0, s1), min(s2, s3)), max(max(s0, s1), max(s2, s3)));

  let fade = exp(-P.dt * vec2f(DENSITY_FADE, HEAT_FADE));
  dst[i] = max(value * fade, vec2f(0.0));
}

@group(0) @binding(2) var<storage, read_write> smoke: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> spin: array<f32>;

const VORTICITY = 9.0;
const BUOYANCY = 1.1;
const WEIGHT = 0.08;
const SOURCE = vec2f(0.5, 0.215);
const SOURCE_RADIUS = 0.011;
const HAND_PERIOD = 9.0;
const HAND_START = 5.0;
const HAND_SECONDS = 2.2;

@compute @workgroup_size(8, 8)
fn curl(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let c = vec2i(id.xy);
  let dvy = vel[index(c + vec2i(1, 0))].y - vel[index(c - vec2i(1, 0))].y;
  let dvx = vel[index(c + vec2i(0, 1))].x - vel[index(c - vec2i(0, 1))].x;
  spin[index(c)] = 0.5 * (dvy - dvx);
}

fn confinement(c: vec2i) -> vec2f {
  let g = 0.5 * vec2f(
    abs(spin[index(c + vec2i(1, 0))]) - abs(spin[index(c - vec2i(1, 0))]),
    abs(spin[index(c + vec2i(0, 1))]) - abs(spin[index(c - vec2i(0, 1))]));
  let n = g / (length(g) + 1e-5);
  return VORTICITY * vec2f(n.y, -n.x) * spin[index(c)];
}

fn hand(p: vec2f, height: f32) -> vec2f {
  let s = P.time - HAND_START;
  if (s < 0.0) { return vec2f(0.0); }
  let phase = s % HAND_PERIOD;
  if (phase > HAND_SECONDS) { return vec2f(0.0); }
  let side = select(-1.0, 1.0, (u32(s / HAND_PERIOD) & 1u) == 0u);
  let k = phase / HAND_SECONDS;
  let envelope = sin(3.14159 * k);
  let center = vec2f(0.5 * f32(P.grid.x) + side * height * (0.16 - 0.2 * k), height * (0.5 + 0.08 * k));
  let d = (p - center) / (0.13 * height);
  return vec2f(-side, 0.25) * 1.4 * height * envelope * envelope * exp(-dot(d, d));
}

fn pointerForce(p: vec2f, v: vec2f, height: f32) -> vec2f {
  let d = (p - P.pointer.xy) / (0.05 * height);
  return (P.pointer.zw - v) * 6.0 * exp(-dot(d, d));
}

fn inject(p: vec2f, height: f32, v: ptr<function, vec2f>, s: ptr<function, vec2f>) {
  let t = P.time;
  let sway = 0.006 * sin(t * 1.7) + 0.004 * sin(t * 4.3 + 1.0);
  let center = vec2f(0.5 * f32(P.grid.x) + sway * height, SOURCE.y * height);
  let d = (p - center) / (SOURCE_RADIUS * height);
  let w = exp(-dot(d, d));
  if (w < 1e-3) { return; }
  let puff = 0.65 + 0.35 * sin(t * 2.3) * sin(t * 0.71 + 2.0);
  *s += P.dt * w * vec2f(12.0 * puff, 6.0);
  *v += P.dt * w * height * vec2f(0.25 * sin(t * 3.1) + 0.15 * sin(t * 7.7), 1.0);
}

@compute @workgroup_size(8, 8)
fn forces(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let c = vec2i(id.xy);
  let i = index(c);
  let p = vec2f(id.xy) + 0.5;
  let height = f32(P.grid.y);
  var v = vel[i];
  var s = smoke[i];
  var f = confinement(c) + hand(p, height) + pointerForce(p, v, height);
  f.y += (BUOYANCY * s.y - WEIGHT * s.x) * height;
  v += P.dt * f;
  inject(p, height, &v, &s);
  vel[i] = v;
  smoke[i] = s;
}

@group(0) @binding(2) var<storage, read_write> div: array<f32>;
@group(0) @binding(3) var<storage, read> pressureIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> pressureOut: array<f32>;

fn flow(c: vec2i) -> vec2f {
  if (c.x < 0 || c.x >= i32(P.grid.x) || c.y < 0) { return vec2f(0.0); }
  return vel[index(c)];
}

fn pressure(c: vec2i, here: f32) -> f32 {
  if (c.y >= i32(P.grid.y)) { return 0.0; }
  if (c.x < 0 || c.x >= i32(P.grid.x) || c.y < 0) { return here; }
  return pressureIn[index(c)];
}

@compute @workgroup_size(8, 8)
fn divergence(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let c = vec2i(id.xy);
  let dx = flow(c + vec2i(1, 0)).x - flow(c - vec2i(1, 0)).x;
  let dy = flow(c + vec2i(0, 1)).y - flow(c - vec2i(0, 1)).y;
  div[index(c)] = 0.5 * (dx + dy);
}

@compute @workgroup_size(8, 8)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let c = vec2i(id.xy);
  let i = index(c);
  let here = pressureIn[i];
  let sum = pressure(c + vec2i(1, 0), here) + pressure(c - vec2i(1, 0), here)
          + pressure(c + vec2i(0, 1), here) + pressure(c - vec2i(0, 1), here);
  pressureOut[i] = 0.25 * (sum - div[i]);
}

@compute @workgroup_size(8, 8)
fn project(@builtin(global_invocation_id) id: vec3u) {
  if (!cell(id)) { return; }
  let c = vec2i(id.xy);
  let i = index(c);
  let here = pressureIn[i];
  let grad = 0.5 * vec2f(
    pressure(c + vec2i(1, 0), here) - pressure(c - vec2i(1, 0), here),
    pressure(c + vec2i(0, 1), here) - pressure(c - vec2i(0, 1), here));
  vel[i] -= grad;
}

@group(0) @binding(1) var<storage, read> smokeIn: array<vec2f>;

const PAPER = vec3f(0.925, 0.878, 0.784);
const WASH = vec3f(0.42, 0.45, 0.52);
const SUMI = vec3f(0.09, 0.09, 0.13);
const VERMILION = vec3f(0.78, 0.22, 0.13);
const EMBER = vec3f(0.95, 0.42, 0.14);
const TONES = 4.0;
const INK = 1.5;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn hash(p: vec2f) -> f32 {
  let q = fract(p * vec2f(0.1031, 0.1030));
  let r = q + dot(q, q.yx + 33.33);
  return fract((r.x + r.y) * r.x);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x);
  let b = mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x);
  return mix(a, b, u.y);
}

fn paper(uv: vec2f) -> f32 {
  let blot = 0.6 * noise(uv * 9.0) + 0.4 * noise(uv * 31.0);
  let fibre = noise(vec2f(uv.x * 420.0 + noise(uv * 40.0) * 6.0, uv.y * 60.0));
  let tooth = hash(floor(uv * 900.0));
  return 0.5 * blot + 0.3 * fibre + 0.2 * tooth;
}

fn density(c: vec2i) -> f32 {
  return smokeIn[index(c)].x;
}

fn catmullRom(t: f32) -> vec4f {
  let t2 = t * t;
  let t3 = t2 * t;
  return 0.5 * vec4f(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
}

fn bicubic(p: vec2f) -> f32 {
  let q = p - 0.5;
  let c = vec2i(floor(q));
  let wx = catmullRom(q.x - floor(q.x));
  let wy = catmullRom(q.y - floor(q.y));
  var sum = 0.0;
  for (var j = 0; j < 4; j++) {
    let row = wx.x * density(c + vec2i(-1, j - 1)) + wx.y * density(c + vec2i(0, j - 1))
            + wx.z * density(c + vec2i(1, j - 1)) + wx.w * density(c + vec2i(2, j - 1));
    sum += wy[j] * row;
  }
  return max(sum, 0.0);
}

fn burnerWidth(y: f32) -> f32 {
  if (y < 0.04 || y > 0.196) { return -1.0; }
  if (y < 0.064) { return mix(0.078, 0.058, (y - 0.04) / 0.024); }
  if (y < 0.132) {
    let k = (y - 0.064) / 0.068;
    return 0.047 - 0.014 * sin(3.14159 * k);
  }
  if (y < 0.15) { return 0.074; }
  return mix(0.058, 0.082, (y - 0.15) / 0.046);
}

fn carved(p: vec2f) -> bool {
  if (p.y > 0.074 && p.y < 0.122) {
    let zig = abs(fract(p.x * 36.0) - 0.5) * 0.028 + 0.086;
    if (abs(p.y - zig) < 0.0022) { return true; }
    if (abs(p.y - zig - 0.02) < 0.0022) { return true; }
  }
  if (p.y > 0.16 && p.y < 0.182) {
    let x = fract(p.x * 32.0 + 0.5) - 0.5;
    return abs(x) < 0.18 && abs(p.y - 0.171) < 0.006;
  }
  return abs(p.y - 0.064) < 0.0016 || abs(p.y - 0.15) < 0.0016;
}

fn burner(p: vec2f) -> f32 {
  let w = burnerWidth(p.y);
  if (abs(p.x) > w || carved(p)) { return 0.0; }
  return 1.0;
}

fn floorStroke(p: vec2f, grain: f32) -> f32 {
  let x = p.x / 0.34;
  let thick = 0.007 * (1.0 - x * x) + 0.001 * sin(p.x * 60.0);
  let dry = step(grain, 1.15 - abs(x));
  return select(0.0, dry, abs(x) < 1.0 && abs(p.y - 0.04 + 0.002 * sin(p.x * 13.0)) < thick);
}

fn ember(p: vec2f) -> f32 {
  let d = (p - vec2f(0.0, 0.2)) / vec2f(0.05, 0.009);
  return select(0.0, 1.0, dot(d, d) < 1.0);
}

fn seal(p: vec2f) -> f32 {
  let q = abs(p);
  if (max(q.x, q.y) > 0.034) { return 0.0; }
  let star = max(q.x, q.y) < 0.016 || q.x + q.y < 0.0226;
  let starInner = max(q.x, q.y) < 0.011 || q.x + q.y < 0.0156;
  let border = max(q.x, q.y) > 0.028;
  let cut = (star && !starInner) || (max(q.x, q.y) > 0.0265 && !border);
  return select(1.0, 0.0, cut);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = vec2f(pos.x - 0.5 * P.view.x, P.view.y - pos.y) / P.view.y;
  let grain = paper(uv);
  let g = vec2f(pos.x / P.view.x, 1.0 - pos.y / P.view.y) * vec2f(P.grid);

  let ink = 1.0 - exp(-INK * bicubic(g));
  let level = ink * TONES;
  let tone = clamp(floor(level + (grain - 0.5) * 0.2), 0.0, TONES) / TONES;
  let edge = abs(level - round(level)) / max(fwidth(level), 1e-4);
  let line = (1.0 - smoothstep(0.6, 1.6, edge)) * step(0.5, level) * step(0.2, grain);

  var color = PAPER * (0.93 + 0.1 * grain);
  color = mix(color, mix(WASH, SUMI, tone * tone), min(1.0, tone * 1.15));
  color = mix(color, SUMI, 0.85 * line);

  let press = step(0.18, grain);
  color = mix(color, SUMI, press * max(burner(uv), floorStroke(uv, grain)));
  color = mix(color, EMBER, ember(uv) * (0.8 + 0.2 * grain));
  let corner = vec2f(0.5 * P.view.x / P.view.y - 0.09, 0.09);
  color = mix(color, VERMILION, 0.9 * seal(uv - corner) * step(0.12, grain));

  let v = uv - vec2f(0.0, 0.5);
  color *= 1.0 - 0.18 * dot(v, v);
  return vec4f(color, 1.0);
}
