const PI = 3.14159265;

@group(0) @binding(0) var noiseOut: texture_storage_3d<rgba8unorm, write>;

fn pcg3(v: vec3u) -> vec3u {
  var x = v * 1664525u + 1013904223u;
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  x ^= x >> vec3u(16u);
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  return x;
}

fn cellRand(c: vec3i, period: i32) -> vec3f {
  let w = vec3u((c % period + period) % period) + vec3u(u32(period) * 7919u);
  return vec3f(pcg3(w)) / 4294967296.0;
}

fn gradNoise(p: vec3f, period: i32) -> f32 {
  let i = vec3i(floor(p));
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  var v: array<f32, 8>;
  for (var k = 0; k < 8; k++) {
    let o = vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    v[k] = dot(cellRand(i + o, period) * 2.0 - 1.0, f - vec3f(o));
  }
  return mix(mix(mix(v[0], v[1], u.x), mix(v[2], v[3], u.x), u.y),
             mix(mix(v[4], v[5], u.x), mix(v[6], v[7], u.x), u.y), u.z);
}

fn worley(p: vec3f, period: i32) -> f32 {
  let i = vec3i(floor(p));
  let f = fract(p);
  var d = 1.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let o = vec3i(x, y, z);
        let r = vec3f(o) + cellRand(i + o, period) - f;
        d = min(d, dot(r, r));
      }
    }
  }
  return sqrt(d);
}

fn worleyFbm(uvw: vec3f, freq: i32) -> f32 {
  return (1.0 - worley(uvw * f32(freq), freq)) * 0.625
       + (1.0 - worley(uvw * f32(freq * 2), freq * 2)) * 0.25
       + (1.0 - worley(uvw * f32(freq * 4), freq * 4)) * 0.125;
}

fn remap(x: f32, a: f32, b: f32, c: f32, d: f32) -> f32 {
  return c + (x - a) / (b - a) * (d - c);
}

@compute @workgroup_size(4, 4, 4)
fn buildNoise(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(noiseOut);
  if (any(id >= size)) { return; }
  let uvw = (vec3f(id) + 0.5) / f32(size.x);
  var perlin = 0.0;
  var amp = 1.0;
  var freq = 4;
  for (var o = 0; o < 4; o++) {
    perlin += amp * gradNoise(uvw * f32(freq), freq);
    amp *= 0.5;
    freq *= 2;
  }
  perlin = clamp(perlin * 0.6 + 0.5, 0.0, 1.0);
  let w4 = worleyFbm(uvw, 4);
  let perlinWorley = clamp(remap(perlin, w4 - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  textureStore(noiseOut, id, vec4f(perlinWorley, w4, worleyFbm(uvw, 8), worleyFbm(uvw, 16)));
}

struct Cone { a: vec4f, b: vec4f }
struct Panel { a: vec4f, b: vec4f, c: vec4f, cut: vec4f, n: vec4f }
struct Group { sphere: vec4f, range: vec4f, blend: vec4f }

struct Frame {
  camPos: vec3f, time: f32,
  camRight: vec3f, tanX: f32,
  camUp: vec3f, tanY: f32,
  camFwd: vec3f, pixelAngle: f32,
  sunDir: vec3f, phase: f32,
  seaOffset: vec3f, seaSteps: f32,
  mistOffset: vec3f, mistSteps: f32,
  detailOffset: vec3f, dragonSteps: f32,
  sunUv: vec2f, size: vec2f,
  canvas: vec2f, raySamples: f32, cirrusOffset: f32,
  bound: vec4f,
  groups: array<Group, 6>,
  cones: array<Cone, 80>,
  panels: array<Panel, 12>,
}

@group(0) @binding(1) var<uniform> frame: Frame;
@group(0) @binding(2) var noiseTex: texture_3d<f32>;
@group(0) @binding(3) var noiseSampler: sampler;
@group(0) @binding(4) var sceneOut: texture_storage_2d<rgba16float, write>;

const SUN_LIGHT = vec3f(1.0, 0.68, 0.46) * 5.0;
const SEA_BASE = -900.0;
const SEA_TOP = -240.0;
const SEA_SCALE = vec3f(1.0 / 3600.0, 1.0 / 1600.0, 1.0 / 4400.0);
const SEA_SIGMA = 0.05;
const MIST_BASE = -45.0;
const MIST_TOP = 45.0;
const MIST_SCALE = vec3f(1.0 / 520.0, 1.0 / 260.0, 1.0 / 640.0);
const MIST_SIGMA = 0.03;
const MIST_FAR = 1200.0;
const MEMBRANE = 0.06;

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn hash2(p: vec2f) -> f32 {
  let q = vec2u(vec2i(floor(p)) + vec2i(1 << 20));
  return hash(q.x * 1973u + q.y * 9277u);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm2(p: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    s += a * vnoise(q);
    q = q * 2.03 + vec2f(17.1, 9.3);
    a *= 0.5;
  }
  return s / 0.9375;
}

fn noise3(p: vec3f) -> vec4f {
  return textureSampleLevel(noiseTex, noiseSampler, p, 0.0);
}

fn hg(mu: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

fn skyColor(rd: vec3f) -> vec3f {
  let mu = dot(rd, frame.sunDir);
  let e = max(rd.y, 0.0);
  let zenith = vec3f(0.07, 0.09, 0.16);
  let horizon = vec3f(0.5, 0.48, 0.53);
  var c = mix(horizon, zenith, pow(e, 0.55));
  let toward = pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 5.0);
  c = mix(c, vec3f(1.05, 0.64, 0.4), toward * exp(-e * 7.0) * 0.9);
  c += SUN_LIGHT * (0.012 * pow(max(mu, 0.0), 8.0) + 0.05 * pow(max(mu, 0.0), 180.0));
  return c;
}

fn fogColor(rd: vec3f) -> vec3f {
  return skyColor(normalize(vec3f(rd.x, 0.015, rd.z))) * 0.92;
}

fn fogAmount(t: f32) -> f32 {
  return 1.0 - exp(-t / 26000.0);
}

fn seaDensity(p: vec3f, detail: bool) -> f32 {
  let h = (p.y - SEA_BASE) / (SEA_TOP - SEA_BASE);
  if (h <= 0.0 || h >= 1.0) { return 0.0; }
  let n = noise3(p * SEA_SCALE + frame.seaOffset);
  let fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  let shape = remap(n.r, fbm - 1.0, 1.0, 0.0, 1.0);
  let cover = mix(0.4, 0.72, fbm2(p.xz / 5200.0 + vec2f(3.0, 7.0)));
  let profile = smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.35, h);
  var d = remap(shape * profile, 1.0 - cover, 1.0, 0.0, 1.0) * cover;
  if (detail && d > 0.0 && length(p - frame.camPos) < 2500.0) {
    let e = noise3(p / 900.0 + frame.detailOffset);
    let wisp = e.g * 0.7 + e.b * 0.3;
    d = remap(d, wisp * 0.25, 1.0, 0.0, 1.0);
  }
  return max(d, 0.0);
}

fn mistDensity(p: vec3f, detail: bool) -> f32 {
  let h = (p.y - MIST_BASE) / (MIST_TOP - MIST_BASE);
  if (h <= 0.0 || h >= 1.0) { return 0.0; }
  let r = length(p.xz - frame.camPos.xz);
  let reach = smoothstep(30.0, 90.0, r) * (1.0 - smoothstep(350.0, MIST_FAR, r));
  if (reach <= 0.0) { return 0.0; }
  let n = noise3(p * MIST_SCALE + frame.mistOffset);
  let fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  let shape = remap(n.r, fbm - 1.0, 1.0, 0.0, 1.0);
  let profile = smoothstep(0.0, 0.3, h) * smoothstep(1.0, 0.4, h);
  var d = smoothstep(0.58, 0.88, shape * profile + (n.g - 0.5) * 0.9) * 0.45 * reach;
  if (detail && d > 0.0) {
    let e = noise3(p / 95.0 + frame.detailOffset * 2.0);
    let wisp = e.g * 0.625 + e.b * 0.25 + e.a * 0.125;
    d = remap(d, wisp * 0.5, 1.0, 0.0, 1.0);
  }
  return max(d, 0.0);
}

fn density(p: vec3f, sea: bool, detail: bool) -> f32 {
  if (sea) { return seaDensity(p, detail); }
  return mistDensity(p, detail);
}

fn cloudLight(tau: f32, mu: f32) -> f32 {
  var s = 0.0;
  var a = 1.0;
  var b = 1.0;
  var c = 1.0;
  for (var i = 0; i < 3; i++) {
    s += b * mix(hg(mu, 0.72 * c), hg(mu, -0.2 * c), 0.28) * exp(-tau * a);
    a *= 0.3;
    b *= 0.3;
    c *= 0.5;
  }
  return s;
}

fn marchCloud(ro: vec3f, rd: vec3f, t0: f32, t1: f32, sea: bool, steps: i32, jitter: f32) -> vec4f {
  var scatter = vec3f(0.0);
  var trans = 1.0;
  let mu = dot(rd, frame.sunDir);
  let sigma = select(MIST_SIGMA, SEA_SIGMA, sea);
  let taps = select(vec2f(12.0, 60.0), vec2f(60.0, 260.0), sea);
  let fog = fogColor(rd);
  var dt = select(3.0, clamp(t0 * 0.005, 8.0, 60.0), sea);
  var t = t0;
  for (var i = 0; i < steps * 2; i++) {
    if (t >= t1 || trans < 0.02) { break; }
    let seg = min(dt, t1 - t);
    let p = ro + rd * (t + seg * jitter);
    let d = density(p, sea, true);
    if (d > 0.002) {
      let d1 = density(p + frame.sunDir * taps.x, sea, false);
      let d2 = density(p + frame.sunDir * taps.y, sea, false);
      let tau = sigma * (0.5 * (d + d1) * taps.x + 0.5 * (d1 + d2) * (taps.y - taps.x));
      var h = 0.0;
      if (sea) { h = (p.y - SEA_BASE) / (SEA_TOP - SEA_BASE); } else { h = (p.y - MIST_BASE) / (MIST_TOP - MIST_BASE); }
      let powder = mix(1.0, 1.0 - exp(-d * 12.0), 0.5 - 0.5 * mu);
      let ambient = mix(vec3f(0.025, 0.03, 0.045), vec3f(0.1, 0.11, 0.15), h * h);
      let light = SUN_LIGHT * cloudLight(tau, mu) * powder + ambient;
      let a = 1.0 - exp(-sigma * d * seg);
      scatter += trans * a * mix(light, fog, fogAmount(t));
      trans *= 1.0 - a;
    }
    t += seg;
    dt = select(max(dt, (t - t0) * 0.07), max(dt, t * 0.06), sea);
  }
  return vec4f(scatter, trans);
}

fn mistShadow(p: vec3f) -> f32 {
  let s = frame.sunDir;
  let tau = mistDensity(p + s * 6.0, false) * 12.0 + mistDensity(p + s * 25.0, false) * 30.0 + mistDensity(p + s * 70.0, false) * 60.0;
  return exp(-MIST_SIGMA * tau);
}

fn hash1(x: f32) -> f32 {
  return hash(u32(i32(x) + 1000000));
}

fn ridgeLine(x: f32) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = x;
  for (var i = 0; i < 4; i++) {
    let j = floor(q);
    let f = q - j;
    let n = mix(hash1(j), hash1(j + 1.0), f * f * (3.0 - 2.0 * f));
    s += a * (1.0 - abs(n * 2.0 - 1.0));
    q *= 2.07;
    a *= 0.48;
  }
  return s;
}

struct Peak { t: f32, color: vec3f }

fn peaks(ro: vec3f, rd: vec3f) -> Peak {
  let az = atan2(rd.x, -rd.z);
  let horiz = max(length(rd.xz), 1e-4);
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let dist = 9000.0 * (1.0 + fi * 0.85);
    let t = dist / horiz;
    let y = ro.y + rd.y * t;
    let rl = ridgeLine(az * (5.0 + fi * 2.0) + fi * 13.7 + 3.0);
    let top = SEA_TOP - 350.0 + (1500.0 + fi * 900.0) * pow(clamp(rl * 1.1 - 0.05, 0.0, 1.0), 3.0);
    if (y < top) {
      let below = top - y;
      let gully = vnoise(vec2f(az * dist / 45.0, y / 400.0)) * 0.6 + vnoise(vec2f(az * dist / 15.0, y / 150.0)) * 0.4;
      var c = vec3f(0.07, 0.075, 0.095) + vec3f(0.08, 0.09, 0.11) * smoothstep(0.0, 400.0, below);
      c *= 0.75 + 0.5 * gully;
      c += vec3f(0.06, 0.065, 0.08) * smoothstep(0.55, 0.8, gully) * smoothstep(500.0, 50.0, below);
      c += SUN_LIGHT * 0.06 * exp(-below / (dist * 0.001));
      return Peak(t, mix(c, fogColor(rd), min(fogAmount(t) * 2.2 + 0.2, 0.95)));
    }
  }
  return Peak(-1.0, vec3f(0.0));
}

fn cirrus(ro: vec3f, rd: vec3f, sky: vec3f) -> vec3f {
  if (rd.y <= 0.01) { return sky; }
  let t = (4500.0 - ro.y) / rd.y;
  let q = ro.xz + rd.xz * t;
  let n = noise3(vec3f(q.x / 22000.0 + frame.cirrusOffset, 0.37, q.y / 14000.0));
  let streak = smoothstep(0.6, 0.9, n.r * 0.7 + n.b * 0.3) * (1.0 - smoothstep(20000.0, 70000.0, t));
  let mu = dot(rd, frame.sunDir);
  let lit = SUN_LIGHT * (0.05 + 0.6 * hg(mu, 0.6)) * vec3f(1.0, 0.8, 0.8) + vec3f(0.14, 0.14, 0.18);
  return mix(sky, lit, streak * 0.35);
}

fn dot2(v: vec3f) -> f32 { return dot(v, v); }

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

fn roundCone(p: vec3f, a: vec3f, b: vec3f, r1: f32, r2: f32) -> f32 {
  let ba = b - a;
  let l2 = dot(ba, ba);
  let rr = r1 - r2;
  let a2 = l2 - rr * rr;
  let il2 = 1.0 / l2;
  let pa = p - a;
  let y = dot(pa, ba);
  let z = y - l2;
  let x2 = dot2(pa * l2 - ba * y);
  let y2 = y * y * l2;
  let z2 = z * z * l2;
  let k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) { return sqrt(x2 + z2) * il2 - r2; }
  if (sign(y) * a2 * y2 < k) { return sqrt(x2 + y2) * il2 - r1; }
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

fn triangle(p: vec3f, a: vec3f, b: vec3f, c: vec3f) -> f32 {
  let ba = b - a; let pa = p - a;
  let cb = c - b; let pb = p - b;
  let ac = a - c; let pc = p - c;
  let nor = cross(ba, ac);
  if (sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc)) < 2.0) {
    return sqrt(min(min(dot2(ba * clamp(dot(ba, pa) / dot2(ba), 0.0, 1.0) - pa),
                        dot2(cb * clamp(dot(cb, pb) / dot2(cb), 0.0, 1.0) - pb)),
                    dot2(ac * clamp(dot(ac, pc) / dot2(ac), 0.0, 1.0) - pc)));
  }
  return sqrt(dot(nor, pa) * dot(nor, pa) / dot2(nor));
}

fn panelSdf(p: vec3f, i: u32) -> f32 {
  let pn = frame.panels[i];
  var d = triangle(p, pn.a.xyz, pn.b.xyz, pn.c.xyz) - MEMBRANE;
  if (pn.cut.w > 0.0) {
    var v = p - pn.cut.xyz;
    v -= pn.n.xyz * dot(v, pn.n.xyz);
    d = max(d, pn.cut.w - length(v));
  }
  return d;
}

fn dragonSdf(p: vec3f) -> f32 {
  var d = 1e9;
  for (var g = 0u; g < 6u; g++) {
    let grp = frame.groups[g];
    let k = grp.blend.x;
    if (length(p - grp.sphere.xyz) - grp.sphere.w > d + k) { continue; }
    for (var i = u32(grp.range.x); i < u32(grp.range.y); i++) {
      let c = frame.cones[i];
      d = smin(d, roundCone(p, c.a.xyz, c.b.xyz, c.a.w, c.b.w), k);
    }
    for (var i = u32(grp.range.z); i < u32(grp.range.w); i++) {
      d = min(d, panelSdf(p, i));
    }
  }
  return d;
}

fn wingParts(p: vec3f) -> vec2f {
  var r = vec2f(1e9);
  for (var g = 4u; g < 6u; g++) {
    let grp = frame.groups[g];
    for (var i = u32(grp.range.x); i < u32(grp.range.y); i++) {
      let c = frame.cones[i];
      r.x = min(r.x, roundCone(p, c.a.xyz, c.b.xyz, c.a.w, c.b.w));
    }
    for (var i = u32(grp.range.z); i < u32(grp.range.w); i++) {
      r.y = min(r.y, panelSdf(p, i));
    }
  }
  return r;
}

fn dragonNormal(p: vec3f, h: f32) -> vec3f {
  let k = vec2f(1.0, -1.0);
  return normalize(k.xyy * dragonSdf(p + k.xyy * h) + k.yyx * dragonSdf(p + k.yyx * h)
                 + k.yxy * dragonSdf(p + k.yxy * h) + k.xxx * dragonSdf(p + k.xxx * h));
}

struct Hit { t: f32, cover: f32 }

fn traceDragon(ro: vec3f, rd: vec3f) -> Hit {
  let oc = ro - frame.bound.xyz;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - frame.bound.w * frame.bound.w;
  let disc = b * b - c;
  if (disc <= 0.0) { return Hit(-1.0, 0.0); }
  let tEnd = -b + sqrt(disc);
  var t = max(-b - sqrt(disc), 0.1);
  var best = 1e9;
  var bestT = -1.0;
  let steps = i32(frame.dragonSteps);
  for (var i = 0; i < steps; i++) {
    let d = dragonSdf(ro + rd * t);
    let px = t * frame.pixelAngle;
    let ratio = d / px;
    if (ratio < best) { best = ratio; bestT = t; }
    if (ratio < 0.25) { return Hit(t, 1.0); }
    t += d * 0.9;
    if (t > tEnd) { break; }
  }
  return Hit(bestT, 1.0 - smoothstep(0.25, 1.1, best));
}

fn shadeDragon(p: vec3f, rd: vec3f, t: f32) -> vec3f {
  let px = t * frame.pixelAngle;
  let n = dragonNormal(p, max(px * 0.5, 0.02));
  let sun = frame.sunDir;
  let lit = SUN_LIGHT * mistShadow(p);
  let parts = wingParts(p);
  let toEye = -rd;
  let facing = n * sign(dot(n, toEye) + 1e-4);

  let sky = vec3f(0.14, 0.15, 0.2) * (0.55 + 0.45 * n.y);
  let below = vec3f(0.16, 0.14, 0.15) * (0.5 - 0.5 * n.y);
  let rim = pow(1.0 - clamp(dot(facing, toEye), 0.0, 1.0), 3.0) * pow(max(dot(rd, sun), 0.0), 6.0) * clamp(dot(n, sun) + 0.6, 0.0, 1.0);

  if (parts.y < parts.x && parts.x > 0.12 && parts.y < px + 0.08) {
    let e = noise3(p / 18.0);
    let thin = smoothstep(0.2, 2.2, parts.x) * smoothstep(0.25, 0.75, e.g);
    let back = clamp(-dot(facing, sun), 0.0, 1.0);
    let through = lit * vec3f(0.85, 0.42, 0.26) * (0.025 * back + 0.06 * hg(dot(rd, sun), 0.85)) * (0.25 + 0.75 * thin) * smoothstep(0.12, 0.6, parts.x);
    let front = lit * vec3f(0.3, 0.22, 0.2) * max(dot(facing, sun), 0.0) * 0.1;
    return vec3f(0.05, 0.04, 0.04) * (sky + below) * 3.0 + through + front;
  }
  let crease = smoothstep(0.05, 0.4, abs(parts.y));
  let albedo = vec3f(0.07, 0.07, 0.075);
  let diffuse = lit * max(dot(n, sun), 0.0) * crease;
  return albedo * (sky * 2.2 + below * 2.0 + diffuse) + lit * vec3f(1.0, 0.8, 0.65) * rim * crease * 0.6;
}

fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@compute @workgroup_size(8, 8)
fn renderScene(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= frame.size.x || f32(id.y) >= frame.size.y) { return; }
  let ndc = vec2f((f32(id.x) + 0.5) / frame.size.x * 2.0 - 1.0, 1.0 - (f32(id.y) + 0.5) / frame.size.y * 2.0);
  let ro = frame.camPos;
  let rd = normalize(frame.camFwd + frame.camRight * ndc.x * frame.tanX + frame.camUp * ndc.y * frame.tanY);
  let jitter = 0.5 + 0.4 * (hash(id.x * 7919u + id.y * 104729u + u32(frame.time * 60.0) * 15485863u) - 0.5);
  let mu = dot(rd, frame.sunDir);

  var bg = cirrus(ro, rd, skyColor(rd));
  let disc = smoothstep(0.99986, 0.99997, mu);
  bg += SUN_LIGHT * 1.6 * disc;
  var mask = pow(max(mu, 0.0), 300.0) * 1.5;
  var tFar = 1e9;
  let peak = peaks(ro, rd);
  if (peak.t > 0.0) { bg = peak.color; mask = 0.0; tFar = peak.t; }

  if (rd.y < 0.0) {
    let t0 = (SEA_TOP - ro.y) / rd.y;
    let tBase = (SEA_BASE - ro.y) / rd.y;
    if (t0 < tFar) {
      if (tBase < tFar) { bg = mix(vec3f(0.05, 0.055, 0.075), fogColor(rd), fogAmount(tBase)); mask = 0.0; }
      let sea = marchCloud(ro, rd, t0, min(tBase, min(tFar, 90000.0)), true, i32(frame.seaSteps), jitter);
      bg = sea.rgb + sea.a * bg;
      mask *= sea.a;
    }
  }

  let hit = traceDragon(ro, rd);
  var tIn = 0.0;
  var tOut = MIST_FAR;
  if (abs(rd.y) > 1e-4) {
    let ta = (MIST_BASE - ro.y) / rd.y;
    let tb = (MIST_TOP - ro.y) / rd.y;
    tIn = max(min(ta, tb), 0.0);
    tOut = min(max(ta, tb), MIST_FAR);
  }
  let tHit = select(1e9, hit.t, hit.cover > 0.0);
  let steps = i32(frame.mistSteps);
  var front = vec4f(0.0, 0.0, 0.0, 1.0);
  var back = vec4f(0.0, 0.0, 0.0, 1.0);
  if (tOut > tIn) {
    front = marchCloud(ro, rd, tIn, min(tOut, tHit), false, steps, 0.5);
    if (tHit < tOut) { back = marchCloud(ro, rd, max(tIn, tHit), tOut, false, steps / 2, 0.5); }
  }
  var color = front.rgb + front.a * (back.rgb + back.a * bg);
  mask *= front.a * back.a;
  if (hit.cover > 0.0) {
    let dragon = shadeDragon(ro + rd * hit.t, rd, hit.t);
    color = mix(color, front.rgb + front.a * mix(dragon, fogColor(rd), fogAmount(hit.t)), hit.cover);
    mask *= 1.0 - hit.cover;
  }
  textureStore(sceneOut, id.xy, vec4f(color, mask));
}

@group(0) @binding(5) var scene: texture_2d<f32>;
@group(0) @binding(6) var sceneSampler: sampler;

@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fsPresent(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / frame.canvas;
  var color = textureSampleLevel(scene, sceneSampler, uv, 0.0).rgb;

  let n = i32(frame.raySamples);
  let delta = (frame.sunUv - uv) / f32(n) * 0.9;
  var coord = uv + delta * ign(fc.xy);
  var weight = 1.0;
  var shafts = 0.0;
  for (var i = 0; i < n; i++) {
    shafts += textureSampleLevel(scene, sceneSampler, coord, 0.0).a * weight;
    weight *= 0.965;
    coord += delta;
  }
  let away = smoothstep(0.02, 0.12, length((uv - frame.sunUv) * vec2f(frame.canvas.x / frame.canvas.y, 1.0)));
  color += SUN_LIGHT * vec3f(1.0, 0.85, 0.72) * shafts / f32(n) * 0.12 * away;

  var c = 1.0 - exp(-color * 0.85);
  c = mix(vec3f(dot(c, vec3f(0.2126, 0.7152, 0.0722))), c, 0.86);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
  let v = (uv - 0.5) * vec2f(frame.canvas.x / frame.canvas.y, 1.0);
  c *= 1.0 - 0.22 * dot(v, v);
  c = pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2));
  let grain = ign(fc.xy + fract(frame.time * 3.7) * 97.0) + ign(fc.yx * 1.31 + 11.0) - 1.0;
  return vec4f(c + grain * 0.012, 1.0);
}
