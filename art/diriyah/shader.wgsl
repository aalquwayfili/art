const GRID = vec3i(128, 64, 128);
const PI = 3.14159265;

fn pcg3(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

fn rand3(v: vec3i, salt: i32) -> vec3f { return vec3f(pcg3(bitcast<vec3u>(v + vec3i(0, 0, salt * 7919)))) / 4294967295.0; }

fn noise(p: vec2f) -> f32 {
  let i = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = rand3(vec3i(i, 0), 1).x;
  let b = rand3(vec3i(i + vec2i(1, 0), 0), 1).x;
  let c = rand3(vec3i(i + vec2i(0, 1), 0), 1).x;
  let d = rand3(vec3i(i + vec2i(1, 1), 0), 1).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const AIR = 0u;
const SAND = 1u;
const ROCK = 2u;
const ROCK_DARK = 3u;
const EARTH = 4u;
const GRAVEL = 5u;
const WATER = 6u;
const MUD = 7u;
const MUD_PALE = 8u;
const TRIM = 9u;
const WINDOW = 10u;
const DOOR = 11u;
const TRUNK = 12u;
const FROND = 13u;
const SHRUB = 14u;

@group(0) @binding(0) var voxelsOut: texture_storage_3d<r32uint, write>;

const MESA = vec2f(58.0, 56.0);
const MESA_TOP = 27;
const FLOOR = 11.0;
const LOT = 10;

fn mesaEdge(p: vec2f) -> f32 {
  let d = p - MESA;
  let a = atan2(d.y, d.x);
  return length(d) - (33.0 + 2.5 * sin(3.0 * a + 1.0) + 1.5 * sin(5.0 * a + 2.3) + 2.0 * noise(p * 0.15));
}

fn wadiDistance(p: vec2f) -> f32 {
  let along = (p.x - p.y) * 0.7071;
  let across = (p.x + p.y) * 0.7071;
  return abs(across - 132.0 - 6.0 * sin(along * 0.06 + 0.5) - 2.5 * sin(along * 0.15));
}

fn ground(p: vec2f) -> f32 {
  var h = FLOOR + 1.8 * noise(p * 0.05) + 0.4 * noise(p * 0.17 + 7.0);
  h = mix(FLOOR - 4.5, h, smoothstep(3.0, 8.0, wadiDistance(p)));
  let d = mesaEdge(p);
  if (d < 0.0) { return f32(MESA_TOP) + select(0.0, 1.0, noise(p * 0.3) > 0.72); }
  return max(h, f32(MESA_TOP) - 8.0 - 1.5 * d);
}

fn palmAt(cell: vec2i) -> vec4f {
  let r = rand3(vec3i(cell, 0), 3);
  let base = (vec2f(cell) + 0.3 + 0.4 * r.xy) * 6.0;
  let w = wadiDistance(base);
  if (w < 3.0 || w > 14.0 || mesaEdge(base) < 3.0 || r.z < 0.45) { return vec4f(0.0); }
  return vec4f(base, 7.0 + 5.0 * fract(r.z * 7.3), r.x);
}

fn palm(p: vec3f) -> u32 {
  let cell = vec2i(floor(p.xz / 6.0));
  for (var dz = -2; dz <= 2; dz++) {
    for (var dx = -2; dx <= 2; dx++) {
      let q = palmAt(cell + vec2i(dx, dz));
      if (q.z == 0.0) { continue; }
      let base = floor(ground(q.xy));
      let up = (p.y - base) / q.z;
      let lean = vec2f(cos(q.w * 6.28), sin(q.w * 6.28)) * 2.2 * up * up;
      let top = q.xy + vec2f(cos(q.w * 6.28), sin(q.w * 6.28)) * 2.2;
      let crown = vec3f(top.x, base + q.z, top.y);
      if (up >= 0.0 && up <= 1.0 && length(p.xz - q.xy - lean) < 0.75) { return TRUNK; }
      let r = length(p.xz - crown.xz);
      let droop = crown.y + 0.8 + 0.5 * r - 0.2 * r * r;
      if (r < 5.0 && abs(p.y - droop) < 0.6) {
        let a = atan2(p.z - crown.z, p.x - crown.x) / (2.0 * PI) * 7.0 + q.w * 3.0;
        if (abs(fract(a + 0.5) - 0.5) * (2.0 * PI / 7.0) * r < 0.5 || r < 0.8) { return FROND; }
      }
    }
  }
  return AIR;
}

fn merlon(along: i32) -> i32 { return array<i32, 4>(0, 1, 2, 1)[((along % 4) + 4) % 4]; }

fn house(v: vec3i) -> u32 {
  let cell = vec2i(floor(vec2f(v.xz) / f32(LOT)));
  let r = rand3(vec3i(cell, 0), 5);
  let r2 = rand3(vec3i(cell, 0), 6);
  let c = cell * LOT + LOT / 2 + vec2i(floor(r2.xy * 2.99)) - 1;
  if (mesaEdge(vec2f(c)) > -8.0 || r.x < 0.2) { return AIR; }
  let base = MESA_TOP;
  let y = v.y - base;
  let rel = v.xz - c;
  if (r.x < 0.27) {
    let rad = 3.3 - 0.06 * f32(y);
    let d = length(vec2f(rel));
    let top = 17;
    if (y < -3 || y > top + 2 || d > rad + 0.5) { return AIR; }
    let along = i32(floor((atan2(f32(rel.y), f32(rel.x)) / (2.0 * PI) + 0.5) * 24.0));
    if (y >= top) {
      if (d < rad - 0.6) { return AIR; }
      return select(AIR, MUD_PALE, y - top < merlon(along) + 1);
    }
    if (y % 5 == 3 && along % 6 == 0 && d > rad - 0.6) { return WINDOW | (u32(cell.x * 31 + cell.y * 17 + y) << 8u); }
    return select(MUD, TRIM, y == top - 1);
  }
  let half = vec2i(2, 2) + vec2i(floor(r.yz * 2.99));
  let a = abs(rel);
  if (any(a > half)) { return AIR; }
  let height = 4 * (1 + i32(floor(r2.z * 2.99))) + 1;
  if (y < -3 || y >= height + 3) { return AIR; }
  let edge = a.x == half.x || a.y == half.y;
  let corner = a.x == half.x && a.y == half.y;
  let along = select(rel.x, rel.y, a.x == half.x);
  let wall = select(MUD, MUD_PALE, r2.x > 0.5);
  if (y >= height) {
    if (!edge) { return AIR; }
    let tooth = select(merlon(along), 2, corner);
    return select(AIR, MUD_PALE, y - height < tooth + 1);
  }
  if (!edge || corner) { return wall; }
  if (y == height - 2 && abs(along) % 2 == 0) { return TRIM; }
  if (y % 4 == 2 && abs(along) < half.x + half.y && (along + i32(r.z * 7.0)) % 3 == 0) {
    return WINDOW | (u32(v.x * 131 + v.y * 71 + v.z * 37) << 8u);
  }
  if (y < 2 && along == 0 && rel.y == half.y) { return DOOR; }
  return wall;
}

fn townWall(v: vec3i) -> u32 {
  let y = v.y - MESA_TOP;
  if (y < -2 || y > 9) { return AIR; }
  let p = vec2f(v.xz) + 0.5;
  let d = mesaEdge(p);
  let ang = atan2(p.y - MESA.y, p.x - MESA.x);
  let k = round((ang - 0.4) / (2.0 * PI / 7.0));
  let ta = 0.4 + k * 2.0 * PI / 7.0;
  let dir = vec2f(cos(ta), sin(ta));
  var tp = MESA + dir * 30.0;
  for (var i = 0; i < 4; i++) { tp -= dir * (mesaEdge(tp) + 2.5); }
  let td = length(p - tp);
  if (td < 2.6) {
    if (y >= 8) { return select(AIR, TRIM, td > 1.7 && y - 8 < merlon(i32(floor(ang * 40.0))) + 1); }
    if (y == 5 && td > 1.9 && i32(floor(ang * 40.0)) % 3 == 0) { return WINDOW | (u32(k + 9.0) << 12u); }
    return MUD;
  }
  if (d < -2.6 || d > -1.4) { return AIR; }
  let along = i32(floor(ang * 34.0));
  if (abs(ang - 0.785) < 0.07) { return AIR; }
  if (y < 4) { return MUD; }
  return select(AIR, MUD, y - 4 < merlon(along) + 1);
}

@compute @workgroup_size(4, 4, 4)
fn buildVoxels(@builtin(global_invocation_id) g: vec3u) {
  let v = vec3i(g);
  if (any(v >= GRID)) { return; }
  let p = vec3f(v) + 0.5;
  let h = ground(p.xz);
  var m = AIR;
  if (p.y < h) {
    let w = wadiDistance(p.xz);
    let top = p.y > h - 1.0;
    let band = i32(floor(p.y / 2.5 + 0.8 * noise(p.xz * 0.1)));
    m = select(ROCK, ROCK_DARK, band % 2 == 0);
    if (p.y > h - 3.0 && mesaEdge(p.xz) > 0.0) { m = SAND; }
    if (top) {
      if (mesaEdge(p.xz) < 0.0) { m = EARTH; }
      else if (w < 1.2) { m = WATER; }
      else if (w < 5.5) { m = GRAVEL; }
      else if (p.y > f32(MESA_TOP) - 9.0) { m = ROCK; }
      else { m = SAND; }
    }
  } else if (p.y < h + 1.0 && wadiDistance(p.xz) < 11.0 && wadiDistance(p.xz) > 2.0 && noise(p.xz * 0.45) > 0.66) {
    m = SHRUB;
  } else {
    let w = wadiDistance(p.xz);
    if (w < 20.0 && p.y < FLOOR + 16.0) { m = palm(p); }
    if (m == AIR && v.y >= MESA_TOP - 3) {
      m = townWall(v);
      if (m == AIR) { m = house(v); }
    }
  }
  textureStore(voxelsOut, v, vec4u(m, 0u, 0u, 0u));
}

struct Frame {
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  centre: vec4f,
  light: vec4f,
  lightColor: vec4f,
  ambient: vec4f,
  skyTop: vec4f,
  skyLow: vec4f,
  size: vec4f,
}

@group(0) @binding(1) var voxels: texture_3d<u32>;
@group(0) @binding(2) var<uniform> frame: Frame;
@group(0) @binding(3) var pixelsOut: texture_storage_2d<rgba8unorm, write>;

fn voxel(c: vec3i) -> u32 {
  if (any(c < vec3i(0)) || any(c >= GRID)) { return AIR; }
  return textureLoad(voxels, c, 0).r;
}

struct Hit { cell: vec3i, normal: vec3i, t: f32, material: u32 }

fn trace(ro: vec3f, rd0: vec3f, maxSteps: i32) -> Hit {
  let rd = select(rd0, vec3f(1e-6), abs(rd0) < vec3f(1e-6));
  let inv = 1.0 / rd;
  let t0 = (vec3f(0.0) - ro) * inv;
  let t1 = (vec3f(GRID) - ro) * inv;
  let tNear = min(t0, t1);
  let tFar = max(t0, t1);
  let enter = max(max(tNear.x, tNear.y), max(tNear.z, 0.0));
  let leave = min(tFar.x, min(tFar.y, tFar.z));
  var hit = Hit(vec3i(0), vec3i(0), 0.0, AIR);
  if (leave <= enter) { return hit; }
  let step = vec3i(sign(rd));
  var cell = clamp(vec3i(floor(ro + rd * (enter + 1e-4))), vec3i(0), GRID - 1);
  var tNext = (vec3f(cell) + select(vec3f(0.0), vec3f(1.0), step > vec3i(0)) - ro) * inv;
  let tDelta = abs(inv);
  var normal = -step * vec3i(tNear == vec3f(enter));
  var t = enter;
  for (var i = 0; i < maxSteps; i++) {
    let m = textureLoad(voxels, cell, 0).r;
    if (m != AIR) { return Hit(cell, normal, t, m); }
    if (tNext.x < tNext.y && tNext.x < tNext.z) {
      cell.x += step.x; t = tNext.x; tNext.x += tDelta.x; normal = vec3i(-step.x, 0, 0);
    } else if (tNext.y < tNext.z) {
      cell.y += step.y; t = tNext.y; tNext.y += tDelta.y; normal = vec3i(0, -step.y, 0);
    } else {
      cell.z += step.z; t = tNext.z; tNext.z += tDelta.z; normal = vec3i(0, 0, -step.z);
    }
    if (any(cell < vec3i(0)) || any(cell >= GRID)) { break; }
  }
  return hit;
}

fn occlusion(air: vec3i, n: vec3i, f: vec2f) -> f32 {
  let t1 = select(vec3i(1, 0, 0), vec3i(0, 1, 0), n.x != 0);
  let t2 = select(vec3i(0, 0, 1), vec3i(0, 1, 0), n.z != 0);
  var corners = vec4f(0.0);
  for (var k = 0; k < 4; k++) {
    let s1 = select(-1, 1, (k & 1) == 1);
    let s2 = select(-1, 1, (k & 2) == 2);
    let a = f32(voxel(air + s1 * t1) != AIR);
    let b = f32(voxel(air + s2 * t2) != AIR);
    let c = f32(voxel(air + s1 * t1 + s2 * t2) != AIR);
    corners[k] = select(1.0 - (a + b + c) / 3.0, 0.0, a + b > 1.5);
  }
  return mix(mix(corners[0], corners[1], f.x), mix(corners[2], corners[3], f.x), f.y);
}

fn albedo(m: u32, cell: vec3i) -> vec3f {
  let grain = 0.94 + 0.06 * rand3(cell, 9).x;
  var c = vec3f(0.0);
  switch m & 255u {
    case SAND: { c = vec3f(0.86, 0.7, 0.49); }
    case ROCK: { c = vec3f(0.74, 0.56, 0.4); }
    case ROCK_DARK: { c = vec3f(0.6, 0.43, 0.32); }
    case EARTH: { c = vec3f(0.74, 0.6, 0.45); }
    case GRAVEL: { c = vec3f(0.66, 0.57, 0.46); }
    case WATER: { c = vec3f(0.22, 0.3, 0.38); }
    case MUD: { c = vec3f(0.82, 0.63, 0.45); }
    case MUD_PALE: { c = vec3f(0.92, 0.8, 0.64); }
    case TRIM: { c = vec3f(0.56, 0.4, 0.3); }
    case WINDOW: { c = vec3f(0.16, 0.11, 0.1); }
    case DOOR: { c = vec3f(0.33, 0.21, 0.14); }
    case TRUNK: { c = vec3f(0.46, 0.33, 0.24); }
    case FROND: { c = vec3f(0.34, 0.47, 0.25); }
    case SHRUB: { c = vec3f(0.5, 0.54, 0.31); }
    default: { c = vec3f(1.0, 0.0, 1.0); }
  }
  return c * grain;
}

fn sky(px: vec2f) -> vec3f {
  let uv = px / frame.size.xy;
  var c = mix(frame.skyTop.rgb, frame.skyLow.rgb, smoothstep(0.0, 1.0, uv.y));
  let s = vec2i(floor(px + vec2f(frame.up.w * 160.0, 0.0)));
  let r = rand3(vec3i(s, 0), 11);
  let twinkle = 0.75 + 0.25 * sin(frame.right.w * (2.0 + 3.0 * r.z) + r.y * 40.0);
  if (r.x > 1.0 - 0.006 * frame.centre.w * (1.0 - uv.y * 0.7)) { c = mix(c, vec3f(1.0, 0.95, 0.85), twinkle * frame.centre.w); }
  let night = frame.forward.w;
  let moon = vec2f(0.7 + 0.1 * night, 0.34 - 0.14 * night) * frame.size.xy;
  let d = px - moon;
  let rad = frame.size.y * 0.028;
  if (length(d) < rad && length(d - vec2f(rad * 0.45, -rad * 0.2)) > rad * 0.92) { c = mix(c, vec3f(1.0, 0.94, 0.78), frame.centre.w); }
  return c;
}

var<private> PALETTE: array<vec3f, 32> = array<vec3f, 32>(
  vec3f(0.039, 0.051, 0.11), vec3f(0.071, 0.094, 0.2), vec3f(0.114, 0.145, 0.278), vec3f(0.173, 0.208, 0.376),
  vec3f(0.294, 0.247, 0.42), vec3f(0.478, 0.333, 0.47), vec3f(0.72, 0.42, 0.42), vec3f(0.878, 0.537, 0.353),
  vec3f(0.949, 0.698, 0.42), vec3f(0.663, 0.765, 0.816), vec3f(0.843, 0.863, 0.816), vec3f(1.0, 0.816, 0.478),
  vec3f(1.0, 0.949, 0.812), vec3f(0.945, 0.843, 0.659), vec3f(0.863, 0.71, 0.518), vec3f(0.769, 0.604, 0.424),
  vec3f(0.651, 0.486, 0.333), vec3f(0.522, 0.376, 0.247), vec3f(0.388, 0.275, 0.192), vec3f(0.271, 0.188, 0.165),
  vec3f(0.173, 0.125, 0.137), vec3f(0.353, 0.29, 0.345), vec3f(0.227, 0.204, 0.282), vec3f(0.149, 0.133, 0.212),
  vec3f(0.498, 0.604, 0.333), vec3f(0.337, 0.439, 0.247), vec3f(0.212, 0.286, 0.18), vec3f(0.133, 0.188, 0.122),
  vec3f(0.239, 0.353, 0.439), vec3f(0.55, 0.45, 0.36), vec3f(0.49, 0.62, 0.76), vec3f(0.35, 0.44, 0.63));

fn toPalette(c: vec3f, px: vec2u) -> vec3f {
  let bayer = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  let b = (bayer[(px.y % 4u) * 4u + px.x % 4u] + 0.5) / 16.0 - 0.5;
  let q = c + b * 0.1;
  var best = PALETTE[0];
  var bestD = 1e9;
  for (var i = 0; i < 32; i++) {
    let e = (PALETTE[i] - q) * vec3f(1.0, 1.25, 0.8);
    let d = dot(e, e);
    if (d < bestD) { bestD = d; best = PALETTE[i]; }
  }
  return best;
}

@compute @workgroup_size(8, 8)
fn tracePixels(@builtin(global_invocation_id) g: vec3u) {
  let size = vec2u(frame.size.xy);
  if (any(g.xy >= size)) { return; }
  let px = vec2f(g.xy) + 0.5;
  let offset = px - 0.5 * frame.size.xy;
  let ro = frame.centre.xyz + frame.right.xyz * offset.x - frame.up.xyz * offset.y - frame.forward.xyz * 300.0;
  let rd = frame.forward.xyz;
  let hit = trace(ro, rd, 420);
  var color = sky(px);
  if (hit.material != AIR) {
    let n = vec3f(hit.normal);
    let p = ro + rd * hit.t;
    let local = p - vec3f(hit.cell);
    let f = select(select(local.xy, local.zy, hit.normal.x != 0), local.xz, hit.normal.y != 0);
    let ao = occlusion(hit.cell + hit.normal, hit.normal, f);
    let L = frame.light.xyz;
    var direct = max(dot(n, L), 0.0);
    if (direct > 0.0) {
      let shadow = trace(p + n * 0.01, L, 160);
      direct *= select(1.0, 0.0, shadow.material != AIR);
    }
    let m = hit.material & 255u;
    let base = albedo(m, hit.cell);
    let sideLight = 0.55 + 0.3 * n.y + 0.15 * abs(n.x);
    color = base * (frame.lightColor.rgb * direct + frame.ambient.rgb * sideLight * (0.35 + 0.65 * ao));
    if (m == WATER) { color = mix(color, frame.skyTop.rgb * 0.8 + frame.lightColor.rgb * 0.2, 0.55); }
    if (m == WINDOW) {
      let on = rand3(vec3i(i32(hit.material >> 8u), 0, 0), 13).x;
      if (frame.forward.w > 0.05 + 0.85 * on) { color = mix(vec3f(1.0, 0.72, 0.36), vec3f(1.0, 0.9, 0.62), ao); }
    }
  }
  textureStore(pixelsOut, g.xy, vec4f(toPalette(color, g.xy), 1.0));
}

@group(0) @binding(4) var pixels: texture_2d<f32>;

@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fsPresent(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(pixels));
  let q = vec2i(floor(fc.xy / frame.size.zw * size));
  return textureLoad(pixels, clamp(q, vec2i(0), vec2i(size) - 1), 0);
}
