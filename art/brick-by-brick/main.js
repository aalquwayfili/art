const query = new URLSearchParams(location.search);
const fixedTime = query.has('t') ? Number(query.get('t')) || 0 : null;
const canvas = document.getElementById('canvas');

const PERIOD = 28;
const BUILD = 12;
const REWIND = 25;
const SPAN = 19;
const FALL = 0.5;
const DROP = 10;
const PLATE = 0.4;
const GX = 64, GY = 128, GZ = 64;
const MAX_BOXES = 2048, MAX_STUDS = 8192, MAX_SHADOWS = 16;

const C = {
  TAN: 1, DTAN: 2, WHITE: 3, LGRAY: 4, DGRAY: 5, ROAD: 6, GLASS: 7, BLUEGLASS: 8, GOLD: 9, GREEN: 10,
  DGREEN: 11, BROWN: 12, YELLOW: 13, WINDOW: 14, LAMP: 15, RED: 16, BLUE: 17, POOL: 18, NOUGAT: 19,
  ORANGE: 20, SMOKE: 21, ARCH: 22,
};
const PLATE_ONLY = 1, TILE = 2;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCity() {
  const color = new Uint8Array(GX * GY * GZ);
  const kind = new Uint8Array(GX * GY * GZ);
  const at = (x, y, z) => (y * GZ + z) * GX + x;
  const inside = (x, y, z) => x >= 0 && y >= 1 && z >= 0 && x < GX && y < GY && z < GZ;
  const put = (x, y, z, c, k = 0) => { if (inside(x, y, z)) { color[at(x, y, z)] = c; kind[at(x, y, z)] = k; } };
  const fill = (x0, y0, z0, x1, y1, z1, c, k = 0) => {
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) put(x, y, z, c, k);
  };
  const rand = rng(23);

  const roadNS = x => x >= 26 && x <= 35;
  const roadEW = z => (z >= 22 && z <= 27) || (z >= 48 && z <= 53);
  const walkNS = x => x === 24 || x === 25 || x === 36 || x === 37;
  const walkEW = z => z === 20 || z === 21 || z === 28 || z === 29 || z === 46 || z === 47 || z === 54 || z === 55;
  for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
    if (roadNS(x) && (x === 30 || x === 31) && !roadEW(z)) {
      put(x, 1, z, C.LGRAY, PLATE_ONLY);
      put(x, 2, z, C.GREEN, PLATE_ONLY);
    } else if (roadNS(x) || roadEW(z)) {
      let c = C.ROAD;
      if (roadEW(z) && !roadNS(x) && (z === 24 || z === 25 || z === 50 || z === 51) && x % 4 < 2) c = C.WHITE;
      const crossNS = roadNS(x) && [18, 19, 30, 31, 44, 45, 56, 57].includes(z);
      const crossEW = roadEW(z) && [22, 23, 38, 39].includes(x);
      if ((crossNS && x % 2 === 0) || (crossEW && z % 2 === 0)) c = C.WHITE;
      put(x, 1, z, c, TILE);
    } else if (walkNS(x) || walkEW(z)) {
      put(x, 1, z, C.LGRAY, PLATE_ONLY);
      put(x, 2, z, C.LGRAY, TILE);
    }
  }

  const palm = (x, z, y0, h) => {
    for (let y = y0; y < y0 + h; y++) put(x, y, z, C.BROWN);
    const top = y0 + h;
    put(x, top, z, C.GREEN, PLATE_ONLY);
    put(x, top + 1, z, C.DGREEN, PLATE_ONLY);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      put(x + dx, top, z + dz, C.GREEN, PLATE_ONLY);
      put(x + 2 * dx, top - 1, z + 2 * dz, C.DGREEN, PLATE_ONLY);
      put(x + 3 * dx, top - 2, z + 3 * dz, C.GREEN, PLATE_ONLY);
    }
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      put(x + dx, top, z + dz, C.DGREEN, PLATE_ONLY);
      put(x + 2 * dx, top - 1, z + 2 * dz, C.GREEN, PLATE_ONLY);
    }
  };
  for (let z = 2; z < GZ; z += 7) if (!roadEW(z) && !roadEW(z + 1) && !roadEW(z - 1)) palm(30 + (z % 2), z, 3, 12 + (z % 3) * 3);

  const lamp = (x, z) => { fill(x, 3, z, x + 1, 12, z + 1, C.DGRAY); put(x, 12, z, C.LAMP, TILE); };
  for (let z = 4; z < GZ; z += 8) if (!roadEW(z) && !walkEW(z)) { lamp(25, z); lamp(36, z); }

  const tower = (x0, z0, w, d, h, c) => {
    const y0 = 2, y1 = 2 + h;
    fill(x0, y0, z0, x0 + w, y1, z0 + d, c);
    for (let y = y0; y < y1; y++) {
      if (![3, 4, 5].includes((y - y0) % 6)) continue;
      for (let x = x0 + 1; x < x0 + w - 1; x++) if ((x - x0) % 3 !== 0) { put(x, y, z0, C.WINDOW); put(x, y, z0 + d - 1, C.WINDOW); }
      for (let z = z0 + 1; z < z0 + d - 1; z++) if ((z - z0) % 3 !== 0) { put(x0, y, z, C.WINDOW); put(x0 + w - 1, y, z, C.WINDOW); }
    }
    for (let x = x0; x < x0 + w; x++) { put(x, y1, z0, C.LGRAY, PLATE_ONLY); put(x, y1, z0 + d - 1, C.LGRAY, PLATE_ONLY); }
    for (let z = z0; z < z0 + d; z++) { put(x0, y1, z, C.LGRAY, PLATE_ONLY); put(x0 + w - 1, y1, z, C.LGRAY, PLATE_ONLY); }
    const ux = x0 + 1 + Math.floor(rand() * (w - 4)), uz = z0 + 1 + Math.floor(rand() * (d - 4));
    fill(ux, y1, uz, ux + 2, y1 + 3, uz + 2, C.WHITE);
    for (let k = 0; k < 3; k++) {
      const ax = x0 + 1 + Math.floor(rand() * (w - 2)), az = z0 + 1 + Math.floor(rand() * (d - 2));
      if (!color[at(ax, y1, az)]) fill(ax, y1, az, ax + 1, y1 + 3, az + 1, C.LGRAY);
    }
  };

  fill(0, 1, 0, 24, 2, 20, C.WHITE, TILE);
  for (const [x, z] of [[2, 2], [21, 2], [2, 17], [21, 17]]) { fill(x - 1, 2, z - 1, x + 2, 3, z + 2, C.GREEN, PLATE_ONLY); palm(x, z, 3, 15); }
  {
    const cx = 12, cz = 10, y0 = 2, apex = 100;
    for (let y = y0; y < apex; y++) {
      const s = 6.5 * (1 - (y - y0) / (apex - y0));
      for (let z = 3; z < 18; z++) for (let x = 5; x < 20; x++) {
        const px = Math.abs(x + 0.5 - cx), pz = Math.abs(z + 0.5 - cz);
        if (Math.max(px, pz) > s) continue;
        const leg = Math.min(px, pz) > s - 1.5;
        put(x, y, z, leg || y % 9 === 0 ? C.LGRAY : C.GLASS);
      }
    }
    for (let y = 60; y < 72; y++) for (let z = 6; z < 15; z++) for (let x = 8; x < 17; x++) {
      if (Math.hypot(x + 0.5 - cx, (y + 0.5) * PLATE - 26.4, z + 0.5 - cz) <= 2.7) put(x, y, z, C.GOLD);
    }
    fill(11, 88, 9, 13, 104, 11, C.LGRAY);
    fill(11, 104, 9, 13, 106, 11, C.GOLD, PLATE_ONLY);
  }

  fill(38, 1, 0, 64, 2, 20, C.LGRAY, TILE);
  tower(40, 2, 8, 8, 42, C.WHITE);
  tower(50, 2, 12, 6, 27, C.TAN);
  tower(50, 10, 6, 8, 54, C.LGRAY);
  tower(58, 10, 5, 8, 18, C.DTAN);
  tower(40, 12, 8, 6, 15, C.NOUGAT);

  fill(0, 1, 30, 24, 2, 46, C.WHITE, TILE);
  {
    fill(3, 2, 32, 18, 11, 45, C.WHITE);
    for (let y = 4; y < 8; y++) {
      for (let x = 4; x < 17; x++) if (x % 3 === 1) { put(x, y, 32, C.SMOKE); put(x, y, 44, C.SMOKE); }
      for (let z = 33; z < 44; z++) if (z % 3 === 1) { put(3, y, z, C.SMOKE); put(17, y, z, C.SMOKE); }
    }
    for (let x = 3; x < 18; x++) for (const z of [32, 44]) if (x % 2 === 1) fill(x, 11, z, x + 1, 13, z + 1, C.WHITE, PLATE_ONLY);
    for (let z = 32; z < 45; z++) for (const x of [3, 17]) if (z % 2 === 0) fill(x, 11, z, x + 1, 13, z + 1, C.WHITE, PLATE_ONLY);
    for (let y = 11; y < 26; y++) for (let z = 32; z < 45; z++) for (let x = 3; x < 18; x++) {
      if (Math.hypot(x + 0.5 - 10.5, (y + 0.5) * PLATE - 4.4, z + 0.5 - 38.5) <= 5) put(x, y, z, C.WHITE);
    }
    fill(10, 16, 38, 11, 19, 39, C.GOLD);
    fill(20, 2, 31, 22, 69, 33, C.WHITE);
    for (let y = 14; y < 69; y += 12) fill(20, y, 31, 22, y + 1, 33, C.LGRAY, PLATE_ONLY);
    for (const y of [48, 60]) fill(19, y, 30, 23, y + 1, 34, C.LGRAY, PLATE_ONLY);
    fill(20, 69, 31, 22, 72, 33, C.GREEN);
    fill(20, 72, 31, 22, 73, 33, C.GOLD, PLATE_ONLY);
    for (const [x, z] of [[1, 34], [1, 42], [22, 38], [22, 43]]) palm(x, z, 2, 12);
  }

  fill(38, 1, 30, 64, 2, 46, C.LGRAY, TILE);
  {
    fill(38, 2, 31, 63, 11, 45, C.TAN);
    for (let y = 5; y < 8; y++) {
      for (let x = 38; x < 63; x++) { put(x, y, 31, C.GLASS); put(x, y, 44, C.GLASS); }
      for (let z = 31; z < 45; z++) { put(38, y, z, C.GLASS); put(62, y, z, C.GLASS); }
    }
    fill(38, 11, 31, 63, 12, 45, C.LGRAY, PLATE_ONLY);
    const cx = 50, cz = 38, y0 = 12, top = 111;
    for (let y = y0; y < top; y++) {
      const u = (y - y0) / (top - 1 - y0);
      const wo = 8 * (1 - 0.28 * u - 0.27 * u * u);
      const d = 3.6 * (1 - 0.25 * u);
      const s = (u - 0.62) / 0.38;
      const wi = s > 0 ? (wo - 1) * Math.sqrt(s) : 0;
      const bridge = u >= 0.84 && u <= 0.87;
      for (let z = 33; z < 43; z++) for (let x = 41; x < 59; x++) {
        const px = Math.abs(x + 0.5 - cx), pz = z + 0.5 - cz;
        if (px > wo || (px / wo) ** 2 + (pz / d) ** 2 > 1) continue;
        if (px < wi) { if (bridge && Math.abs(pz) < 1.2) put(x, y, z, C.ARCH); continue; }
        const edge = px > wo - 1 || (wi > 0 && px < wi + 1);
        put(x, y, z, edge ? (wi > 0 && px < wi + 1 ? C.ARCH : C.LGRAY) : y % 3 === 0 ? C.LGRAY : C.BLUEGLASS);
      }
    }
  }

  const house = (x0, z0, w, d, h, c) => {
    fill(x0, 2, z0, x0 + w, 2 + h, z0 + d, c);
    for (let x = x0; x < x0 + w; x++) if ((x - x0) % 2 === 0) { put(x, 2 + h, z0, c); put(x, 2 + h, z0 + d - 1, c); }
    for (let z = z0; z < z0 + d; z++) if ((z - z0) % 2 === 0) { put(x0, 2 + h, z, c); put(x0 + w - 1, 2 + h, z, c); }
    for (let x = x0 + 1; x < x0 + w - 1; x += 3) { put(x, 7, z0 + d - 1, C.BROWN, PLATE_ONLY); put(x, 7, z0, C.BROWN, PLATE_ONLY); }
    const door = x0 + Math.floor(w / 2) - 1;
    fill(door, 2, z0 + d - 1, door + 2, 7, z0 + d, C.BROWN);
  };
  house(1, 57, 8, 6, 9, C.DTAN);
  house(10, 58, 6, 5, 12, C.NOUGAT);
  house(17, 57, 6, 6, 6, C.TAN);
  palm(9, 63, 2, 15);
  palm(16, 56, 2, 12);

  fill(38, 1, 56, 64, 2, 64, C.GREEN, PLATE_ONLY);
  fill(43, 1, 57, 55, 2, 63, C.WHITE, TILE);
  fill(44, 1, 58, 54, 2, 62, C.POOL, TILE);
  fill(38, 1, 56, 64, 2, 57, C.TAN, TILE);
  for (const [x, z] of [[40, 59], [58, 60], [61, 58], [57, 62], [41, 62]]) palm(x, z, 2, 11 + ((x + z) % 3) * 3);

  const paint = [C.RED, C.BLUE, C.WHITE, C.YELLOW, C.DGRAY, C.ORANGE];
  for (const [x0, z0] of [[3, 22], [11, 22], [44, 22], [55, 22], [6, 52], [40, 52], [50, 52]]) {
    const c = paint[Math.floor(rand() * paint.length)];
    fill(x0, 2, z0, x0 + 1, 3, z0 + 2, C.ROAD, PLATE_ONLY);
    fill(x0 + 3, 2, z0, x0 + 4, 3, z0 + 2, C.ROAD, PLATE_ONLY);
    fill(x0, 3, z0, x0 + 4, 4, z0 + 2, C.DGRAY, PLATE_ONLY);
    fill(x0, 4, z0, x0 + 4, 6, z0 + 2, c, PLATE_ONLY);
    fill(x0 + 1, 6, z0, x0 + 3, 8, z0 + 2, C.SMOKE, PLATE_ONLY);
    fill(x0 + 1, 8, z0, x0 + 3, 9, z0 + 2, c, TILE);
  }

  const shell = new Uint8Array(color);
  for (let y = 1; y < GY; y++) for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
    const i = at(x, y, z);
    if (!color[i]) continue;
    const full = (dx, dy, dz) => {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (Y === 0) return true;
      return X >= 0 && Z >= 0 && X < GX && Z < GZ && Y < GY && color[at(X, Y, Z)] !== 0;
    };
    if (full(1, 0, 0) && full(-1, 0, 0) && full(0, 1, 0) && full(0, -1, 0) && full(0, 0, 1) && full(0, 0, -1)) shell[i] = 0;
  }

  const owner = new Int32Array(GX * GY * GZ).fill(-1);
  const list = [];
  const LONG = [[4, 2], [4, 1], [2, 4], [1, 4], [3, 1], [1, 3], [2, 2], [2, 1], [1, 2], [1, 1]];
  const WIDE = [[2, 4], [1, 4], [4, 2], [4, 1], [1, 3], [3, 1], [2, 2], [1, 2], [2, 1], [1, 1]];
  const lattice = (a, n, off) => n === 1 || Math.floor((a + off) / 4) === Math.floor((a + n - 1 + off) / 4);
  for (let y = 1; y < GY; y++) for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
    const i = at(x, y, z);
    if (!shell[i] || owner[i] >= 0) continue;
    const c = shell[i], k = kind[i];
    const odd = Math.floor(y / 3) % 2;
    const off = odd ? 2 : 0;
    const fits = (sx, sy, sz) => {
      if (x + sx > GX || y + sy > GY || z + sz > GZ) return false;
      if (!lattice(x, sx, off) || !lattice(z, sz, off)) return false;
      for (let yy = y; yy < y + sy; yy++) for (let zz = z; zz < z + sz; zz++) for (let xx = x; xx < x + sx; xx++) {
        const j = at(xx, yy, zz);
        if (shell[j] !== c || kind[j] !== k || owner[j] >= 0) return false;
      }
      return true;
    };
    let best = null;
    for (const sy of k === 0 ? [3, 1] : [1]) {
      for (const [sx, sz] of odd ? WIDE : LONG) if (fits(sx, sy, sz)) { best = [sx, sy, sz]; break; }
      if (best) break;
    }
    const [sx, sy, sz] = best;
    const id = list.length;
    for (let yy = y; yy < y + sy; yy++) for (let zz = z; zz < z + sz; zz++) for (let xx = x; xx < x + sx; xx++) owner[at(xx, yy, zz)] = id;
    list.push({ lo: [x, y, z], size: [sx, sy, sz], mat: c | (k === TILE ? 2 << 8 : 0), key: y + rand() * 0.999 });
  }

  const order = list.map((b, i) => i).sort((a, b) => list[a].key - list[b].key);
  const rank = new Int32Array(list.length);
  order.forEach((b, r) => { rank[b] = r; });
  const sorted = order.map((b, r) => ({ ...list[b], time: SPAN * r / list.length }));

  const cells = new Uint32Array(GX * GY * GZ);
  const coarse = new Uint32Array(8 * 16 * 8);
  const mark = (x, y, z) => { if (y < GY) coarse[((y >> 3) * 8 + (z >> 3)) * 8 + (x >> 3)] = 1; };
  for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) { cells[at(x, 0, z)] = 1; mark(x, 0, z); mark(x, 1, z); }
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] < 0) continue;
    cells[i] = rank[owner[i]] + 2;
    const x = i % GX, z = Math.floor(i / GX) % GZ, y = Math.floor(i / (GX * GZ));
    mark(x, y, z);
    mark(x, y + 1, z);
  }

  const data = new ArrayBuffer((sorted.length + 2) * 32);
  const f32 = new Float32Array(data), u32 = new Uint32Array(data);
  const write = (i, lo, time, size, mat) => { f32.set([...lo, time, ...size], i * 8); u32[i * 8 + 7] = mat; };
  write(1, [0, 0, 0], -1e9, [GX, 1, GZ], C.TAN);
  sorted.forEach((b, r) => write(r + 2, b.lo, b.time, b.size, b.mat));
  return { cells, coarse, bricks: data, list: sorted };
}

const smooth = x => x * x * (3 - 2 * x);
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const mix = (a, b, x) => a.map((v, i) => v + (b[i] - v) * x);

function clockAt(t) {
  if (t < BUILD) return t / BUILD * (SPAN + FALL);
  if (t < REWIND) return SPAN + FALL + 1;
  return (SPAN + FALL + 1) * (1 - smooth((t - REWIND) / (PERIOD - REWIND)));
}

function lightAt(t) {
  const phase = t < REWIND ? t / REWIND : 1 - smooth((t - REWIND) / (PERIOD - REWIND));
  const keys = [[0, 55], [0.45, 35], [0.7, 10], [0.8, 2], [0.88, -6], [1, -10]];
  let el = keys[keys.length - 1][1];
  for (let i = 1; i < keys.length; i++) {
    if (phase <= keys[i][0]) { const [x0, a] = keys[i - 1], [x1, b] = keys[i]; el = a + (b - a) * (phase - x0) / (x1 - x0); break; }
  }
  el *= Math.PI / 180;
  const az = 0.35 + 2.5 * phase;
  const sun = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const h = Math.sin(el);
  const up = clamp01(h / 0.04);
  const warm = smooth(clamp01((0.5 - h) / 0.45));
  const night = smooth(clamp01((0.06 - h) / 0.16));
  const dusk = smooth(clamp01((0.35 - h) / 0.35)) * (1 - night);
  const sunColor = mix([1.75, 1.66, 1.52], [1.7, 0.85, 0.38], warm).map(v => v * up);
  let skyTop = mix(mix([0.24, 0.36, 0.62], [0.24, 0.24, 0.42], dusk), [0.025, 0.035, 0.08], night);
  let skyLow = mix(mix([0.5, 0.52, 0.55], [0.75, 0.42, 0.28], dusk), [0.08, 0.065, 0.1], night);
  return { sun, sunColor, skyTop, skyLow, night, exposure: 0.85 + 1.2 * night };
}

function cameraAt(t, aspect) {
  const tanY = Math.tan(10.5 * Math.PI / 180), tanX = tanY * aspect;
  const az = 1.25 + 0.3 * Math.sin(2 * Math.PI * t / PERIOD), el = 0.55;
  const target = [32, 12, 31];
  const dist = Math.max(34 / tanX, 40 / tanY);
  const eye = [target[0] + dist * Math.cos(el) * Math.cos(az), target[1] + dist * Math.sin(el), target[2] + dist * Math.cos(el) * Math.sin(az)];
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(target.map((v, i) => v - eye[i]));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return { eye, fwd, right, up, tanX, tanY, focus: dist };
}

function dynamics(t, clock, list, box, stud, shadow) {
  let nb = 0, ns = 0, nsh = 0;
  const addBox = (x0, y0, z0, x1, y1, z1, mat) => { if (nb < MAX_BOXES) box.set([x0, y0, z0, mat, x1, y1, z1, 0], 8 * nb++); };
  const addStud = (x, y, z, mat) => { if (ns < MAX_STUDS) stud.set([x, y, z, mat], 4 * ns++); };
  const n = list.length;
  const i0 = Math.max(0, Math.floor((clock - FALL) * n / SPAN)), i1 = Math.min(n - 1, Math.ceil(clock * n / SPAN));
  for (let i = i0; i <= i1; i++) {
    const b = list[i], s = (clock - b.time) / FALL;
    if (s < 0 || s >= 1) continue;
    const y = (b.lo[1] + DROP * (1 - s * s)) * PLATE;
    const [x, , z] = b.lo, [sx, sy, sz] = b.size;
    addBox(x, y, z, x + sx, y + sy * PLATE, z + sz, b.mat & 255);
    if (b.mat >> 8 !== 2) for (let a = 0; a < sx; a++) for (let c = 0; c < sz; c++) addStud(x + a + 0.5, y + sy * PLATE, z + c + 0.5, b.mat & 255);
  }
  const paint = [C.RED, C.WHITE, C.BLUE, C.YELLOW, C.DGRAY, C.ORANGE, C.WHITE, C.RED];
  for (let k = 0; k < 8; k++) {
    const lane = k % 2, appear = 3.5 + k * 0.3;
    if (clock < appear) continue;
    const s = Math.min((clock - appear) / FALL, 1);
    const lift = DROP * (1 - s * s) * PLATE;
    const run = ((Math.floor(k / 2) * 18 + (lane ? 7 : 0) + 5.5 * t) % 72);
    const z0 = lane ? 64 - run : run - 4;
    if (z0 < 0 || z0 + 4 > 64) continue;
    const xc = lane ? 34 : 28, c = paint[k];
    const y = p => p * PLATE + lift;
    addBox(xc - 1, y(2), z0 + 0.5, xc + 1, y(3), z0 + 1.5, C.ROAD);
    addBox(xc - 1, y(2), z0 + 2.5, xc + 1, y(3), z0 + 3.5, C.ROAD);
    addBox(xc - 1, y(3), z0, xc + 1, y(4), z0 + 4, C.DGRAY);
    addBox(xc - 1, y(4), z0, xc + 1, y(6), z0 + 4, c);
    addBox(xc - 1, y(6), z0 + 1, xc + 1, y(8), z0 + 3, C.SMOKE);
    addBox(xc - 1, y(8), z0 + 1, xc + 1, y(9), z0 + 3, c);
    for (const dx of [-0.5, 0.5]) for (const dz of [0.5, 3.5]) addStud(xc + dx, y(6), z0 + dz, c);
    if (nsh < MAX_SHADOWS) shadow.set([xc - 1, y(2), z0, 0, xc + 1, y(9), z0 + 4, 0], 8 * nsh++);
  }
  return { nb, ns, nsh };
}

function isSoftware(adapter) {
  const info = adapter.info || {};
  const text = `${info.vendor} ${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  return adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/.test(text);
}

async function main() {
  const adapter = navigator.gpu && await navigator.gpu.requestAdapter();
  if (!adapter) { document.getElementById('note').style.display = 'grid'; return; }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const module = device.createShaderModule({ code: await fetch('shader.wgsl').then(r => r.text()) });
  for (const m of (await module.getCompilationInfo()).messages) console[m.type === 'error' ? 'error' : 'warn'](`shader.wgsl:${m.lineNum}: ${m.message}`);

  const city = buildCity();
  const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const upload = data => { const b = device.createBuffer({ size: data.byteLength, usage: STORAGE }); device.queue.writeBuffer(b, 0, data); return b; };
  const frameBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const cellBuf = upload(city.cells), brickBuf = upload(city.bricks), coarseBuf = upload(city.coarse);
  const boxData = new Float32Array(MAX_BOXES * 8), studData = new Float32Array(MAX_STUDS * 4), shadowData = new Float32Array(MAX_SHADOWS * 8);
  const boxBuf = upload(boxData), studBuf = upload(studData), shadowBuf = upload(shadowData);

  const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility, buffer: { type: 'uniform' } }]
      .concat([1, 2, 3, 4, 5, 6].map(binding => ({ binding, visibility, buffer: { type: 'read-only-storage' } }))),
  });
  const bind = device.createBindGroup({
    layout,
    entries: [frameBuf, cellBuf, brickBuf, coarseBuf, boxBuf, studBuf, shadowBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const HDR = 'rgba16float';
  const scene = (vs, fs, compare) => device.createRenderPipeline({
    layout: pipeLayout,
    vertex: { module, entryPoint: vs },
    fragment: { module, entryPoint: fs, targets: [{ format: HDR }] },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: compare },
  });
  const tracePipe = scene('vsFull', 'fsTrace', 'always');
  const boxPipe = scene('vsBox', 'fsBox', 'less');
  const studPipe = scene('vsStud', 'fsStud', 'less');
  const postPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'fsPost', targets: [{ format }] },
  });

  let quality = query.get('quality') || (fixedTime === null && isSoftware(adapter) ? 'low' : 'default');
  let targets = null;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const budget = Math.min(1, Math.sqrt(1.6e6 / (canvas.width * canvas.height))) * (quality === 'low' ? 0.5 : 1);
    const w = Math.max(1, Math.round(canvas.width * budget)), h = Math.max(1, Math.round(canvas.height * budget));
    if (targets && targets.w === w && targets.h === h) return;
    if (targets) { targets.hdr.destroy(); targets.depth.destroy(); }
    const hdr = device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const depth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const post = device.createBindGroup({
      layout: postPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: frameBuf } }, { binding: 7, resource: hdr.createView() }],
    });
    targets = { w, h, hdr, depth, post };
  };
  resize();
  addEventListener('resize', resize);

  const frame = new Float32Array(36);
  function draw(t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    const clock = clockAt(t);
    const cam = cameraAt(t, canvas.width / canvas.height);
    const light = lightAt(t);
    const { nb, ns, nsh } = dynamics(t, clock, city.list, boxData, studData, shadowData);
    frame.set([...cam.eye, t, ...cam.right, cam.tanX, ...cam.up, cam.tanY, ...cam.fwd, clock,
      ...light.sun, light.night, ...light.sunColor, light.exposure, ...light.skyTop, cam.focus,
      ...light.skyLow, nsh, targets.w, targets.h, canvas.width, canvas.height]);
    device.queue.writeBuffer(frameBuf, 0, frame);
    if (nb) device.queue.writeBuffer(boxBuf, 0, boxData, 0, nb * 8);
    if (ns) device.queue.writeBuffer(studBuf, 0, studData, 0, ns * 4);
    if (nsh) device.queue.writeBuffer(shadowBuf, 0, shadowData, 0, nsh * 8);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targets.hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: targets.depth.createView(), depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, bind);
    pass.setPipeline(tracePipe);
    pass.draw(3);
    if (nb) { pass.setPipeline(boxPipe); pass.draw(36, nb); }
    if (ns) { pass.setPipeline(studPipe); pass.draw(108, ns); }
    pass.end();
    const post = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    post.setPipeline(postPipe);
    post.setBindGroup(0, targets.post);
    post.draw(3);
    post.end();
    device.queue.submit([encoder.finish()]);
  }

  if (fixedTime !== null) {
    draw(fixedTime);
    await device.queue.onSubmittedWorkDone();
    document.title = 'done';
    return;
  }

  const start = performance.now();
  let frames = 0, slow = 0, last = start;
  const loop = now => {
    const dt = now - last;
    last = now;
    if (quality !== 'low' && ++frames > 30 && frames < 200 && dt > 40 && ++slow > 40) { quality = 'low'; targets.w = 0; resize(); }
    draw((now - start) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
