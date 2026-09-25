struct Params {
  grid: vec3u,
  count: u32,
  dx: f32,
  invDx: f32,
  dt: f32,
  pVol: f32,
  mu: f32,
  lambda: f32,
  alpha: f32,
  lz: f32,
  gravity: f32,
  stress: f32,
  _pad: vec2f,
}

struct Step { index: u32, time: f32 }

struct View {
  eye: vec4f,
  right: vec4f,
  up: vec4f,
  fwd: vec4f,
  sun: vec4f,
  lx: vec4f,
  ly: vec4f,
  lc: vec4f,
  res: vec4f,
}

struct Particle {
  x: vec4f,
  v: vec4f,
  F: mat3x3f,
  A: mat3x3f,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> S: Step;
@group(0) @binding(2) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(3) var<storage, read_write> grid: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> gridV: array<vec4f>;

@group(0) @binding(5) var<uniform> V: View;
@group(0) @binding(6) var<storage, read> grains: array<Particle>;
@group(0) @binding(7) var shadowMap: texture_depth_2d;
@group(0) @binding(8) var shadowCmp: sampler_comparison;

const TAU = 6.2831853;
const FIXED = 262144.0;
const CREST = 0.36;
const BASE = 0.05;
const LEE = 0.62;
const WINDWARD = 0.2;
const FRICTION = 0.4;
const RADIUS = 0.0046;

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn crestX(z: f32) -> f32 {
  let a = TAU * z / P.lz;
  return 0.42 + 0.035 * sin(a) + 0.015 * sin(2.0 * a + 1.3);
}

fn toeX(z: f32) -> f32 { return crestX(z) + (CREST - BASE) / LEE; }

fn height(x: f32, z: f32) -> f32 {
  let cx = crestX(z);
  let ridge = smin(CREST - (cx - x) * WINDWARD, CREST - (x - cx) * LEE, 0.03);
  return -smin(-ridge, -BASE, 0.05);
}

fn normalAt(x: f32, z: f32) -> vec3f {
  let e = 0.002;
  return normalize(vec3f(height(x - e, z) - height(x + e, z), 2.0 * e, height(x, z - e) - height(x, z + e)));
}

struct Svd { u: mat3x3f, s: vec3f, v: mat3x3f }

fn svd(F: mat3x3f) -> Svd {
  let M = transpose(F) * F;
  var a: array<array<f32, 3>, 3>;
  var v: array<array<f32, 3>, 3>;
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) { a[i][j] = M[j][i]; v[i][j] = f32(i == j); }
  }
  for (var sweep = 0; sweep < 5; sweep++) {
    for (var r = 0; r < 3; r++) {
      let p = select(0, 1, r == 2);
      let q = select(r + 1, 2, r == 2);
      if (abs(a[p][q]) < 1e-12) { continue; }
      let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
      let t = select(-1.0, 1.0, theta >= 0.0) / (abs(theta) + sqrt(theta * theta + 1.0));
      let c = 1.0 / sqrt(t * t + 1.0);
      let s = t * c;
      for (var k = 0; k < 3; k++) {
        let akp = a[k][p];
        let akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (var k = 0; k < 3; k++) {
        let apk = a[p][k];
        let aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (var k = 0; k < 3; k++) {
        let vkp = v[k][p];
        let vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  var o: Svd;
  o.s = sqrt(max(vec3f(a[0][0], a[1][1], a[2][2]), vec3f(1e-12)));
  o.v = mat3x3f(vec3f(v[0][0], v[1][0], v[2][0]), vec3f(v[0][1], v[1][1], v[2][1]), vec3f(v[0][2], v[1][2], v[2][2]));
  o.u = mat3x3f(F * o.v[0] / o.s.x, F * o.v[1] / o.s.y, F * o.v[2] / o.s.z);
  return o;
}

fn outer(a: vec3f, b: vec3f) -> mat3x3f { return mat3x3f(a * b.x, a * b.y, a * b.z); }

fn sandProject(s: vec3f) -> vec3f {
  let e = log(max(s, vec3f(1e-4)));
  let tr = e.x + e.y + e.z;
  let dev = e - tr / 3.0;
  let dn = length(dev);
  if (tr >= 0.0 || dn < 1e-8) { return vec3f(1.0); }
  let dg = dn + (3.0 * P.lambda + 2.0 * P.mu) / (2.0 * P.mu) * tr * P.alpha;
  if (dg <= 0.0) { return s; }
  return exp(e - dg * dev / dn);
}

fn spawn(i: u32) -> Particle {
  let k = i * 8u + S.index * 7919u;
  let z = hash(k) * P.lz;
  let x = crestX(z) - 0.03 + hash(k + 1u) * 0.035;
  var p: Particle;
  p.x = vec4f(x, height(x, z) + 0.012 + hash(k + 2u) * 0.03, z, 0.0);
  p.v = vec4f(0.4 + 0.5 * hash(k + 3u), 0.1 + 0.25 * hash(k + 4u), 0.06 * (hash(k + 5u) - 0.5), 0.0);
  p.F = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  p.A = mat3x3f();
  return p;
}

fn wrapZ(z: i32) -> i32 { let n = i32(P.grid.z); return ((z % n) + n) % n; }
fn node(c: vec3i) -> u32 { return u32((wrapZ(c.z) * i32(P.grid.y) + c.y) * i32(P.grid.x) + c.x); }
fn onGrid(c: vec3i) -> bool { return c.x >= 0 && c.y >= 0 && c.x < i32(P.grid.x) && c.y < i32(P.grid.y); }

struct Weights { base: vec3i, fx: vec3f, w0: vec3f, w1: vec3f, w2: vec3f }

fn weights(x: vec3f) -> Weights {
  var o: Weights;
  let xg = x * P.invDx;
  o.base = vec3i(floor(xg - 0.5));
  o.fx = xg - vec3f(o.base);
  o.w0 = 0.5 * (1.5 - o.fx) * (1.5 - o.fx);
  o.w1 = 0.75 - (o.fx - 1.0) * (o.fx - 1.0);
  o.w2 = 0.5 * (o.fx - 0.5) * (o.fx - 0.5);
  return o;
}

fn pick(w: Weights, i: i32) -> vec3f { return select(select(w.w2, w.w1, i == 1), w.w0, i == 0); }

@compute @workgroup_size(64) fn init(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.count) { return; }
  var x = 0.0;
  var z = 0.0;
  var th = 0.0;
  for (var t = 0u; t < 32u; t++) {
    let k = i * 131u + t * 7u;
    z = hash(k) * P.lz;
    let cx = crestX(z);
    x = cx + 0.004 + hash(k + 1u) * (toeX(z) - cx - 0.03);
    th = P.dx * (2.0 + 11.0 * exp(-(x - cx) / 0.06));
    if (hash(k + 2u) * P.dx * 13.0 < th) { break; }
  }
  var p: Particle;
  p.x = vec4f(x, height(x, z) + P.dx * 0.3 + hash(i * 131u + 5u) * th, z, 0.0);
  p.v = vec4f(0.0);
  p.F = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  p.A = mat3x3f();
  if (hash(i * 131u + 9u) < 0.1) { p = spawn(i); }
  parts[i] = p;
}

@compute @workgroup_size(64) fn clearGrid(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&grid)) { atomicStore(&grid[id.x], 0); }
}

@compute @workgroup_size(64) fn p2g(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.count) { return; }
  let p = parts[i];
  let w = weights(p.x.xyz);
  for (var a = 0; a < 3; a++) {
    for (var b = 0; b < 3; b++) {
      for (var c = 0; c < 3; c++) {
        let off = vec3i(a, b, c);
        let n = w.base + off;
        if (!onGrid(n)) { continue; }
        let weight = pick(w, a).x * pick(w, b).y * pick(w, c).z;
        let dpos = (vec3f(off) - w.fx) * P.dx;
        let mom = weight * (p.v.xyz + p.A * dpos);
        let g = node(n) * 4u;
        atomicAdd(&grid[g], i32(round(weight * FIXED)));
        atomicAdd(&grid[g + 1u], i32(round(mom.x * FIXED)));
        atomicAdd(&grid[g + 2u], i32(round(mom.y * FIXED)));
        atomicAdd(&grid[g + 3u], i32(round(mom.z * FIXED)));
      }
    }
  }
}

@compute @workgroup_size(64) fn gridUpdate(@builtin(global_invocation_id) id: vec3u) {
  let idx = id.x;
  let total = P.grid.x * P.grid.y * P.grid.z;
  if (idx >= total) { return; }
  let m = f32(atomicLoad(&grid[idx * 4u])) / FIXED;
  if (m <= 1e-9) { gridV[idx] = vec4f(0.0); return; }
  var v = vec3f(f32(atomicLoad(&grid[idx * 4u + 1u])), f32(atomicLoad(&grid[idx * 4u + 2u])), f32(atomicLoad(&grid[idx * 4u + 3u]))) / FIXED / m;
  v.y -= P.dt * P.gravity;
  let gx = idx % P.grid.x;
  let gy = (idx / P.grid.x) % P.grid.y;
  let gz = idx / (P.grid.x * P.grid.y);
  let X = vec3f(f32(gx), f32(gy), f32(gz)) * P.dx;
  if (X.y < height(X.x, X.z)) {
    let n = normalAt(X.x, X.z);
    let vn = dot(v, n);
    if (vn < 0.0) {
      let vt = v - n * vn;
      let lt = length(vt);
      v = select(vt * (1.0 + FRICTION * vn / max(lt, 1e-9)), vec3f(0.0), lt <= -FRICTION * vn);
    }
  }
  if ((gx < 2u && v.x < 0.0) || (gx > P.grid.x - 3u && v.x > 0.0)) { v.x = 0.0; }
  if ((gy < 2u && v.y < 0.0) || (gy > P.grid.y - 3u && v.y > 0.0)) { v.y = 0.0; }
  gridV[idx] = vec4f(v, m);
}

@compute @workgroup_size(64) fn g2p(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.count) { return; }
  let p = parts[i];
  let w = weights(p.x.xyz);
  var nv = vec3f(0.0);
  var C = mat3x3f();
  for (var a = 0; a < 3; a++) {
    for (var b = 0; b < 3; b++) {
      for (var c = 0; c < 3; c++) {
        let off = vec3i(a, b, c);
        let n = w.base + off;
        if (!onGrid(n)) { continue; }
        let weight = pick(w, a).x * pick(w, b).y * pick(w, c).z;
        let gv = gridV[node(n)].xyz;
        nv += weight * gv;
        C += outer(weight * gv, (vec3f(off) - w.fx) * P.dx) * (4.0 * P.invDx * P.invDx);
      }
    }
  }
  var x = p.x.xyz + P.dt * nv;
  x.z -= floor(x.z / P.lz) * P.lz;
  let I = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  let d = svd((I + P.dt * C) * p.F);
  let s = sandProject(d.s);
  let e = log(s);
  let tau = 2.0 * P.mu * e + P.lambda * (e.x + e.y + e.z);
  var q: Particle;
  q.x = vec4f(x, p.x.w);
  q.v = vec4f(nv, 0.0);
  q.F = outer(d.u[0] * s.x, d.v[0]) + outer(d.u[1] * s.y, d.v[1]) + outer(d.u[2] * s.z, d.v[2]);
  q.A = (outer(d.u[0] * tau.x, d.u[0]) + outer(d.u[1] * tau.y, d.u[1]) + outer(d.u[2] * tau.z, d.u[2])) * P.stress + C;
  let lost = x.x < 2.0 * P.dx || x.x > f32(P.grid.x - 3u) * P.dx || x.y < 0.0 || x.y > f32(P.grid.y - 3u) * P.dx;
  let rest = x.x > toeX(x.z) + 0.03 && length(nv) < 0.02 && hash(i * 3u + S.index * 7919u) < 0.004;
  if (lost || rest) { q = spawn(i); }
  parts[i] = q;
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn finish(c: vec3f, pos: vec2f) -> vec4f {
  let uv = pos / V.res.xy - 0.5;
  var o = aces(c * 1.1) * (1.0 - 0.3 * dot(uv, uv));
  o = pow(o, vec3f(1.0 / 2.2)) + (hash(u32(pos.x) * 1973u + u32(pos.y) * 9277u) - 0.5) / 255.0;
  return vec4f(o, 1.0);
}

const SUN = vec3f(3.1, 2.3, 1.55);
const SKY = vec3f(0.34, 0.42, 0.55);

fn skyColor(d: vec3f) -> vec3f {
  let h = clamp(d.y, 0.0, 1.0);
  var c = mix(vec3f(0.78, 0.52, 0.34), vec3f(0.16, 0.3, 0.58), pow(h, 0.5));
  let s = max(dot(d, V.sun.xyz), 0.0);
  return c + SUN * (0.25 * pow(s, 8.0) + 3.0 * pow(s, 900.0));
}

fn lightClip(p: vec3f) -> vec3f {
  let q = p - V.lc.xyz;
  return vec3f(dot(q, V.lx.xyz) / V.lx.w, dot(q, V.ly.xyz) / V.lx.w, 0.5 - dot(q, V.sun.xyz) / V.ly.w);
}

fn shadow(p: vec3f) -> f32 {
  let c = lightClip(p);
  let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 1.0; }
  let t = 1.0 / V.res.z;
  var s = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      s += textureSampleCompareLevel(shadowMap, shadowCmp, uv + vec2f(f32(i), f32(j)) * t, c.z - 0.0015);
    }
  }
  return s / 9.0;
}

fn project(p: vec3f) -> vec4f {
  let q = p - V.eye.xyz;
  let d = dot(q, V.fwd.xyz);
  return vec4f(dot(q, V.right.xyz) / V.right.w, dot(q, V.up.xyz) / V.up.w, 20.0 * (d - 0.02) / 19.98, d);
}

fn haze(c: vec3f, p: vec3f) -> vec3f {
  let d = length(p - V.eye.xyz);
  return mix(c, vec3f(0.74, 0.52, 0.36), 1.0 - exp(-max(d - 1.8, 0.0) * 0.3));
}

fn sandShade(p: vec3f, n: vec3f, albedo: vec3f, ao: f32) -> vec3f {
  let sh = shadow(p + n * 0.003);
  let ndl = max(dot(n, V.sun.xyz), 0.0);
  let amb = mix(vec3f(0.5, 0.36, 0.25), SKY, n.y * 0.5 + 0.5);
  var c = albedo * (SUN * ndl * sh + amb * ao);
  let h = normalize(V.sun.xyz + normalize(V.eye.xyz - p));
  c += SUN * pow(max(dot(n, h), 0.0), 40.0) * 0.05 * sh;
  return haze(c, p);
}

@vertex fn vsSky(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
}

@fragment fn fsSky(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ndc = vec2f(pos.x / V.res.x * 2.0 - 1.0, 1.0 - pos.y / V.res.y * 2.0);
  let d = normalize(V.fwd.xyz + V.right.xyz * ndc.x * V.right.w + V.up.xyz * ndc.y * V.up.w);
  return finish(skyColor(d), pos.xy);
}

const TERRAIN_N = vec2u(320u, 240u);
const TERRAIN_LO = vec2f(-1.2, -1.0);
const TERRAIN_HI = vec2f(2.6, 1.6);

fn terrainPoint(vi: u32) -> vec3f {
  var quad = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 0u), vec2u(1u, 1u), vec2u(0u, 1u));
  let q = vi / 6u;
  let c = vec2u(q % TERRAIN_N.x, q / TERRAIN_N.x) + quad[vi % 6u];
  let xz = mix(TERRAIN_LO, TERRAIN_HI, vec2f(c) / vec2f(TERRAIN_N));
  return vec3f(xz.x, height(xz.x, xz.y), xz.y);
}

struct TerrainOut { @builtin(position) pos: vec4f, @location(0) p: vec3f }

@vertex fn vsTerrain(@builtin(vertex_index) vi: u32) -> TerrainOut {
  var o: TerrainOut;
  o.p = terrainPoint(vi);
  o.pos = project(o.p);
  return o;
}

@vertex fn vsTerrainShadow(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let c = lightClip(terrainPoint(vi));
  return vec4f(c.xy, c.z, 1.0);
}

fn ripples(p: vec3f, n: vec3f) -> vec3f {
  let steep = smoothstep(0.35, 0.5, 1.0 - n.y);
  let k = 2.0 * TAU / 0.018;
  let s = p.x + 0.12 * sin(p.z * 9.0) + 0.05 * sin(p.z * 23.0 + p.x * 7.0);
  let g = cos(k * s + 1.7 * sin(s * 3.0)) * (1.0 - steep) * 0.22;
  return normalize(n + vec3f(-g, 0.0, 0.0));
}

@fragment fn fsTerrain(i: TerrainOut) -> @location(0) vec4f {
  let n = ripples(i.p, normalAt(i.p.x, i.p.z));
  let albedo = pow(vec3f(0.86, 0.6, 0.38), vec3f(2.2));
  return finish(sandShade(i.p, n, albedo, 1.0), i.pos.xy);
}

struct GrainOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) centre: vec3f,
  @location(2) @interpolate(flat) albedo: vec3f,
}

fn grainAt(ii: u32) -> vec3f {
  let i = ii % P.count;
  return grains[i].x.xyz + vec3f(0.0, 0.0, (f32(ii / P.count) - 2.0) * P.lz);
}

fn grainColor(i: u32) -> vec3f {
  let h = hash(i * 17u + 3u);
  var c = vec3f(0.86, 0.6, 0.38) * (0.9 + 0.16 * hash(i * 17u + 9u));
  if (h < 0.02) { c = vec3f(0.45, 0.3, 0.2); }
  else if (h < 0.05) { c = vec3f(0.93, 0.8, 0.64); }
  return pow(c, vec3f(2.2));
}

@vertex fn vsGrain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GrainOut {
  var corner = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let uv = corner[vi];
  var o: GrainOut;
  o.centre = grainAt(ii);
  o.pos = project(o.centre + (V.right.xyz * uv.x + V.up.xyz * uv.y) * RADIUS);
  o.uv = uv;
  o.albedo = grainColor(ii % P.count);
  return o;
}

struct GrainFrag { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 }

@fragment fn fsGrain(i: GrainOut) -> GrainFrag {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let n = normalize(V.right.xyz * i.uv.x + V.up.xyz * i.uv.y - V.fwd.xyz * sqrt(1.0 - r2));
  let p = i.centre + n * RADIUS;
  let clip = project(p);
  var o: GrainFrag;
  o.color = finish(sandShade(p, n, i.albedo, mix(0.55, 1.0, n.y * 0.5 + 0.5)), i.pos.xy);
  o.depth = clip.z / clip.w;
  return o;
}

struct ShadowOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn vsGrainShadow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ShadowOut {
  var corner = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let uv = corner[vi];
  let c = lightClip(grainAt(ii) + (V.lx.xyz * uv.x + V.ly.xyz * uv.y) * RADIUS);
  var o: ShadowOut;
  o.pos = vec4f(c.xy, c.z, 1.0);
  o.uv = uv;
  return o;
}

@fragment fn fsGrainShadow(i: ShadowOut) {
  if (dot(i.uv, i.uv) > 1.0) { discard; }
}
