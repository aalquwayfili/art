struct Params {
  count: u32,
  half: f32,
  far: f32,
  near: f32,
}

struct Step { time: f32 }
struct View { size: vec2f, time: f32 }

struct Piece {
  cell: vec2f,
  angle: f32,
  spin: f32,
  lean: f32,
  leanVel: f32,
  red: f32,
  kind: f32,
}

const PI = 3.14159265;
const EYE = vec3f(0.0, 2.0, 9.5);
const LOOK = vec3f(0.0, 0.9, 0.0);
const TAN_HALF = 0.34;
const SUN = vec3f(-0.62, 0.42, -0.66);
const COMMAND = 2.0;
const RELEASE = 15.0;
const SPEED = 3.0;
const RETURN_SPEED = 8.0;

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

@group(0) @binding(0) var<uniform> params: Params;

fn arrival(i: u32, cell: vec2f) -> f32 { return COMMAND + length(cell) / SPEED + 0.25 * hash(i); }
fn departure(i: u32, cell: vec2f) -> f32 { return RELEASE + length(cell) / RETURN_SPEED + 0.25 * hash(i + 7u); }

fn wrapAngle(a: f32) -> f32 { return a - 2.0 * PI * floor((a + PI) / (2.0 * PI)); }

@group(0) @binding(1) var<uniform> tick: Step;
@group(0) @binding(2) var<storage, read_write> pieces: array<Piece>;

@compute @workgroup_size(64)
fn stepPieces(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  var p = pieces[i];
  if (p.kind > 2.5) { return; }
  let t = tick.time;
  let dt = 1.0 / 60.0;
  let arrive = arrival(i, p.cell);
  let depart = departure(i, p.cell);
  let commanded = t >= arrive && t < depart;

  let toKing = -p.cell / max(length(p.cell), 1e-3);
  let goal = select(0.0, atan2(-toKing.y, toKing.x), commanded && p.kind < 1.5);
  let turn = wrapAngle(goal - p.angle);
  p.spin += (70.0 * turn - 7.0 * p.spin) * dt;
  p.angle = wrapAngle(p.angle + p.spin * dt);

  let bow = select(0.0, 0.3, t >= arrive && t < arrive + 0.3 && p.kind < 1.5);
  p.leanVel += (90.0 * (bow - p.lean) - 11.0 * p.leanVel) * dt;
  p.lean += p.leanVel * dt;

  if (p.kind > 1.5) {
    p.red = smoothstep(COMMAND - 0.6, COMMAND, t) * (1.0 - smoothstep(RELEASE, RELEASE + 2.0, t));
  } else if (commanded) {
    p.red = 0.12 + 0.88 * exp(-(t - arrive) * 1.6);
  } else {
    p.red = select(0.0, 0.12 * exp(-(t - depart) * 2.0), t >= depart);
  }
  pieces[i] = p;
}

fn lookAt(eye: vec3f, at: vec3f) -> mat4x4f {
  let f = normalize(at - eye);
  let s = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  let u = cross(s, f);
  return mat4x4f(vec4f(s.x, u.x, -f.x, 0.0), vec4f(s.y, u.y, -f.y, 0.0), vec4f(s.z, u.z, -f.z, 0.0),
                 vec4f(-dot(s, eye), -dot(u, eye), dot(f, eye), 1.0));
}

fn eyeMatrix(aspect: f32) -> mat4x4f {
  let f = 1.0 / TAN_HALF;
  let n = 0.1;
  let r = 200.0;
  let proj = mat4x4f(vec4f(f / aspect, 0.0, 0.0, 0.0), vec4f(0.0, f, 0.0, 0.0),
                     vec4f(0.0, 0.0, r / (n - r), -1.0), vec4f(0.0, 0.0, n * r / (n - r), 0.0));
  return proj * lookAt(EYE, LOOK);
}

fn sunMatrix() -> mat4x4f {
  let centre = vec3f(0.0, 0.0, 0.5 * (params.far + params.near));
  let radius = max(params.half, 0.5 * (params.near - params.far)) * 1.2;
  let depth = 4.0 * radius;
  let proj = mat4x4f(vec4f(1.0 / radius, 0.0, 0.0, 0.0), vec4f(0.0, 1.0 / radius, 0.0, 0.0),
                     vec4f(0.0, 0.0, -1.0 / depth, 0.0), vec4f(0.0, 0.0, 0.0, 1.0));
  return proj * lookAt(centre + normalize(SUN) * 2.0 * radius, centre);
}

fn orient(p: Piece, v: vec3f) -> vec3f {
  var q = v * select(1.0, 1.45, p.kind > 1.5);
  let a = p.angle;
  q = vec3f(cos(a) * q.x + sin(a) * q.z, q.y, -sin(a) * q.x + cos(a) * q.z);
  let toKing = -p.cell / max(length(p.cell), 1e-3);
  let u = dot(q.xz, toKing);
  let c = cos(p.lean);
  let s = sin(p.lean);
  let bent = vec2f(u * c + q.y * s, -u * s + q.y * c);
  return vec3f(q.x + toKing.x * (bent.x - u), bent.y, q.z + toKing.y * (bent.x - u));
}

@group(0) @binding(1) var<uniform> view: View;
@group(0) @binding(2) var<storage, read> piecesIn: array<Piece>;

struct Vertex { @location(0) pos: vec3f, @location(1) normal: vec3f }
struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) red: f32,
}

@vertex
fn vsScene(v: Vertex, @builtin(instance_index) i: u32) -> Surface {
  let p = piecesIn[i];
  var s: Surface;
  if (p.kind > 2.5) {
    s.world = v.pos;
    s.normal = v.normal;
  } else {
    s.world = orient(p, v.pos) + vec3f(p.cell.x, 0.0, p.cell.y);
    s.normal = orient(p, v.normal);
  }
  s.red = p.red;
  s.clip = eyeMatrix(view.size.x / view.size.y) * vec4f(s.world, 1.0);
  return s;
}

struct GBuffer { @location(0) normalDepth: vec4f, @location(1) worldRed: vec4f }

@fragment
fn fsScene(s: Surface) -> GBuffer {
  return GBuffer(vec4f(normalize(s.normal), distance(s.world, EYE)), vec4f(s.world, s.red));
}

@vertex
fn vsShadow(v: Vertex, @builtin(instance_index) i: u32) -> @builtin(position) vec4f {
  let p = piecesIn[i];
  return sunMatrix() * vec4f(orient(p, v.pos) + vec3f(p.cell.x, 0.0, p.cell.y), 1.0);
}

@group(0) @binding(2) var normalDepthTex: texture_2d<f32>;
@group(0) @binding(3) var worldRedTex: texture_2d<f32>;
@group(0) @binding(4) var shadowTex: texture_depth_2d;

@vertex
fn vsSketch(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn rgb(h: u32) -> vec3f {
  return vec3f(f32((h >> 16u) & 255u), f32((h >> 8u) & 255u), f32(h & 255u)) / 255.0;
}

fn hash2(p: vec2f) -> f32 {
  let q = vec2u(vec2i(floor(p)) + vec2i(65536));
  return hash(q.x * 1973u + q.y * 9277u);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn texel(tex: texture_2d<f32>, p: vec2f) -> vec4f {
  let size = vec2i(textureDimensions(tex));
  return textureLoad(tex, clamp(vec2i(p), vec2i(0), size - 1), 0);
}

fn sunlight(world: vec3f) -> f32 {
  let c = sunMatrix() * vec4f(world, 1.0);
  let size = vec2f(textureDimensions(shadowTex));
  let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5) * size;
  var lit = 0.0;
  for (var k = 0; k < 9; k++) {
    let q = clamp(vec2i(uv) + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), vec2i(size) - 1);
    lit += select(0.0, 1.0, c.z - 0.002 <= textureLoad(shadowTex, q, 0));
  }
  return lit / 9.0;
}

fn hatch(p: vec2f, angle: f32, spacing: f32, seed: f32) -> f32 {
  let d = vec2f(cos(angle), sin(angle));
  let across = dot(p, vec2f(-d.y, d.x)) / spacing + seed;
  let row = floor(across);
  let along = dot(p, d);
  let wobble = 0.15 * sin(along * 0.04 + hash2(vec2f(row, seed)) * 6.28);
  let dist = abs(fract(across + wobble) - 0.5) * spacing;
  let dash = smoothstep(0.3, 0.45, noise(vec2f(along / (spacing * 9.0) + 17.0 * hash2(vec2f(row, 3.0)), row)));
  return (1.0 - smoothstep(0.35, 1.1, dist)) * dash;
}

fn shade(p: vec2f, tone: f32, px: f32, seed: f32) -> f32 {
  var ink = 0.55 * hatch(p, 1.05, 5.0 * px, seed) * smoothstep(0.82, 0.7, tone);
  ink = max(ink, 0.7 * hatch(p, 2.4, 5.0 * px, seed + 0.5) * smoothstep(0.55, 0.42, tone));
  return max(ink, 0.85 * hatch(p, 0.25, 3.5 * px, seed + 0.25) * smoothstep(0.32, 0.2, tone));
}

fn contour(p: vec2f, px: f32) -> f32 {
  let c = texel(normalDepthTex, p);
  if (c.w == 0.0) { return 0.0; }
  var edge = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = array<vec2f, 4>(vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0))[k] * px;
    let n = texel(normalDepthTex, p + o);
    let far = select(abs(n.w - c.w) / c.w, 1.0, n.w == 0.0);
    edge = max(edge, smoothstep(0.02, 0.05, far));
    edge = max(edge, smoothstep(0.8, 0.55, dot(n.xyz, c.xyz)) * 0.8);
  }
  return edge;
}

@fragment
fn fsSketch(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let t = view.time;
  let px = max(view.size.y / 900.0, 1.0);
  let boil = floor(t * 6.0);
  let jitter = vec2f(noise(frag.xy / (40.0 * px) + boil * 3.1), noise(frag.xy / (40.0 * px) + boil * 5.3 + 9.0)) - 0.5;
  let p = frag.xy + jitter * 1.6 * px;

  let paper = rgb(0xefe9ddu) * (0.965 + 0.035 * noise(frag.xy * vec2f(0.9, 0.12) / px)) - 0.02 * noise(frag.xy / (180.0 * px));
  let graphite = rgb(0x2a2724u);
  let crimson = rgb(0xb4161fu);

  let nd = texel(normalDepthTex, p);
  let wr = texel(worldRedTex, p);
  let world = wr.xyz;
  let dRank = fwidth((world.x + world.z) * 5.0);
  let dCell = fwidth(world.xz);
  let dRing = fwidth(length(world.xz));
  if (nd.w == 0.0) { return vec4f(paper, 1.0); }
  let fade = smoothstep(9.0, 55.0, nd.w);
  let sun = sunlight(world);
  let seed = hash2(vec2f(boil, 1.0));
  var ink = 0.0;
  var redInk = 0.0;

  if (nd.y > 0.99 && world.y < 0.01) {
    let cell = floor(world.xz + 0.5);
    let dark = (i32(cell.x) + i32(cell.y)) % 2 == 0;
    let along = abs(fract((world.x + world.z) * 5.0 + 0.2 * noise(world.xz * 3.0)) - 0.5) / dRank;
    let line = (1.0 - smoothstep(0.3, 1.0, along)) * step(0.3, noise(world.xz * vec2f(4.0, 4.0) + seed * 9.0));
    ink = select(0.0, 0.5 * line, dark);
    ink = max(ink, shade(p, mix(1.0, 0.45, 1.0 - sun), px, seed));
    let edge = abs(fract(world.xz + 0.5) - 0.5) / dCell;
    ink = max(ink, 0.25 * (1.0 - smoothstep(0.4, 1.0, min(edge.x, edge.y))));
    let radius = (t - COMMAND) * SPEED;
    let ring = abs(length(world.xz) - radius) / dRing;
    redInk = (1.0 - smoothstep(0.8, 2.2, ring)) * step(0.3, noise(world.xz * 2.0 + seed * 5.0))
           * step(COMMAND, t) * step(t, RELEASE);
  } else {
    let tone = 0.2 + 0.8 * max(dot(nd.xyz, normalize(SUN)), 0.0) * sun + 0.15 * max(nd.y, 0.0);
    let h = shade(p, tone, px, seed);
    let red = wr.w;
    ink = h * (1.0 - smoothstep(0.4, 0.8, red));
    redInk = h * smoothstep(0.4, 0.8, red) + 0.5 * smoothstep(0.75, 1.0, red) * hatch(p, 1.3, 3.0 * px, seed);
  }
  let line = contour(p, px);
  let red = select(wr.w, 0.0, nd.y > 0.99 && world.y < 0.01);
  ink = max(ink, 0.9 * line * (1.0 - smoothstep(0.1, 0.3, red)));
  redInk = max(redInk, 0.95 * line * smoothstep(0.1, 0.3, red));

  var c = mix(paper, graphite, ink * (1.0 - fade) * 0.92);
  c = mix(c, crimson, clamp(redInk, 0.0, 1.0) * (1.0 - fade));
  return vec4f(c, 1.0);
}
