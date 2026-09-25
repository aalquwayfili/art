struct Params {
  size: vec2u,
  agentCount: u32,
  sensorAngle: f32,
  sensorDist: f32,
  turnAngle: f32,
  speed: f32,
  depositAmount: f32,
  decay: f32,
  climbCost: f32,
  foodAmount: f32,
}

struct Agent {
  pos: vec2f,
  heading: f32,
  rng: u32,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> terrain: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> deposit: array<atomic<u32>>;

fn hash2(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}

struct LandParams {
  size: vec2u,
  seaCount: u32,
  ridgeCount: u32,
  sandCount: u32,
  cityCount: u32,
  scale: f32,
}

@group(0) @binding(0) var<uniform> LP: LandParams;
@group(0) @binding(1) var<storage, read> seaVerts: array<vec2f>;
@group(0) @binding(2) var<storage, read> seaRings: array<vec2u>;
@group(0) @binding(3) var<storage, read> ridges: array<vec4f>;
@group(0) @binding(4) var<storage, read> sands: array<vec4f>;
@group(0) @binding(5) var<storage, read> cities: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> terrainOut: array<vec4f>;

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1, 0)), u.x),
             mix(hash2(i + vec2f(0, 1)), hash2(i + vec2f(1, 1)), u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var sum = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 5; i++) {
    sum += amp * valueNoise(p);
    p = mat2x2f(1.6, 1.2, -1.2, 1.6) * p + vec2f(3.1, 7.7);
    amp *= 0.5;
  }
  return sum;
}

fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

fn ringDistance(p: vec2f, ring: vec2u) -> f32 {
  var d = 1e9;
  var s = 1.0;
  var j = ring.x + ring.y - 1u;
  for (var i = ring.x; i < ring.x + ring.y; i++) {
    let a = seaVerts[i];
    let b = seaVerts[j];
    d = min(d, segmentDistance(p, a, b));
    let c = vec3<bool>((p.y >= a.y), (p.y < b.y), ((b.x - a.x) * (p.y - a.y) > (b.y - a.y) * (p.x - a.x)));
    if (all(c) || !any(c)) { s = -s; }
    j = i;
  }
  return s * d;
}

fn coastDistance(p: vec2f) -> f32 {
  var sea = 1e9;
  for (var r = 0u; r < LP.seaCount; r++) {
    sea = min(sea, ringDistance(p, seaRings[r]));
  }
  let wobble = (fbm(p / (28.0 * LP.scale)) - 0.5) * 16.0 * LP.scale;
  return sea + wobble;
}

fn elevation(p: vec2f) -> f32 {
  var ridge = 0.0;
  for (var i = 0u; i < LP.ridgeCount; i++) {
    let d = segmentDistance(p, ridges[i].xy, ridges[i].zw) / (22.0 * LP.scale);
    ridge = max(ridge, exp(-d * d));
  }
  let relief = fbm(p / (60.0 * LP.scale) + 11.0);
  return clamp(ridge * (0.45 + 0.7 * relief) + 0.35 * (relief - 0.3), 0.0, 1.0);
}

fn sandCover(p: vec2f) -> f32 {
  var cover = 0.0;
  for (var i = 0u; i < LP.sandCount; i++) {
    let q = (p - sands[i].xy) / sands[i].zw;
    cover = max(cover, smoothstep(1.0, 0.55, length(q)));
  }
  return cover * smoothstep(0.35, 0.6, fbm(p / (40.0 * LP.scale) + 3.0));
}

fn cityDistance(p: vec2f) -> f32 {
  var d = 1e9;
  for (var i = 0u; i < LP.cityCount; i++) {
    d = min(d, distance(p, cities[i].xy) - cities[i].z);
  }
  return d;
}

@compute @workgroup_size(16, 16)
fn bakeLand(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= LP.size)) { return; }
  let p = vec2f(id.xy) + 0.5;
  let coast = coastDistance(p);
  let land = smoothstep(0.0, 6.0 * LP.scale, coast);
  terrainOut[id.y * LP.size.x + id.x] = vec4f(coast, elevation(p) * land, sandCover(p) * land, cityDistance(p));
}

struct SeedParams {
  agentCount: u32,
  cityCount: u32,
  totalWeight: f32,
  scale: f32,
}

@group(0) @binding(0) var<uniform> SP: SeedParams;
@group(0) @binding(1) var<storage, read> seedCities: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> agentsOut: array<Agent>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

fn toUnit(v: u32) -> f32 {
  return f32(v >> 8u) / 16777216.0;
}

fn pickCity(r: f32) -> vec4f {
  var acc = 0.0;
  for (var i = 0u; i < SP.cityCount; i++) {
    acc += seedCities[i].w;
    if (r * SP.totalWeight <= acc) { return seedCities[i]; }
  }
  return seedCities[SP.cityCount - 1u];
}

@compute @workgroup_size(256)
fn seedAgents(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= SP.agentCount) { return; }
  let h0 = pcg(i * 3u + 1u);
  let h1 = pcg(h0);
  let h2 = pcg(h1);
  let city = pickCity(toUnit(h0));
  let angle = toUnit(h1) * 6.2831853;
  let radius = city.z * sqrt(toUnit(h2)) * 1.6;
  agentsOut[i] = Agent(city.xy + radius * vec2f(cos(angle), sin(angle)), toUnit(pcg(h2)) * 6.2831853, pcg(h2 ^ 0x9e3779b9u));
}

@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> trail: array<f32>;

fn nextRandom(state: ptr<function, u32>) -> f32 {
  *state = *state * 747796405u + 2891336453u;
  let s = *state;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return f32(((w >> 22u) ^ w) >> 8u) / 16777216.0;
}

fn cellIndex(p: vec2f) -> i32 {
  let c = vec2i(floor(p));
  if (any(c < vec2i(0)) || any(c >= vec2i(P.size))) { return -1; }
  return c.y * i32(P.size.x) + c.x;
}

fn sense(pos: vec2f, heading: f32) -> f32 {
  let i = cellIndex(pos + P.sensorDist * vec2f(cos(heading), sin(heading)));
  if (i < 0) { return -1e6; }
  let ground = terrain[i];
  if (ground.x <= 0.0) { return -1e6; }
  return trail[i] - P.climbCost * ground.y;
}

fn steer(pos: vec2f, heading: f32, r: f32) -> f32 {
  let front = sense(pos, heading);
  let left = sense(pos, heading + P.sensorAngle);
  let right = sense(pos, heading - P.sensorAngle);
  if (front >= left && front >= right) { return heading; }
  if (front < left && front < right) { return heading + select(-P.turnAngle, P.turnAngle, r < 0.5); }
  return heading + select(-P.turnAngle, P.turnAngle, left > right);
}

@compute @workgroup_size(256)
fn moveAgents(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= P.agentCount) { return; }
  var a = agents[id.x];
  a.heading = steer(a.pos, a.heading, nextRandom(&a.rng));
  let next = a.pos + P.speed * vec2f(cos(a.heading), sin(a.heading));
  let i = cellIndex(next);
  if (i < 0 || terrain[i].x <= 0.0) {
    a.heading = nextRandom(&a.rng) * 6.2831853;
  } else {
    a.pos = next;
    atomicAdd(&deposit[i], 1u);
  }
  agents[id.x] = a;
}

@group(0) @binding(1) var<storage, read> trailIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> trailOut: array<f32>;

fn blur(c: vec2i) -> f32 {
  let hi = vec2i(P.size) - 1;
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    let row = u32(clamp(c.y + dy, 0, hi.y)) * P.size.x;
    for (var dx = -1; dx <= 1; dx++) {
      sum += trailIn[row + u32(clamp(c.x + dx, 0, hi.x))];
    }
  }
  return sum / 9.0;
}

@compute @workgroup_size(16, 16)
fn diffuse(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= P.size)) { return; }
  let i = id.y * P.size.x + id.x;
  let ground = terrain[i];
  let food = select(0.0, P.foodAmount, ground.w < 0.0);
  let deposited = f32(atomicLoad(&deposit[i])) * P.depositAmount;
  let v = (blur(vec2i(id.xy)) + deposited + food) * (1.0 - P.decay);
  trailOut[i] = select(0.0, v, ground.x > 0.0);
  atomicStore(&deposit[i], 0u);
}

struct View {
  gridSize: vec2f,
  canvasSize: vec2f,
  trailScale: f32,
}

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<storage, read> printTrail: array<f32>;
@group(0) @binding(2) var<storage, read> printTerrain: array<vec4f>;

const PAPER = vec3f(0.937, 0.906, 0.839);
const BLUE = vec3f(0.0, 0.47, 0.75);
const PINK = vec3f(1.0, 0.28, 0.69);

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn gridIndex(c: vec2i) -> u32 {
  let q = clamp(c, vec2i(0), vec2i(V.gridSize) - 1);
  return u32(q.y) * u32(V.gridSize.x) + u32(q.x);
}

fn sampleTrail(g: vec2f) -> f32 {
  let p = g - 0.5;
  let c = vec2i(floor(p));
  let f = fract(p);
  let a = mix(printTrail[gridIndex(c)], printTrail[gridIndex(c + vec2i(1, 0))], f.x);
  let b = mix(printTrail[gridIndex(c + vec2i(0, 1))], printTrail[gridIndex(c + vec2i(1, 1))], f.x);
  return mix(a, b, f.y);
}

fn sampleTerrain(g: vec2f) -> vec4f {
  let p = g - 0.5;
  let c = vec2i(floor(p));
  let f = fract(p);
  let a = mix(printTerrain[gridIndex(c)], printTerrain[gridIndex(c + vec2i(1, 0))], f.x);
  let b = mix(printTerrain[gridIndex(c + vec2i(0, 1))], printTerrain[gridIndex(c + vec2i(1, 1))], f.x);
  return mix(a, b, f.y);
}

fn halftone(coverage: f32, px: vec2f, angle: f32, cell: f32) -> f32 {
  let r = mat2x2f(cos(angle), sin(angle), -sin(angle), cos(angle)) * px / cell;
  let d = length(fract(r) - 0.5) * cell;
  let radius = sqrt(clamp(coverage, 0.0, 1.0)) * cell * 0.72;
  return smoothstep(radius + 0.6, radius - 0.6, d);
}

fn isoLine(u: f32, width: f32) -> f32 {
  let d = abs(fract(u + 0.5) - 0.5) / max(fwidth(u), 1e-4);
  return smoothstep(width, width - 1.0, d);
}

fn blueLayer(px: vec2f, g: vec2f, unit: f32) -> f32 {
  let t = sampleTerrain(g);
  let coastPx = t.x / unit;
  let sea = 1.0 - smoothstep(-0.5, 0.5, coastPx);

  let depth = max(-coastPx, 0.0) / (V.canvasSize.y / 720.0);
  let waterlines = isoLine(sqrt(depth) * 1.25, 0.9) * (1.0 - smoothstep(30.0, 60.0, depth));
  let seaInk = sea * max(waterlines, halftone(0.16, px, 0.26, 4.0 * V.canvasSize.y / 720.0));

  let coast = smoothstep(1.4, 0.4, abs(coastPx));
  let land = 1.0 - sea;
  let contours = land * isoLine(min(t.y, 0.97) * 9.0, 0.8) * smoothstep(0.05, 0.12, t.y) * 0.85;

  let grain = max(1.0, V.canvasSize.y / 720.0);
  let speck = step(hash2(floor(px / grain)), t.z * 0.3) * land;
  let cityRing = smoothstep(1.2, 0.3, abs(t.w / unit - 3.0));
  return max(max(seaInk, coast), max(contours, max(speck, cityRing)));
}

fn pinkLayer(px: vec2f, g: vec2f) -> f32 {
  let t = sampleTerrain(g);
  let v = sampleTrail(g);
  let c = 1.0 - exp(-v / V.trailScale);
  let solid = smoothstep(0.55, 0.8, c);
  let screen = halftone(c * 0.9, px, 1.31, 3.0 * V.canvasSize.y / 720.0);
  let city = smoothstep(0.6, -0.6, t.w);
  return max(max(solid, screen), city);
}

fn inkTexture(px: vec2f, seed: f32) -> f32 {
  let n = hash2(floor(px * 0.5) + seed);
  return 0.82 + 0.18 * n;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let px = frag.xy;
  let unit = min(V.gridSize.x / V.canvasSize.x, V.gridSize.y / V.canvasSize.y);
  let toGrid = (px - V.canvasSize * 0.5) * unit + V.gridSize * 0.5;
  let shift = vec2f(1.6, -1.1) * V.canvasSize.y / 720.0;

  let blue = blueLayer(px, toGrid, unit) * inkTexture(px, 0.0);
  let pink = pinkLayer(px, (px + shift - V.canvasSize * 0.5) * unit + V.gridSize * 0.5) * inkTexture(px, 7.0) * 0.95;

  let fibre = 0.97 + 0.03 * hash2(floor(px / 2.0) + 3.0);
  let color = PAPER * fibre * mix(vec3f(1.0), BLUE, blue) * mix(vec3f(1.0), PINK, pink);
  return vec4f(color, 1.0);
}
