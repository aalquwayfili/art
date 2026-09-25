struct Frame {
  viewProj: mat4x4f,
  lightProj: mat4x4f,
  view: mat4x4f,
  eye: vec4f,
  light: vec4f,
  screen: vec4f,
}

struct Vert { pos: vec4f, nrm: vec4f, uv: vec4f }

const PI = 3.14159265;
const TRAY_TOP = 0.035;
const CUP_AT = vec3f(1.2, 0.0, 1.05);

fn pcg3(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

fn rand3(v: vec3u) -> vec3f { return vec3f(pcg3(v)) / 4294967295.0; }

fn noise(p: vec2f) -> f32 {
  let i = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let h = array<f32, 4>(rand3(bitcast<vec3u>(vec3i(i, 5))).x, rand3(bitcast<vec3u>(vec3i(i + vec2i(1, 0), 5))).x,
                        rand3(bitcast<vec3u>(vec3i(i + vec2i(0, 1), 5))).x, rand3(bitcast<vec3u>(vec3i(i + vec2i(1, 1), 5))).x);
  return mix(mix(h[0], h[1], u.x), mix(h[2], h[3], u.x), u.y);
}

var<private> PROFILE: array<vec2f, 48> = array<vec2f, 48>(
  vec2f(0.0, 0.0), vec2f(0.5, 0.0), vec2f(0.56, 0.04), vec2f(0.53, 0.08), vec2f(0.7, 0.22), vec2f(0.76, 0.38),
  vec2f(0.67, 0.56), vec2f(0.45, 0.7), vec2f(0.4, 0.8), vec2f(0.49, 1.02), vec2f(0.54, 1.16), vec2f(0.46, 1.3),
  vec2f(0.32, 1.4), vec2f(0.29, 1.52), vec2f(0.36, 1.56), vec2f(0.41, 1.6), vec2f(0.31, 1.66), vec2f(0.19, 1.82),
  vec2f(0.1, 1.94), vec2f(0.065, 1.99), vec2f(0.11, 2.05), vec2f(0.07, 2.12), vec2f(0.045, 2.2), vec2f(0.0, 2.44),
  vec2f(0.0, 0.0), vec2f(0.1, 0.0), vec2f(0.12, 0.02), vec2f(0.155, 0.1), vec2f(0.19, 0.21), vec2f(0.205, 0.27),
  vec2f(0.195, 0.282), vec2f(0.182, 0.235), vec2f(0.162, 0.16), vec2f(0.1, 0.148), vec2f(0.04, 0.146), vec2f(0.0, 0.146),
  vec2f(0.0, 0.0), vec2f(0.85, 0.0), vec2f(0.95, 0.006), vec2f(1.0, 0.03), vec2f(1.02, 0.065), vec2f(1.035, 0.075),
  vec2f(1.015, 0.078), vec2f(0.99, 0.05), vec2f(0.95, 0.036), vec2f(0.8, 0.035), vec2f(0.3, 0.035), vec2f(0.0, 0.035));

fn spline(start: i32, count: i32, u: f32) -> vec2f {
  let x = clamp(u, 0.0, 1.0) * f32(count - 1);
  let i = min(i32(x), count - 2);
  let t = x - f32(i);
  let p0 = PROFILE[start + max(i - 1, 0)];
  let p1 = PROFILE[start + i];
  let p2 = PROFILE[start + i + 1];
  let p3 = PROFILE[start + min(i + 2, count - 1)];
  return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t
                + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t * t * t);
}

fn arcLength(start: i32, count: i32, u: f32) -> f32 {
  var s = 0.0;
  var prev = spline(start, count, 0.0);
  for (var k = 1; k <= 32; k++) {
    let q = spline(start, count, u * f32(k) / 32.0);
    s += length(q - prev);
    prev = q;
  }
  return s;
}

fn lathe(start: i32, count: i32, u: f32, v: f32) -> vec3f {
  let rh = spline(start, count, u);
  let a = 2.0 * PI * v;
  return vec3f(rh.x * cos(a), rh.y, rh.x * sin(a));
}

fn bezier(p: array<vec3f, 4>, t: f32) -> vec3f {
  let s = 1.0 - t;
  return s * s * s * p[0] + 3.0 * s * s * t * p[1] + 3.0 * s * t * t * p[2] + t * t * t * p[3];
}

fn tube(p: array<vec3f, 4>, u: f32, v: f32, rN: f32, rB: f32, beak: f32) -> vec3f {
  let tng = normalize(bezier(p, u + 0.001) - bezier(p, u - 0.001));
  let b = vec3f(0.0, 0.0, 1.0);
  let n = normalize(cross(b, tng));
  let a = 2.0 * PI * v;
  let lip = 0.5 + 0.5 * cos(a);
  return bezier(p, u) + rN * cos(a) * n + rB * sin(a) * b + tng * beak * smoothstep(0.82, 1.0, u) * lip * lip;
}

fn surface(part: u32, u: f32, v: f32) -> vec3f {
  switch part {
    case 0u: { return lathe(0, 24, u, v); }
    case 1u: {
      let r = mix(0.16, 0.055, pow(u, 0.6)) + 0.022 * smoothstep(0.88, 1.0, u);
      let c = array<vec3f, 4>(vec3f(0.4, 0.36, 0.0), vec3f(1.16, 0.36, 0.0), vec3f(1.02, 1.18, 0.0), vec3f(1.42, 1.58, 0.0));
      return tube(c, u, v, r, r, 0.16);
    }
    case 2u: {
      let c = array<vec3f, 4>(vec3f(-0.28, 1.32, 0.0), vec3f(-1.25, 1.52, 0.0), vec3f(-1.15, 0.44, 0.0), vec3f(-0.5, 0.52, 0.0));
      return tube(c, u, v, 0.034, 0.07, 0.0);
    }
    case 3u: { return lathe(24, 12, u, v); }
    case 4u: { return lathe(36, 12, u, v); }
    default: { return vec3f((u - 0.5) * 40.0, 0.0, (v - 0.5) * 40.0); }
  }
}

fn hatchCoords(part: u32, u: f32, v: f32) -> vec2f {
  switch part {
    case 0u: { return vec2f(v * 9.0, arcLength(0, 24, u) / 0.5); }
    case 1u: { return vec2f(v * 2.0, u * 6.0); }
    case 2u: { return vec2f(v, u * 5.0); }
    case 3u: { return vec2f(v * 4.0, arcLength(24, 12, u) / 0.3); }
    case 4u: { return vec2f(v * 14.0, arcLength(36, 12, u) / 0.45); }
    default: { return vec2f(0.0); }
  }
}

@group(0) @binding(10) var<uniform> meshSide: vec4u;
@group(0) @binding(11) var<storage, read_write> meshVerts: array<Vert>;
@group(0) @binding(12) var<storage, read_write> meshIndices: array<u32>;

@compute @workgroup_size(64)
fn buildMesh(@builtin(global_invocation_id) g: vec3u) {
  let n = meshSide.x;
  if (g.x >= 6u * n * n) { return; }
  let part = g.x / (n * n);
  let i = (g.x % (n * n)) % n;
  let j = (g.x % (n * n)) / n;
  let u = f32(i) / f32(n - 1u);
  let v = f32(j) / f32(n - 1u);
  let e = 0.5 / f32(n);
  let p = surface(part, u, v);
  let du = surface(part, min(u + e, 1.0), v) - surface(part, max(u - e, 0.0), v);
  let dv = surface(part, u, v + e) - surface(part, u, v - e);
  var nrm = cross(du, dv);
  if (part == 1u || part == 2u || part == 5u) { nrm = -nrm; }
  nrm = select(normalize(nrm), vec3f(0.0, select(-1.0, 1.0, u > 0.5), 0.0), length(nrm) < 1e-12);
  meshVerts[g.x] = Vert(vec4f(p, f32(part)), vec4f(nrm, 0.0), vec4f(hatchCoords(part, u, v), u, v));
  if (i + 1u < n && j + 1u < n) {
    let q = 6u * (part * (n - 1u) * (n - 1u) + j * (n - 1u) + i);
    meshIndices[q] = g.x;       meshIndices[q + 1u] = g.x + 1u; meshIndices[q + 2u] = g.x + n;
    meshIndices[q + 3u] = g.x + 1u; meshIndices[q + 4u] = g.x + n + 1u; meshIndices[q + 5u] = g.x + n;
  }
}

struct TamInfo { size: u32, rows: u32, cells: u32, pad: u32 }

@group(0) @binding(13) var<uniform> tam: TamInfo;
@group(0) @binding(14) var tamOut: texture_storage_2d_array<rgba8unorm, write>;

var<private> RANK: array<vec3f, 6> = array<vec3f, 6>(vec3f(0.22, 0.0, 0.0), vec3f(0.42, 0.0, 0.0),
  vec3f(0.62, 0.22, 0.0), vec3f(0.8, 0.5, 0.0), vec3f(0.94, 0.75, 0.3), vec3f(1.0, 1.0, 0.75));

@compute @workgroup_size(8, 8)
fn buildTam(@builtin(global_invocation_id) g: vec3u) {
  if (any(g.xy >= vec2u(tam.size))) { return; }
  let p = (vec2f(g.xy) + 0.5) / f32(tam.size);
  let halfWidth = 0.65 / f32(tam.size);
  let R = i32(tam.rows);
  let C = i32(tam.cells);
  var paper = array<f32, 6>(1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
  for (var fam = 0u; fam < 3u; fam++) {
    var s = p.x; var t = p.y; var k = 1.0;
    if (fam == 1u) { s = p.y; t = p.x; }
    if (fam == 2u) { s = p.x - p.y; t = p.x + p.y; k = 0.7071; }
    let row0 = i32(floor(t * f32(R)));
    let cell0 = i32(floor(s * f32(C)));
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -2; dc <= 0; dc++) {
        let j = row0 + dr;
        let c = cell0 + dc;
        let key = vec2u(u32(((j % R) + R) % R), u32(((c % C) + C) % C));
        let a = rand3(vec3u(key, fam * 2u));
        let b = rand3(vec3u(key, fam * 2u + 1u));
        if (a.x >= RANK[5][fam]) { continue; }
        let s0 = (f32(c) + 0.5 * a.y) / f32(C);
        let len = (0.9 + 0.8 * a.z) / f32(C);
        let along = (s - s0) / len;
        if (along < 0.0 || along > 1.0) { continue; }
        let centre = (f32(j) + 0.5 + 0.6 * (b.x - 0.5) + 0.5 * (b.z - 0.5) * sin(PI * along)) / f32(R)
                     + 0.05 * (b.y - 0.5) * (s - s0);
        let d = abs(t - centre) * k;
        let pressure = (0.5 + 0.5 * b.z) * smoothstep(0.0, 0.1, along) * (1.0 - 0.55 * smoothstep(0.5, 1.0, along));
        let ink = pressure * (1.0 - smoothstep(0.4 * halfWidth, 1.7 * halfWidth, d));
        for (var tone = 0; tone < 6; tone++) {
          if (a.x < RANK[tone][fam]) { paper[tone] *= 1.0 - ink; }
        }
      }
    }
  }
  for (var tone = 0; tone < 6; tone++) {
    textureStore(tamOut, g.xy, tone, vec4f(1.0 - paper[tone]));
  }
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> verts: array<Vert>;

struct Placed { pos: vec3f, nrm: vec3f }

fn place(v: Vert) -> Placed {
  let part = u32(v.pos.w);
  if (part <= 2u) {
    let c = cos(frame.light.w);
    let s = sin(frame.light.w);
    let turn = mat3x3f(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    return Placed(turn * v.pos.xyz + vec3f(0.0, TRAY_TOP, 0.0), turn * v.nrm.xyz);
  }
  if (part == 3u) { return Placed(v.pos.xyz + CUP_AT, v.nrm.xyz); }
  return Placed(v.pos.xyz, v.nrm.xyz);
}

@vertex
fn vsShadow(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return frame.lightProj * vec4f(place(verts[i]).pos, 1.0);
}

@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
@group(0) @binding(4) var tamTex: texture_2d_array<f32>;
@group(0) @binding(5) var tamSampler: sampler;

struct SceneOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) part: u32,
}

@vertex
fn vsScene(@builtin(vertex_index) i: u32) -> SceneOut {
  let v = verts[i];
  let p = place(v);
  return SceneOut(frame.viewProj * vec4f(p.pos, 1.0), p.pos, p.nrm, v.uv.xy, u32(v.pos.w));
}

fn sunlit(world: vec3f, n: vec3f) -> f32 {
  let clip = frame.lightProj * vec4f(world + n * 0.02, 1.0);
  let uv = clip.xy * vec2f(0.5, -0.5) + 0.5;
  let texel = 1.0 / f32(textureDimensions(shadowMap).x);
  var lit = 0.0;
  for (var k = 0; k < 9; k++) {
    let o = vec2f(f32(k % 3) - 1.0, f32(k / 3) - 1.0) * 1.5 * texel;
    lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + o, clip.z - 0.002);
  }
  return lit / 9.0;
}

struct GBuffer { @location(0) geo: vec4f, @location(1) ink: vec4f }

@fragment
fn fsScene(in: SceneOut) -> GBuffer {
  let V = normalize(frame.eye.xyz - in.world);
  var n = normalize(in.nrm);
  if (dot(n, V) < 0.0) { n = -n; }
  let L = frame.light.xyz;
  let sun = sunlit(in.world, n);
  let diffuse = max(dot(n, L), 0.0) * sun;
  let r = reflect(-V, n);
  let fromAxis = length(in.world.xz);
  var light = 0.0;
  var uv = in.uv;
  var fade = 1.0;
  switch in.part {
    case 3u: {
      light = 0.3 + 0.72 * diffuse;
      if (n.y > 0.95 && in.world.y > 0.1) { light = 0.5 + 0.2 * diffuse; }
    }
    case 5u: {
      let cup = length(in.world.xz - CUP_AT.xz);
      let contact = 0.35 * smoothstep(1.25, 1.02, fromAxis) + 0.35 * smoothstep(0.38, 0.2, cup);
      light = 1.0 - 0.52 * (1.0 - sun) - contact;
      let a = 0.5;
      uv = mat2x2f(cos(a), sin(a), -sin(a), cos(a)) * in.world.xz / 0.55;
      fade = smoothstep(3.3, 1.5, length(in.world.xz - vec2f(0.4, 0.3)) + 0.5 * noise(in.world.xz * 2.0));
    }
    default: {
      var env = mix(0.62, 0.12, smoothstep(-0.4, -0.02, r.y));
      env = mix(env, 0.95, smoothstep(0.12, 0.5, r.y));
      env *= 0.75 + 0.25 * smoothstep(-0.3, 0.6, dot(r, L));
      let glint = pow(max(dot(r, L), 0.0), 50.0) * sun;
      light = 0.62 * diffuse + 0.38 * env * (0.4 + 0.6 * sun) + 1.5 * glint;
      if (in.part == 4u) { light -= 0.28 * smoothstep(0.85, 0.55, fromAxis); }
    }
  }
  let dark = pow(clamp(1.0 - light, 0.0, 1.0), 1.5);
  let level = dark * 6.0;
  let lo = floor(level);
  let lighter = textureSample(tamTex, tamSampler, uv, i32(max(lo - 1.0, 0.0))).r * select(0.0, 1.0, lo >= 1.0);
  let darker = textureSample(tamTex, tamSampler, uv, i32(min(lo, 5.0))).r;
  let ink = mix(lighter, darker, level - lo);
  let depth = -(frame.view * vec4f(in.world, 1.0)).z;
  let viewNormal = (frame.view * vec4f(n, 0.0)).xyz;
  return GBuffer(vec4f(viewNormal, depth), vec4f(ink * fade, dark * fade, f32(in.part + 1u) / 8.0, fade));
}

@group(0) @binding(6) var gGeo: texture_2d<f32>;
@group(0) @binding(7) var gInk: texture_2d<f32>;

@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn texel(t: texture_2d<f32>, p: vec2f) -> vec4f {
  let size = vec2i(textureDimensions(t));
  return textureLoad(t, clamp(vec2i(floor(p)), vec2i(0), size - 1), 0);
}

fn contour(q: vec2f, r: f32) -> f32 {
  let g = texel(gGeo, q);
  let k = texel(gInk, q);
  var edge = 0.0;
  for (var d = 0; d < 4; d++) {
    let o = select(vec2f(0.0, r), vec2f(r, 0.0), d < 2) * select(-1.0, 1.0, d % 2 == 0);
    let go = texel(gGeo, q + o);
    let ko = texel(gInk, q + o);
    let jump = smoothstep(0.03, 0.08, abs(g.w - go.w) / min(g.w, go.w));
    let crease = smoothstep(0.2, 0.55, 1.0 - dot(g.xyz, go.xyz));
    let seam = select(0.0, 1.0, abs(k.b - ko.b) > 0.01);
    edge = max(edge, max(jump, max(0.8 * crease, seam)) * max(k.a, ko.a));
  }
  return edge;
}

@fragment
fn fsSketch(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy;
  let px = frame.screen.z;
  let boil = frame.screen.w;
  let q = p / px;
  let w1 = vec2f(noise(q / 45.0 + boil * 3.1), noise(q / 45.0 + 17.0 + boil * 3.1)) - 0.5;
  let w2 = vec2f(noise(q / 23.0 + 41.0 + boil * 5.7), noise(q / 23.0 + 63.0 + boil * 5.7)) - 0.5;
  let pressure = 0.55 + 0.45 * noise(q / 30.0 + boil);
  let line = max(contour(p + w1 * 3.5 * px, px), 0.5 * contour(p + w2 * 5.0 * px, px)) * pressure;

  let here = texel(gInk, p);
  var rub = 0.0;
  for (var k = 0; k < 6; k++) {
    let a = f32(k) * 1.047 + 0.3;
    rub += texel(gInk, p + vec2f(cos(a), sin(a)) * 5.0 * px).g;
  }
  rub = 0.16 * (rub / 6.0 + here.g) * 0.5;

  let tooth = 0.5 * noise(q / 1.1) + 0.3 * noise(q / 2.7 + 9.0) + 0.2 * noise(vec2f(q.x / 9.0, q.y / 1.3));
  let graphite = 1.0 - (1.0 - 0.85 * here.r) * (1.0 - 0.95 * line) * (1.0 - rub);
  let amount = clamp(graphite * mix(0.45, 1.25, tooth), 0.0, 0.92);

  let uv = p / frame.screen.xy;
  let mottle = 0.96 + 0.04 * noise(q / 160.0) - 0.05 * dot(uv - 0.5, uv - 0.5);
  let paper = vec3f(0.953, 0.937, 0.894) * mottle;
  return vec4f(mix(paper, vec3f(0.2, 0.2, 0.22), amount), 1.0);
}
