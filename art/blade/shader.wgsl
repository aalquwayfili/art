struct Frame {
  res: vec4f,
  eye: vec4f,
  look: vec4f,
  opts: vec4f,
}

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var traced: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

const PI = 3.14159265;
const TAU = 6.28318531;

const POMMEL_Y = 0.168;
const GRIP_Y0 = 0.203;
const GRIP_Y1 = 0.36;
const GUARD_Y = 0.382;
const BLADE_Y = 0.39;
const BLADE_LEN = 0.9;
const PITCH = 0.0066;
const BOX_LO = vec3f(-0.125, 0.128, -0.03);
const BOX_HI = vec3f(0.125, 1.295, 0.03);

const STEEL = 1.0;
const BRASS = 2.0;
const LEATHER = 3.0;

const KEY = vec3f(-0.6, 0.52, 0.6);
const STRIP = vec3f(0.86, 0.14, -0.49);
const RIM = vec3f(-0.84, 0.1, -0.53);
const TOP = vec3f(0.12, 1.0, 0.22);
const FILL = vec3f(0.15, 0.2, 1.0);

fn pcg3(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

fn rand3(p: vec2f, seed: u32) -> vec3f {
  return vec3f(pcg3(vec3u(bitcast<vec2u>(vec2i(p)), seed))) / 4294967295.0;
}

fn noise(p: vec2f, seed: u32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = rand3(i, seed).x;
  let b = rand3(i + vec2f(1.0, 0.0), seed).x;
  let c = rand3(i + vec2f(0.0, 1.0), seed).x;
  let d = rand3(i + vec2f(1.0, 1.0), seed).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p0: vec2f, seed: u32) -> f32 {
  var p = p0;
  var sum = 0.0;
  var amp = 0.5;
  for (var i = 0u; i < 4u; i++) {
    sum += amp * noise(p, seed + i);
    p = mat2x2f(1.6, 1.2, -1.2, 1.6) * p;
    amp *= 0.5;
  }
  return sum;
}

fn rotY(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn extrude(d2: f32, dz: f32, chamfer: f32) -> f32 {
  return max(max(d2, dz), (d2 + dz + chamfer) * 0.7071);
}

fn chamferRect(q0: vec2f, half: vec2f, chamfer: f32) -> f32 {
  let q = abs(q0) - half;
  return max(max(q.x, q.y), (q.x + q.y + chamfer) * 0.7071);
}

fn octagon(p0: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.9238795, 0.3826834, 0.4142136);
  var p = abs(p0);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= 2.0 * min(dot(vec2f(-k.x, k.y), p), 0.0) * vec2f(-k.x, k.y);
  p -= vec2f(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

fn bladeShape(s: f32) -> vec4f {
  let u = clamp((1.0 - s) / 0.15, 0.0, 1.0);
  let point = 1.0 - (1.0 - u) * (1.0 - u);
  let w = 0.0265 * (1.0 - 0.3 * s) * point;
  let h = 0.0036 * (1.0 - 0.5 * s) * mix(0.3, 1.0, point);
  let sharp = smoothstep(0.025, 0.06, s);
  return vec4f(w, h, w * mix(0.14, 0.44, sharp), mix(0.75 * h, 0.00018, sharp));
}

fn fullerDepth(s: f32) -> f32 {
  return 0.0011 * smoothstep(0.012, 0.05, s) * (1.0 - smoothstep(0.5, 0.63, s));
}

const FULLER_R = 0.03;

fn sdBlade(p: vec3f) -> f32 {
  let s = (p.y - BLADE_Y) / BLADE_LEN;
  let g = bladeShape(clamp(s, 0.0, 1.0));
  let q = vec2f(abs(p.x), abs(p.z));
  var d = q.y - (g.y - 3.5 * q.x * q.x);
  d = max(d, dot(q - vec2f(g.x, g.w), normalize(vec2f(g.y - g.w, g.z))));
  let m = 0.0011;
  let zm = g.w + (g.y - g.w) * m / g.z;
  d = max(d, dot(q - vec2f(g.x - 0.35 * m, g.w), normalize(vec2f(zm - g.w, 0.65 * m))));
  d = max(d, q.x - g.x);
  let dep = fullerDepth(s);
  if (dep > 0.0) {
    d = max(d, FULLER_R - length(q - vec2f(0.0, g.y + FULLER_R - dep)));
  }
  d = max(d, max(BLADE_Y - p.y, p.y - BLADE_Y - BLADE_LEN));
  return d * 0.8;
}

fn scroll(u: f32, v: f32) -> f32 {
  let cell = 0.0085;
  let i = floor(u / cell);
  let side = select(1.0, -1.0, (i32(i) & 1) != 0);
  let stem = abs(v - 0.0016 * sin(PI * u / cell)) * 0.8;
  let o = vec2f(u - (i + 0.62) * cell, (v - side * 0.0001) * side);
  let r = length(o);
  let a = 0.00026;
  let k = r / (TAU * a) - (atan2(o.y, o.x) + PI) / TAU;
  let curl = max(abs(k - round(k)) * TAU * a, r - 0.0021);
  return min(stem, curl);
}

fn engraving(p: vec3f) -> f32 {
  if (p.y > 0.3) {
    let x = abs(p.x);
    if (x < 0.021) {
      let border = abs(chamferRect(vec2f(x, p.y - GUARD_Y), vec2f(0.0168, 0.0112), 0.005));
      return min(border, scroll(x + 0.0042, p.y - GUARD_Y));
    }
    let lift = 0.013 * (x / 0.098) * (x / 0.098);
    return scroll(x - 0.021, p.y - GUARD_Y - lift) + max(0.0, x - 0.088) * 4.0;
  }
  let q = vec2f(p.x, p.y - POMMEL_Y);
  let r = length(q);
  let ray = (fract(atan2(q.y, q.x) / TAU * 8.0 + 0.5) - 0.5) * r * TAU / 8.0;
  return min(abs(r - 0.0109), max(abs(ray), abs(r - 0.0058) - 0.0022));
}

fn incise(d: f32, p: vec3f, face: f32) -> f32 {
  if (d > 0.0015 || face <= 0.0) { return d; }
  return d + 0.0002 * face * (1.0 - smoothstep(0.00012, 0.00032, engraving(p)));
}

fn sdGuard(p: vec3f, fine: bool) -> f32 {
  let L = 0.098;
  let x = clamp(p.x, -L, L) / L;
  let lift = 0.013 * x * x;
  let bar = max(chamferRect(vec2f(p.y - GUARD_Y - lift, p.z), vec2f(0.0058, 0.0078) * (1.0 - 0.22 * x * x), 0.0024),
                abs(p.x) - L);
  let e = vec3f(abs(p.x) - L - 0.003, p.y - GUARD_Y - 0.0142, p.z);
  let knob = max(length(e) - 0.0098, (abs(e.x) + abs(e.y) + abs(e.z)) * 0.57735 - 0.0086);
  let c = vec2f(abs(p.x), p.y - GUARD_Y);
  let face = max(max(c.x - 0.021, abs(c.y) - 0.0155), c.x * 0.6 + c.y * 0.8 - 0.019);
  let block = extrude(face, abs(p.z) - 0.0105, 0.0024);
  let d = smin(smin(bar, knob, 0.004), block, 0.0025);
  if (!fine) { return d; }
  return incise(d, p, smoothstep(0.0055, 0.0072, abs(p.z)));
}

fn sdGrip(p: vec3f, fine: bool) -> vec2f {
  let s = clamp((p.y - GRIP_Y0) / (GRIP_Y1 - GRIP_Y0), 0.0, 1.0);
  let r = vec2f(0.0142, 0.0114) * (1.0 + 0.1 * sin(PI * s));
  let core = (length(p.xz / r) - 1.0) * r.y;
  var cord = core - 0.4 * PITCH;
  if (fine) {
    let phase = (p.y - GRIP_Y0) / PITCH - atan2(p.z, p.x) / TAU;
    let f = fract(phase) * 2.0 - 1.0;
    let bulge = 0.84 + 0.16 * rand3(vec2f(floor(phase), 3.0), 7u).x + 0.12 * noise(vec2f(p.y / PITCH * 2.5, 0.5), 9u);
    cord = (core - 0.5 * PITCH * bulge * pow(max(1.0 - f * f, 0.0), 0.6)) * 0.6;
  }
  cord = max(cord, abs(p.y - 0.5 * (GRIP_Y0 + GRIP_Y1)) - 0.5 * (GRIP_Y1 - GRIP_Y0));
  let ring = (length(p.xz / vec2f(0.0166, 0.0138)) - 1.0) * 0.0138;
  let ferrule = min(extrude(ring, abs(p.y - GRIP_Y0) - 0.0058, 0.0016), extrude(ring, abs(p.y - GRIP_Y1) - 0.0058, 0.0016));
  return select(vec2f(cord, LEATHER), vec2f(ferrule, BRASS), ferrule < cord);
}

fn sdPommel(p: vec3f, fine: bool) -> f32 {
  let q = vec2f(p.x, p.y - POMMEL_Y);
  let wheel = extrude(octagon(q, 0.029), abs(p.z) - 0.0105, 0.0036);
  let boss = extrude(length(q) - 0.0148, abs(p.z) - 0.0136, 0.0018);
  let button = length(vec3f(p.x, (p.y - POMMEL_Y + 0.0305) * 1.3, p.z)) - 0.0056;
  let d = min(min(wheel, boss), button);
  if (!fine) { return d; }
  return incise(d, p, smoothstep(0.0128, 0.0134, abs(p.z)));
}

fn sdBox(p: vec3f, lo: vec3f, hi: vec3f) -> f32 {
  let q = abs(p - 0.5 * (lo + hi)) - 0.5 * (hi - lo);
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn scene(p: vec3f, fine: bool) -> vec2f {
  var best = vec2f(sdBlade(p), STEEL);
  if (sdBox(p, vec3f(-0.113, 0.364, -0.013), vec3f(0.113, 0.41, 0.013)) < best.x) {
    let g = sdGuard(p, fine);
    if (g < best.x) { best = vec2f(g, BRASS); }
  }
  if (sdBox(p, vec3f(-0.031, 0.13, -0.018), vec3f(0.031, 0.368, 0.018)) < best.x) {
    let g = sdGrip(p, fine);
    if (g.x < best.x) { best = g; }
    let m = sdPommel(p, fine);
    if (m < best.x) { best = vec2f(m, BRASS); }
  }
  return best;
}

fn map(p: vec3f) -> vec2f { return scene(p, true); }

fn normalAt(p: vec3f, eps: f32) -> vec3f {
  let k = vec2f(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * eps).x + k.yyx * map(p + k.yyx * eps).x +
                   k.yxy * map(p + k.yxy * eps).x + k.xxx * map(p + k.xxx * eps).x);
}

fn boxHit(ro: vec3f, rd: vec3f, margin: f32) -> vec2f {
  let inv = 1.0 / rd;
  let a = (BOX_LO - margin - ro) * inv;
  let b = (BOX_HI + margin - ro) * inv;
  let lo = min(a, b);
  let hi = max(a, b);
  return vec2f(max(max(lo.x, lo.y), max(lo.z, 0.0)), min(min(hi.x, hi.y), hi.z));
}

fn march(ro: vec3f, rd: vec3f, pix: f32) -> vec2f {
  let span = boxHit(ro, rd, 0.0);
  if (span.x >= span.y) { return vec2f(-1.0, 0.0); }
  var t = span.x;
  for (var i = 0; i < 200; i++) {
    let h = map(ro + rd * t);
    if (h.x < max(0.00004, 0.3 * pix * t)) { return vec2f(t, h.y); }
    t += h.x;
    if (t > span.y) { break; }
  }
  return vec2f(-1.0, 0.0);
}

fn softShadow(ro: vec3f, rd: vec3f, k: f32) -> f32 {
  let span = boxHit(ro, rd, 0.6);
  if (span.x >= span.y) { return 1.0; }
  var res = 1.0;
  var t = max(span.x, 0.002);
  let steps = i32(F.opts.z);
  for (var i = 0; i < steps; i++) {
    let h = scene(ro + rd * t, false).x;
    res = min(res, k * h / t);
    t += clamp(h, 0.003, 0.15);
    if (res < 0.002 || t > span.y) { break; }
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}

fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var occ = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = 0.0025 * f32(i * i);
    occ += w * (h - map(p + n * h).x);
    w *= 0.6;
  }
  return clamp(1.0 - 14.0 * occ, 0.0, 1.0);
}

fn softbox(d: vec3f, toward: vec3f, size: vec2f, soft: f32) -> f32 {
  let c = normalize(toward);
  let k = dot(d, c);
  if (k <= 0.0) { return 0.0; }
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), c));
  let up = cross(c, right);
  let q = vec2f(dot(d, right), dot(d, up)) / k;
  let edge = smoothstep(size + soft, size - soft, abs(q));
  let r = q / size;
  return edge.x * edge.y * (1.0 - 0.3 * dot(r, r)) * (0.7 + 0.3 * clamp(r.y, -1.0, 1.0));
}

fn backdrop(d: vec3f) -> vec3f {
  let glow = exp(-8.0 * d.x * d.x) * smoothstep(-0.1, 0.25, d.y) * (1.0 - smoothstep(0.1, 0.7, d.y));
  return vec3f(0.0065, 0.0063, 0.006) + vec3f(0.011, 0.0105, 0.0098) * glow;
}

fn env(d: vec3f, blur: f32) -> vec3f {
  var c = select(backdrop(d), vec3f(0.024, 0.022, 0.02) * (0.3 + 0.7 * exp(-30.0 * d.y * d.y)), d.y < 0.0);
  c += vec3f(2.6, 2.45, 2.2) * softbox(d, KEY, vec2f(0.5, 0.4), 0.08 + blur);
  c += vec3f(4.2, 4.4, 4.6) * softbox(d, STRIP, vec2f(0.055, 1.1), 0.02 + blur);
  c += vec3f(1.8, 1.8, 1.8) * softbox(d, RIM, vec2f(0.04, 1.0), 0.015 + blur);
  c += vec3f(1.0, 0.98, 0.95) * softbox(d, TOP, vec2f(0.55, 0.55), 0.15 + blur);
  c += vec3f(0.4, 0.4, 0.42) * softbox(d, FILL, vec2f(1.6, 0.8), 0.6 + blur);
  return c;
}

fn irradiance(n: vec3f, keyShadow: f32) -> vec3f {
  return vec3f(1.9, 1.8, 1.65) * max(dot(n, normalize(KEY)), 0.0) * keyShadow
       + vec3f(0.5, 0.52, 0.55) * max(dot(n, normalize(STRIP)), 0.0)
       + vec3f(0.2) * max(dot(n, normalize(RIM)), 0.0)
       + vec3f(0.7) * max(dot(n, normalize(TOP)), 0.0)
       + vec3f(0.12) * max(dot(n, normalize(FILL)), 0.0) + vec3f(0.015);
}

fn ward(n: vec3f, tang: vec3f, v: vec3f, ax: f32, ay: f32, f0: vec3f, count: i32, jitter: vec2f) -> vec3f {
  let b = cross(n, tang);
  let nv = max(dot(n, v), 1e-3);
  let blur = 0.5 * sqrt(ax * ay);
  var sum = vec3f(0.0);
  for (var i = 0; i < count; i++) {
    let u1 = max((f32(i) + jitter.x) / f32(count), 1e-5);
    let u2 = fract(f32(i) * 0.618034 + jitter.y);
    let phi = atan2(ay * sin(TAU * u2), ax * cos(TAU * u2));
    let cp = cos(phi);
    let sp = sin(phi);
    let tan2 = -log(u1) / (cp * cp / (ax * ax) + sp * sp / (ay * ay));
    let ch = inverseSqrt(1.0 + tan2);
    let sh = sqrt(1.0 - ch * ch);
    let h = normalize(tang * (cp * sh) + b * (sp * sh) + n * ch);
    let l = reflect(-v, h);
    let nl = dot(n, l);
    if (nl <= 0.0) { continue; }
    let hl = max(dot(h, l), 0.0);
    let fres = f0 + (1.0 - f0) * pow(1.0 - hl, 5.0);
    sum += fres * min(hl * ch * ch * ch * sqrt(nl / nv), 2.0) * env(l, blur);
  }
  return sum / f32(count);
}

fn layers(b: vec3f) -> f32 {
  var q = vec2f(b.x * 115.0, b.y * 15.0);
  q += 1.5 * vec2f(fbm(q * 0.55, 11u), fbm(q * 0.55 + 5.2, 15u));
  return 13.0 * fbm(q, 19u) + 15.0 * abs(b.z) / 0.0036;
}

fn scratches(uv: vec2f, fp: f32) -> f32 {
  var s = 0.0;
  for (var k = 0u; k < 2u; k++) {
    let cell = vec2f(0.006, 0.024) / f32(k + 1u);
    let c = floor(uv / cell);
    let r = rand3(c + vec2f(0.0, f32(k) * 977.0), 31u);
    let r2 = rand3(c + vec2f(5.0, f32(k) * 977.0), 37u);
    let ang = select((r.x - 0.5) * 0.35, r.x * PI, r2.z < 0.2);
    let dir = vec2f(sin(ang), cos(ang)) * cell.y * (0.15 + 0.3 * r2.x);
    let mid = (c + 0.3 + 0.4 * r.yz) * cell;
    let d = segment(uv, mid - dir, mid + dir);
    let w = max(0.00002, fp);
    s += (0.00002 / w) * (1.0 - smoothstep(0.0, w, d)) * (0.4 + 0.6 * r2.y);
  }
  return clamp(s, 0.0, 1.0);
}

fn shadeSword(pl: vec3f, n: vec3f, v: vec3f, mat: f32, fp: f32, jitter: vec2f) -> vec3f {
  let turn = F.look.w;
  let nl = rotY(n, -turn);
  let ao = occlusion(pl, nl);
  let samples = i32(F.opts.y);
  let up = vec3f(0.0, 1.0, 0.0);

  if (mat == STEEL) {
    let s = (pl.y - BLADE_Y) / BLADE_LEN;
    let g = bladeShape(clamp(s, 0.0, 1.0));
    let q = vec2f(abs(pl.x), abs(pl.z));
    let faceD = q.y - (g.y - 3.5 * q.x * q.x);
    let bevelD = dot(q - vec2f(g.x, g.w), normalize(vec2f(g.y - g.w, g.z)));
    let bevel = smoothstep(-0.00015, 0.00015, bevelD - faceD);
    let honed = step(g.x - 0.0007, q.x);

    let e = 0.0002;
    let L = layers(pl);
    let grad = vec3f(layers(pl + vec3f(e, 0.0, 0.0)), layers(pl + vec3f(0.0, e, 0.0)), layers(pl + vec3f(0.0, 0.0, e))) - L;
    let perPixel = length(grad - nl * dot(grad, nl)) / e * fp;
    let fade = 1.0 - smoothstep(0.15, 0.6, perPixel);
    let bright = mix(0.5, smoothstep(0.2, 0.8, 0.5 + 0.5 * cos(TAU * L)), fade);
    let f0 = mix(vec3f(0.38, 0.38, 0.39), vec3f(0.66, 0.66, 0.67), bright);

    var ax = mix(mix(0.035, 0.12, bevel), 0.03, honed);
    var ay = mix(mix(0.11, 0.035, bevel), 0.03, honed);
    let matte = (1.0 - bright) * (1.0 - honed);
    ax = mix(ax, 0.22, matte);
    ay = mix(ay, 0.22, matte);
    let dep = fullerDepth(s);
    let fuller = (1.0 - bevel) * (1.0 - smoothstep(0.8, 1.0, q.x / sqrt(max(2.0 * FULLER_R * dep - dep * dep, 1e-9))));
    ax = mix(ax, 0.09, fuller);
    ay = mix(ay, 0.06, fuller);
    let sc = scratches(vec2f(pl.x, pl.y), fp);
    ax = mix(ax, 0.35, sc);
    ay = mix(ay, 0.35, sc);
    let tang = normalize(up - n * n.y);
    return ward(n, tang, v, ax, ay, f0, samples, jitter) * mix(0.35, 1.0, ao);
  }

  if (mat == BRASS) {
    let groove = 1.0 - smoothstep(0.0001, 0.0004, engraving(pl));
    let patina = clamp(0.25 + 0.9 * (1.0 - ao) + 0.8 * groove, 0.0, 1.0);
    let tang = normalize(cross(n, vec3f(0.3, 0.2, 1.0)));
    let wear = 0.85 + 0.15 * noise(pl.xy * 700.0, 41u);
    let spec = ward(n, tang, v, 0.17, 0.17, vec3f(0.78, 0.58, 0.32) * wear, samples, jitter);
    let diffuse = vec3f(0.05, 0.035, 0.02) * irradiance(n, 1.0) / PI;
    return mix(spec, diffuse, 0.75 * patina) * mix(0.3, 1.0, ao);
  }

  let phase = (pl.y - GRIP_Y0) / PITCH - atan2(pl.z, pl.x) / TAU;
  let f = fract(phase) * 2.0 - 1.0;
  let crest = 1.0 - f * f;
  let grain = noise(vec2f(phase * 7.0, pl.y * 3000.0), 51u);
  let albedo = vec3f(0.06, 0.04, 0.03) * mix(0.5, 1.2, crest) * (0.75 + 0.5 * grain);
  let keyShadow = softShadow(pl + nl * 0.0006, rotY(normalize(KEY), -turn), 5.0);
  let diffuse = albedo * irradiance(n, keyShadow) / PI;
  let spec = ward(n, normalize(up - n * n.y), v, 0.32, 0.25, vec3f(0.04), max(samples / 2, 2), jitter);
  return (diffuse + spec * mix(0.4, 1.0, crest)) * ao;
}

fn shadeFloor(p: vec3f, rd: vec3f, t: f32) -> vec3f {
  let turn = F.look.w;
  let pl = rotY(p, -turn);
  let key = normalize(KEY);
  let top = normalize(TOP);
  let shKey = softShadow(pl, rotY(key, -turn), 4.0);
  let shTop = softShadow(pl, rotY(top, -turn), 2.5);
  let pool = exp(-dot(p.xz - vec2f(-0.15, 0.1), p.xz - vec2f(-0.15, 0.1)) * 0.7);
  let light = vec3f(1.9, 1.8, 1.65) * key.y * shKey + vec3f(0.7) * top.y * shTop;
  let c = vec3f(0.1, 0.095, 0.09) * light * pool / PI;
  return mix(backdrop(rd), c + backdrop(rd), exp(-0.15 * max(t - 2.5, 0.0)));
}

fn render(px: vec2f, jitter: vec2f) -> vec3f {
  let res = F.res.xy;
  let ndc = vec2f(2.0 * px.x / res.x - 1.0, 1.0 - 2.0 * px.y / res.y);
  let fw = normalize(F.look.xyz - F.eye.xyz);
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fw);
  let rd = normalize(fw + F.eye.w * (ndc.x * res.x / res.y * rt + ndc.y * up));
  let ro = F.eye.xyz;
  let pix = 2.0 * F.eye.w / res.y;
  let turn = F.look.w;

  let lro = rotY(ro, -turn);
  let lrd = rotY(rd, -turn);
  let hit = march(lro, lrd, pix);
  if (hit.x > 0.0) {
    let pl = lro + lrd * hit.x;
    let n = rotY(normalAt(pl, clamp(0.25 * pix * hit.x, 0.00004, 0.00025)), turn);
    return shadeSword(pl, n, -rd, hit.y, pix * hit.x, jitter);
  }
  if (rd.y < 0.0) {
    let t = -ro.y / rd.y;
    return shadeFloor(ro + rd * t, rd, t);
  }
  return backdrop(rd);
}

@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fsTrace(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let n = i32(F.opts.x);
  var sum = vec3f(0.0);
  for (var j = 0; j < n * n; j++) {
    let o = (vec2f(f32(j % n), f32(j / n)) + 0.5) / f32(n);
    let jitter = rand3(floor(frag.xy) * 4.0 + o * 4.0, 61u).xy;
    sum += render(floor(frag.xy) + o, jitter);
  }
  return vec4f(sum / f32(n * n), 1.0);
}

@fragment
fn fsPresent(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = frag.xy / F.res.zw;
  var c = textureSample(traced, linearSampler, uv).rgb * 1.6;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
  let r = (uv - 0.5) * vec2f(F.res.z / F.res.w, 1.0);
  c *= 1.0 - 0.35 * smoothstep(0.35, 1.0, length(r));
  c = pow(c, vec3f(1.0 / 2.2));
  let grain = rand3(floor(frag.xy) + vec2f(0.0, floor(F.opts.w * 24.0) * 1931.0), 71u).x - 0.5;
  return vec4f(c + grain * 0.012, 1.0);
}
