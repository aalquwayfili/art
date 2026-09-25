struct U {
  time: f32,
  aspect: f32,
  count: u32,
  windRes: u32,
  segments: u32,
  radius: f32,
  screen: vec2f,
  frame: vec2f,
}

struct Blade {
  base: vec4f,
  look: vec4f,
}

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> blades: array<Blade>;
@group(0) @binding(2) var<storage, read_write> wind: array<vec4f>;
@group(0) @binding(3) var<storage, read> bladesIn: array<Blade>;
@group(0) @binding(4) var<storage, read> windIn: array<vec4f>;
@group(0) @binding(5) var image: texture_2d<f32>;
@group(0) @binding(6) var linearSampler: sampler;

const PI = 3.14159265;
const EYE = vec3f(0.0, 1.1, 13.0);
const LOOK = vec3f(0.0, 6.0, -15.0);
const FOV = 0.87;
const SUN = vec3f(0.79, 0.58, -0.2);
const TREE = vec2f(0.6, -15.0);
const WIND_MIN = vec2f(-40.0, -42.0);
const WIND_SIZE = vec2f(80.0, 58.0);
const GUST = vec2f(0.94, 0.34);

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967296.0;
}

fn noise(p: vec2f) -> f32 {
  let i = vec2u(vec2i(floor(p)) + 65536);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let h = i.x * 73856093u + i.y * 19349663u;
  let a = hash(h);
  let b = hash(h + 73856093u);
  let c = hash(h + 19349663u);
  let d = hash(h + 73856093u + 19349663u);
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var o = 0; o < 4; o++) {
    s += a * noise(q);
    q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(5.2, 1.3);
    a *= 0.5;
  }
  return s;
}

fn hill(p: vec2f) -> f32 {
  let crest = 5.4 * (1.0 - 0.0005 * p.x * p.x) + 0.5 * sin(p.x * 0.09 + 0.8);
  let behind = select(13.0, 7.0, p.y < -15.0);
  return crest * exp(-pow((p.y + 15.0) / behind, 2.0)) + 0.35 * fbm(p * 0.07) - 0.2;
}

fn toClip(w: vec3f) -> vec4f {
  let f = normalize(LOOK - EYE);
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  let v = (w - EYE) * mat3x3f(r, cross(r, f), f);
  let focal = 1.0 / tan(0.5 * FOV);
  let near = 0.05;
  let far = 400.0;
  return vec4f(v.x * focal / u.aspect, v.y * focal, (v.z - near) * far / (far - near), v.z);
}

@compute @workgroup_size(256)
fn grow(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.count) { return; }
  let rows = u.count / 1024u;
  let cell = vec2f(f32(i % 1024u) + hash(i * 3u), f32(i / 1024u) + hash(i * 3u + 1u)) / vec2f(1024.0, f32(rows));
  let z = 12.5 - 29.0 * pow(cell.y, 0.75);
  let halfWidth = 2.5 + (13.0 - z) * 0.95;
  let x = (2.0 * cell.x - 1.0) * halfWidth;
  let meadow = fbm(vec2f(x, z) * 0.12);
  let height = (0.3 + 0.4 * hash(i * 3u + 2u)) * (0.7 + 0.7 * meadow);
  blades[i] = Blade(vec4f(x, hill(vec2f(x, z)), z, height),
                    vec4f(2.0 * PI * hash(i * 7u), 0.03 + 0.025 * hash(i * 7u + 1u), meadow + 0.3 * hash(i * 7u + 2u),
                          0.7 + 0.6 * hash(i * 7u + 3u)));
}

@compute @workgroup_size(8, 8)
fn blow(@builtin(global_invocation_id) id: vec3u) {
  let n = u.windRes;
  if (id.x >= n || id.y >= n) { return; }
  let p = WIND_MIN + (vec2f(id.xy) + 0.5) / f32(n) * WIND_SIZE;
  let dir = normalize(GUST);
  let side = vec2f(-dir.y, dir.x);
  let q = p - dir * u.time * 6.0;
  let front = fbm(vec2f(dot(q, dir) * 0.2, dot(q, side) * 0.07));
  let gust = smoothstep(0.52, 0.7, front);
  let swirl = fbm(q * 0.05 + vec2f(9.1, 3.3)) - 0.5;
  let v = dir * (0.25 + 1.2 * gust) + side * 0.5 * swirl;
  let cloud = smoothstep(0.5, 0.58, fbm((p - dir * u.time * 1.6) * 0.05 + vec2f(3.0, 8.0)));
  wind[id.y * n + id.x] = vec4f(v, gust, cloud);
}

fn windAt(p: vec2f) -> vec4f {
  let n = u.windRes;
  let g = clamp((p - WIND_MIN) / WIND_SIZE * f32(n) - 0.5, vec2f(0.0), vec2f(f32(n) - 1.001));
  let i = vec2u(g);
  let f = fract(g);
  let j = min(i + 1u, vec2u(n - 1u));
  return mix(mix(windIn[i.y * n + i.x], windIn[i.y * n + j.x], f.x),
             mix(windIn[j.y * n + i.x], windIn[j.y * n + j.x], f.x), f.y);
}

struct Paint {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) albedo: vec3f,
  @location(3) extra: vec4f,
  @location(4) @interpolate(flat) kind: u32,
}

@vertex
fn vsGrass(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Paint {
  let b = bladesIn[i];
  let level = min(v / 2u, u.segments);
  let t = f32(level) / f32(u.segments);
  let side = select(-0.5, 0.5, v % 2u == 1u) * f32(level < u.segments);
  let w = windAt(b.base.xz);
  let flutter = 0.18 * (0.3 + w.z) * sin(u.time * 7.0 + b.look.x * 5.0 + b.base.x * 0.7);
  let lean = w.xy * 0.55 / b.look.w + 0.25 * vec2f(cos(b.look.x), sin(b.look.x)) + flutter * normalize(GUST);
  let a = min(length(lean), 1.25);
  let d = lean / max(length(lean), 1e-4);
  let h = b.base.w;
  let p1 = vec3f(0.0, h, 0.0);
  let p2 = vec3f(d.x * a * h * 0.9, h * (1.0 - 0.45 * a * a), d.y * a * h * 0.9);
  let along = 2.0 * (1.0 - t) * t * p1 + t * t * p2;
  let tangent = normalize(2.0 * (1.0 - t) * p1 + 2.0 * t * (p2 - p1) + vec3f(0.0, 1e-3, 0.0));
  let across = vec3f(cos(b.look.x + 1.3), 0.0, sin(b.look.x + 1.3));
  let world = b.base.xyz + along + across * side * b.look.y * (1.0 - t * 0.85);
  let normal = normalize(cross(across, tangent) + vec3f(0.0, 0.6, 0.0));

  let tint = b.look.z;
  var albedo = mix(vec3f(0.04, 0.19, 0.07), vec3f(0.28, 0.52, 0.12), clamp(tint, 0.0, 1.0));
  albedo = mix(albedo, vec3f(0.55, 0.62, 0.2), smoothstep(0.95, 1.25, tint));
  return Paint(toClip(world), world, normal, albedo, vec4f(t, w.z, w.w, 0.35 + 0.65 * t), 0u);
}

@vertex
fn vsHill(@builtin(vertex_index) v: u32) -> Paint {
  var corners = array(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let quad = v / 6u;
  let cell = vec2f(vec2u(quad % 160u, quad / 160u) + corners[v % 6u]) / 160.0;
  let p = vec2f(mix(-70.0, 70.0, cell.x), mix(16.0, -60.0, cell.y));
  let e = 0.2;
  let normal = normalize(vec3f(hill(p - vec2f(e, 0.0)) - hill(p + vec2f(e, 0.0)), 2.0 * e,
                               hill(p - vec2f(0.0, e)) - hill(p + vec2f(0.0, e))));
  let world = vec3f(p.x, hill(p), p.y);
  return Paint(toClip(world), world, normal, vec3f(0.12, 0.24, 0.07), vec4f(0.0, 0.0, windAt(p).w, 0.4), 1u);
}

@vertex
fn vsTree(@builtin(vertex_index) v: u32, @builtin(instance_index) k: u32) -> Paint {
  var corners = array(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let cell = vec2u((v / 6u) % 14u, (v / 6u) / 14u) + corners[v % 6u];
  let lon = f32(cell.x) * 2.0 * PI / 14.0;
  let lat = f32(cell.y) * PI / 9.0 - 0.5 * PI;
  let n = vec3f(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  let ground = vec3f(TREE.x, hill(TREE) - 0.1, TREE.y);
  let w = windAt(TREE);
  var centre = ground + vec3f(0.15, 1.2, 0.0);
  var radii = vec3f(0.2, 1.35, 0.2);
  var albedo = vec3f(0.2, 0.14, 0.1);
  var kind = 3u;
  var tilt = 0.08;
  if (k == 1u || k == 2u) {
    let side = select(-1.0, 1.0, k == 1u);
    centre = ground + vec3f(0.25 + 0.55 * side, 2.55, 0.1 * side);
    radii = vec3f(0.1, 0.75, 0.1);
    tilt = -0.75 * side;
  } else if (k > 2u) {
    let a = f32(k) * 2.39996;
    let r = sqrt(hash(k * 5u));
    let lift = 3.25 + 1.1 * hash(k * 5u + 1u) * (1.0 - 0.6 * r * r);
    centre = ground + vec3f(0.35 + 2.3 * r * cos(a), lift, 1.2 * r * sin(a));
    radii = vec3f(0.5 + 0.3 * hash(k * 5u + 2u)) * vec3f(1.1, 0.75, 1.0);
    albedo = mix(vec3f(0.12, 0.27, 0.08), vec3f(0.24, 0.4, 0.1), hash(k * 5u + 3u));
    kind = 2u;
    tilt = 0.0;
  }
  let bumpy = select(1.0, 0.82 + 0.3 * hash(k * 131u + (cell.x % 14u) * 17u + cell.y), kind == 2u);
  var p = n * radii * bumpy;
  p = vec3f(p.x * cos(tilt) - p.y * sin(tilt), p.x * sin(tilt) + p.y * cos(tilt), p.z);
  let normal = normalize(n / radii);
  let height = centre.y + p.y - ground.y;
  let sway = (w.xy * 0.06 + 0.04 * sin(u.time * 2.3 + f32(k)) * (0.3 + w.z)) * height * 0.25;
  let world = centre + p + vec3f(sway.x, 0.0, sway.y);
  let n2 = vec3f(normal.x * cos(tilt) - normal.y * sin(tilt), normal.x * sin(tilt) + normal.y * cos(tilt), normal.z);
  return Paint(toClip(world), world, n2, albedo, vec4f(1.0, w.z, w.w, select(1.0, 0.7 + 0.3 * n.y, kind == 2u)), kind);
}

fn skyColor(rd: vec3f) -> vec3f {
  let h = clamp(rd.y, 0.0, 1.0);
  return mix(vec3f(0.55, 0.74, 0.9), vec3f(0.05, 0.26, 0.7), pow(h, 0.55));
}

@fragment
fn fsScene(in: Paint) -> @location(0) vec4f {
  let view = normalize(in.world - EYE);
  var n = normalize(in.normal);
  if (in.kind == 0u && dot(n, view) > 0.0) { n = normalize(n - 2.0 * dot(n, view) * view); }
  let sunColour = vec3f(1.15, 1.02, 0.84) * (1.0 - 0.55 * in.extra.z);
  let skyLight = vec3f(0.36, 0.46, 0.62);
  var ndl = dot(n, SUN);
  var albedo = in.albedo;
  if (in.kind >= 2u) {
    ndl = smoothstep(-0.1, 0.25, ndl) * 0.6 + smoothstep(0.45, 0.7, ndl) * 0.4;
  } else {
    ndl = ndl * 0.5 + 0.5;
    albedo = mix(albedo, vec3f(0.66, 0.84, 0.44), 0.9 * in.extra.y * (0.3 + 0.7 * in.extra.x));
  }
  var c = albedo * (sunColour * max(ndl, 0.0) + skyLight * (0.45 + 0.35 * n.y)) * in.extra.w;
  let dist = length(in.world - EYE);
  c *= mix(0.72, 1.0, smoothstep(2.0, 12.0, dist));
  let haze = 1.0 - exp(-dist * 0.005);
  c = mix(c, skyColor(vec3f(view.x, 0.05, view.z)), haze);
  return vec4f(c, 1.0);
}

struct Full { @builtin(position) clip: vec4f }

@vertex
fn vsFull(@builtin(vertex_index) v: u32) -> Full {
  let p = vec2f(f32((v << 1u) & 2u), f32(v & 2u));
  return Full(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}

const CLOUDS = array(vec4f(-0.62, 0.1, 0.2, 0.75), vec4f(0.34, 0.12, 0.22, 1.0), vec4f(0.95, 0.11, 0.16, 0.8),
                     vec4f(-1.25, 0.14, 0.14, 0.6), vec4f(-0.08, 0.26, 0.07, 0.5));

fn cloud(q: vec2f, k: u32, drift: f32) -> vec2f {
  let spec = CLOUDS[k];
  let base = vec2f(spec.x + drift, spec.y);
  let size = spec.z;
  var cover = 0.0;
  var weight = 0.0;
  var normal = vec3f(0.0);
  for (var b = 0u; b < 16u; b++) {
    let tier = select(select(select(0u, 1u, b >= 7u), 2u, b >= 12u), 3u, b >= 15u);
    let first = array(0u, 7u, 12u, 15u)[tier];
    let count = array(7.0, 5.0, 3.0, 1.0)[tier];
    let t = f32(tier);
    let j = (f32(b - first) + 0.5) / count - 0.5;
    let c = base + size * vec2f(j * (2.3 - 0.6 * t) + 0.3 * (hash(k * 41u + b) - 0.5),
                                0.3 + t * 0.42 * spec.w + 0.2 * hash(k * 17u + b));
    let r = size * (0.5 - 0.05 * t) * (0.8 + 0.4 * hash(k * 23u + b));
    let d = (q - c) / r;
    let dd = dot(d, d);
    cover = max(cover, 1.0 - dd);
    if (dd < 1.0) {
      let height = sqrt(1.0 - dd) * r - 0.5 * (c.y - base.y);
      let w = exp(clamp(height / (0.08 * size), -30.0, 30.0));
      weight += w;
      normal += w * vec3f(d, sqrt(1.0 - dd));
    }
  }
  var n = normalize(normal + vec3f(0.0, 0.0, 1e-4));
  n = normalize(n + vec3f(fbm(q * 28.0 + f32(k)) - 0.5, fbm(q * 28.0 + 9.0) - 0.5, 0.0) * 0.8);
  let flatBase = smoothstep(base.y - 0.005, base.y + 0.02, q.y);
  let rise = clamp((q.y - base.y) / (size * 1.4), 0.0, 1.0);
  return vec2f(cover * flatBase, dot(n, normalize(vec3f(0.7, 0.45, 0.55))) + 0.45 * rise - 0.25);
}

@fragment
fn fsSky(in: Full) -> @location(0) vec4f {
  let ndc = vec2f(in.clip.x / u.frame.x * 2.0 - 1.0, 1.0 - in.clip.y / u.frame.y * 2.0);
  let f = normalize(LOOK - EYE);
  let r = normalize(cross(f, vec3f(0.0, 1.0, 0.0)));
  let t = tan(0.5 * FOV);
  let rd = normalize(f + r * ndc.x * t * u.aspect + cross(r, f) * ndc.y * t);
  var c = skyColor(rd);
  let q = vec2f(atan2(rd.x, -rd.z), asin(rd.y));
  for (var k = 0u; k < 5u; k++) {
    let cl = cloud(q, k, u.time * 0.002 * (1.0 + 0.4 * f32(k)));
    let edge = 0.12 * (fbm(q * 45.0 + f32(k) * 7.0) - 0.5);
    let body = smoothstep(0.06, 0.12, cl.x + edge);
    let lit = cl.y;
    let col = mix(mix(vec3f(0.24, 0.3, 0.46), vec3f(0.55, 0.6, 0.7), smoothstep(0.05, 0.3, lit)),
                  vec3f(1.0, 0.95, 0.86), smoothstep(0.5, 0.65, lit));
    c = mix(c, col, body);
  }
  return vec4f(c, 1.0);
}

@fragment
fn fsPaint(in: Full) -> @location(0) vec4f {
  let p = vec2i(in.clip.xy);
  let r = i32(u.radius);
  let top = vec2i(textureDimensions(image)) - 1;
  var best = vec3f(0.0);
  var bestSpread = 1e9;
  for (var quadrant = 0; quadrant < 4; quadrant++) {
    let o = vec2i(select(-r, 0, quadrant % 2 == 1), select(-r, 0, quadrant / 2 == 1));
    var sum = vec3f(0.0);
    var sum2 = vec3f(0.0);
    for (var y = 0; y <= r; y++) {
      for (var x = 0; x <= r; x++) {
        let c = textureLoad(image, clamp(p + o + vec2i(x, y), vec2i(0), top), 0).rgb;
        sum += c;
        sum2 += c * c;
      }
    }
    let n = f32((r + 1) * (r + 1));
    let mean = sum / n;
    let spread = dot(sum2 / n - mean * mean, vec3f(0.3, 0.59, 0.11));
    if (spread < bestSpread) { bestSpread = spread; best = mean; }
  }
  return vec4f(best, 1.0);
}

@fragment
fn fsPaper(in: Full) -> @location(0) vec4f {
  var c = textureSampleLevel(image, linearSampler, in.clip.xy / u.screen, 0.0).rgb;
  let p = in.clip.xy / u.screen.y * 900.0;
  let fibres = fbm(p * vec2f(0.9, 0.25)) - 0.5;
  let tooth = noise(p * 1.7) - 0.5;
  let blotch = fbm(p * 0.01) - 0.5;
  c *= 1.0 + 0.1 * fibres + 0.08 * tooth + 0.12 * blotch;
    c = pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)) * vec3f(1.0, 0.985, 0.95) + vec3f(0.012, 0.01, 0.0);
  return vec4f(c, 1.0);
}
