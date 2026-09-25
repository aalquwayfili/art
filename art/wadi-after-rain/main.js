(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
const P = (k, d) => qs.has(k) ? parseFloat(qs.get(k)) : d;
let seed = 20260925;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

const PN = 256, perm = new Uint8Array(PN * 2), grad = new Float32Array(PN);
for (let i = 0; i < PN; i++) { perm[i] = i; grad[i] = rnd(); }
for (let i = PN - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
for (let i = 0; i < PN; i++) perm[i + PN] = perm[i];
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = grad[perm[(xi & 255) + perm[yi & 255]]], b = grad[perm[((xi + 1) & 255) + perm[yi & 255]]];
  const c = grad[perm[(xi & 255) + perm[(yi + 1) & 255]]], d = grad[perm[((xi + 1) & 255) + perm[(yi + 1) & 255]]];
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * vn(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const NX = P('nx', 112), NY = P('ny', 136), NC = NX * NY;
const b = new Float32Array(NC), d = new Float32Array(NC), s = new Float32Array(NC), s2 = new Float32Array(NC);
const fL = new Float32Array(NC), fR = new Float32Array(NC), fT = new Float32Array(NC), fB = new Float32Array(NC);
const u = new Float32Array(NC), v = new Float32Array(NC), hard = new Float32Array(NC), wet = new Float32Array(NC);
const b0 = new Float32Array(NC), mat = new Float32Array(NC), fpn = new Float32Array(NC);
const cxOf = y => NX * 0.5 + 9 * Math.sin(y * 0.034 + 0.4) + 3 * Math.sin(y * 0.09 + 2.1);
const gullies = [];
for (let k = 0; k < 9; k++) gullies.push({ y0: 8 + k * 19 + rnd() * 8, side: k % 2 ? 1 : -1, bend: (rnd() - 0.5) * 0.9, w: 1.3 + rnd() * 0.9 });
for (let y = 0; y < NY; y++) {
  const cx = cxOf(y);
  for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    const dist = Math.abs(x - cx) + (fbm(x * 0.07, y * 0.07, 3) - 0.5) * 6;
    const base = (NY - y) * 0.08;
    const floorN = (fbm(x * 0.12 + 7, y * 0.07, 4) - 0.5) * 1.3 + Math.pow(Math.max(0, dist - 4) / 10, 2) * 0.9;
    let wall = 6 * smooth(11, 18, dist) + 4 * smooth(24, 40, dist) + (fbm(x * 0.035 + 30, y * 0.035, 4) - 0.35) * 10 * smooth(12, 26, dist);
    let g = 0;
    for (const q of gullies) {
      const side = (x - cx) * q.side; if (side < 6) continue;
      const gy = q.y0 - (side - 6) * (0.55 + q.bend * 0.4) + Math.sin(side * 0.21 + q.y0) * 2.5;
      const e = Math.abs(y - gy); g = Math.max(g, (1 - smooth(0, q.w * 2.2, e)) * smooth(8, 18, side));
    }
    wall -= g * 3.2;
    const st = 2.4, qq = wall / st, qf = qq - Math.floor(qq);
    wall = (Math.floor(qq) + smooth(0.55, 0.95, qf)) * st * 0.4 + wall * 0.6;
    const rockiness = smooth(10, 15, dist) * (1 - g * 0.6);
    b[i] = base + floorN * (1 - smooth(10, 15, dist)) + wall;
    hard[i] = Math.max(0.03, 0.05 + 0.95 * (1 - rockiness) + (fbm(x * 0.2, y * 0.2, 2) - 0.5) * 0.3 * (1 - rockiness));
    mat[i] = rockiness;
    fpn[i] = fbm(x * 0.45 + 90, y * 0.45, 3) - 0.5;
  }
}
b0.set(b);

const G = 9.81, DT = P('dt', 0.08), KC = P('kc', 0.9), KS = P('ks', 0.4), KD = P('kd', 0.25);
let simT = 0, stepN = 0;
function rainRate(t) { return RAIN * smooth(1.5, 4, t) * (1 - smooth(9, 13, t)); }
function inflow(t) { return 34 * smooth(T_IN, T_IN + 2.5, t) * (1 - smooth(T_IN + 6, T_IN + 22, t)) + 0.5; }
const RAIN = P('rain', 0.007), T_IN = P('tin', 1.5);
const cxIn = cxOf(1);
function step() {
  const t = simT, dt = DT, rain = rainRate(t) * dt;
  if (rain > 0) for (let i = 0; i < NC; i++) d[i] += rain;
  const Q = inflow(t) * dt;
  for (let x = Math.floor(cxIn - 7); x <= Math.ceil(cxIn + 7); x++) { const w = Math.max(0, 1 - Math.abs(x - cxIn) / 8); d[NX + x] += Q * w / 8; d[2 * NX + x] += Q * w / 8; }
  const k = dt * G;
  for (let y = 0; y < NY; y++) {
    const r = y * NX;
    for (let x = 0; x < NX; x++) {
      const i = r + x, h = b[i] + d[i];
      let l = x > 0 ? fL[i] + k * (h - b[i - 1] - d[i - 1]) : 0; if (l < 0) l = 0;
      let rr = x < NX - 1 ? fR[i] + k * (h - b[i + 1] - d[i + 1]) : 0; if (rr < 0) rr = 0;
      let tt = y > 0 ? fT[i] + k * (h - b[i - NX] - d[i - NX]) : 0; if (tt < 0) tt = 0;
      let bb = y < NY - 1 ? fB[i] + k * (h - b[i + NX] - d[i + NX]) : d[i] * 3; if (bb < 0) bb = 0;
      const sum = (l + rr + tt + bb) * dt;
      if (sum > d[i]) { const K = sum > 0 ? d[i] / sum : 0; l *= K; rr *= K; tt *= K; bb *= K; }
      fL[i] = l; fR[i] = rr; fT[i] = tt; fB[i] = bb;
    }
  }
  for (let y = 0; y < NY; y++) {
    const r = y * NX;
    for (let x = 0; x < NX; x++) {
      const i = r + x;
      const inL = x > 0 ? fR[i - 1] : 0, inR = x < NX - 1 ? fL[i + 1] : 0, inT = y > 0 ? fB[i - NX] : 0, inB = y < NY - 1 ? fT[i + NX] : 0;
      const d1 = d[i];
      let d2 = d1 + dt * (inL + inR + inT + inB - fL[i] - fR[i] - fT[i] - fB[i]);
      d2 = d2 * (1 - 0.004 * dt) - (0.003 + 0.007 * (1 - mat[i])) * dt;
      if (d2 < 0) d2 = 0;
      d[i] = d2;
      const dm = Math.max(0.05, (d1 + d2) * 0.5);
      let uu = (inL - fL[i] + fR[i] - inR) * 0.5 / dm, vv = (inT - fT[i] + fB[i] - inB) * 0.5 / dm;
      const sp = Math.hypot(uu, vv); if (sp > 8) { uu *= 8 / sp; vv *= 8 / sp; }
      u[i] = uu; v[i] = vv;
      if (d2 > 0.03) { const w = Math.min(1, d2 * 2.5); if (wet[i] < w) wet[i] = w; }
    }
  }
  for (let y = 1; y < NY - 1; y++) {
    const r = y * NX;
    for (let x = 1; x < NX - 1; x++) {
      const i = r + x, dd = d[i];
      if (dd < 0.004 && s[i] < 1e-5) continue;
      const gx = (b[i + 1] - b[i - 1]) * 0.5, gy = (b[i + NX] - b[i - NX]) * 0.5, g2 = gx * gx + gy * gy;
      const sin = Math.max(0.06, Math.sqrt(g2 / (1 + g2)));
      const C = KC * sin * Math.hypot(u[i], v[i]) * Math.min(1, dd * 2.5) * (dd > 2 ? 2 / dd : 1);
      if (C > s[i]) { const a = KS * hard[i] * (C - s[i]) * dt; b[i] -= a; s[i] += a; }
      else { const a = KD * (s[i] - C) * dt; b[i] += a; s[i] -= a; }
    }
  }
  for (let y = 0; y < NY; y++) {
    const r = y * NX;
    for (let x = 0; x < NX; x++) {
      const i = r + x;
      let px = x - u[i] * dt, py = y - v[i] * dt;
      if (px < 0) px = 0; else if (px > NX - 1.001) px = NX - 1.001;
      if (py < 0) py = 0; else if (py > NY - 1.001) py = NY - 1.001;
      const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, j = y0 * NX + x0;
      s2[i] = (s[j] * (1 - fx) + s[j + 1] * fx) * (1 - fy) + (s[j + NX] * (1 - fx) + s[j + NX + 1] * fx) * fy;
    }
  }
  s.set(s2);
  if ((stepN & 3) === 0) for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = y * NX + x; if (mat[i] > 0.5) continue;
    let j = i + 1, df = b[i] - b[j];
    if (df > 1.1) { const m = (df - 1.1) * 0.25; b[i] -= m; b[j] += m; } else if (df < -1.1) { const m = (-df - 1.1) * 0.25; b[i] += m; b[j] -= m; }
    j = i + NX; df = b[i] - b[j];
    if (df > 1.1) { const m = (df - 1.1) * 0.25; b[i] -= m; b[j] += m; } else if (df < -1.1) { const m = (-df - 1.1) * 0.25; b[i] += m; b[j] -= m; }
  }
  const keep = Math.pow(0.9985, dt / 0.06);
  for (let i = 0; i < NC; i++) { let w = wet[i] * keep; if (rain > 0) w = Math.min(1, w + rain * 1.2); wet[i] = w; }
  simT += dt; stepN++;
}
function resetSim() { b.set(b0); d.fill(0); s.fill(0); fL.fill(0); fR.fill(0); fT.fill(0); fB.fill(0); u.fill(0); v.fill(0); wet.fill(0); simT = 0; stepN = 0; }

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let RW = 400, RH = 236, img, buf32, tbuf;
const off = document.createElement('canvas'), octx = off.getContext('2d');
function resize() {
  const a = Math.max(0.5, Math.min(3, innerWidth / innerHeight));
  RH = 240; RW = Math.round(RH * a);
  off.width = RW; off.height = RH; img = octx.createImageData(RW, RH);
  buf32 = new Uint32Array(img.data.buffer); tbuf = new Float32Array(RW * RH);
  cv.width = innerWidth; cv.height = innerHeight;
}
resize();
addEventListener('resize', resize);

const STOPS = [[0, 3, 2, 12], [0.13, 26, 6, 84], [0.28, 88, 8, 136], [0.44, 164, 20, 122], [0.58, 218, 58, 58], [0.72, 246, 126, 12], [0.87, 255, 202, 48], [1, 255, 250, 224]];
const LUT = new Uint32Array(512);
for (let k = 0; k < 512; k++) {
  const f = k / 511; let j = 0; while (j < STOPS.length - 2 && f > STOPS[j + 1][0]) j++;
  const A = STOPS[j], B = STOPS[j + 1], w = (f - A[0]) / (B[0] - A[0]);
  LUT[k] = 0xff000000 | (Math.round(A[3] + (B[3] - A[3]) * w) << 16) | (Math.round(A[2] + (B[2] - A[2]) * w) << 8) | Math.round(A[1] + (B[1] - A[1]) * w);
}
const TMIN = 12, TMAX = 52;

const surfT = new Float32Array(NC), sh = new Float32Array(NC), dS = new Float32Array(NC), matT = new Float32Array(NC);
const TX = 256, tex = new Float32Array(TX * TX);
{ const save = seed; seed = 4242; const g = new Float32Array(32 * 32); for (let i = 0; i < g.length; i++) g[i] = rnd();
  const g2 = new Float32Array(128 * 128); for (let i = 0; i < g2.length; i++) g2[i] = rnd();
  const smp = (G, n, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = G[(y0 % n) * n + x0 % n], b1 = G[(y0 % n) * n + (x0 + 1) % n], c = G[((y0 + 1) % n) * n + x0 % n], d1 = G[((y0 + 1) % n) * n + (x0 + 1) % n];
    return (a + (b1 - a) * sx) * (1 - sy) + (c + (d1 - c) * sx) * sy; };
  for (let y = 0; y < TX; y++) for (let x = 0; x < TX; x++) tex[y * TX + x] = smp(g, 32, x / 8, y / 8) * 0.6 + smp(g2, 128, x / 2, y / 2) * 0.4 - 0.5;
  seed = save; }
function texS(x, y) { x = ((x % TX) + TX) % TX; y = ((y % TX) + TX) % TX; const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, x1 = (x0 + 1) & (TX - 1), y1 = (y0 + 1) & (TX - 1);
  return (tex[y0 * TX + x0] * (1 - fx) + tex[y0 * TX + x1] * fx) * (1 - fy) + (tex[y1 * TX + x0] * (1 - fx) + tex[y1 * TX + x1] * fx) * fy; }
const SUN = (() => { const az = Math.PI * 1.1, el = 0.5; return [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]; })();
function thermalField(t) {
  const cool = 1 - 0.25 * smooth(1.5, 9, t) * (1 - 0.7 * smooth(12, 34, t));
  for (let i = 0; i < NC; i++) sh[i] = b[i] + d[i];
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x, xm = x > 0 ? i - 1 : i, xp = x < NX - 1 ? i + 1 : i, ym = y > 0 ? i - NX : i, yp = y < NY - 1 ? i + NX : i;
    dS[i] = d[i] * 0.36 + (d[xm] + d[xp] + d[ym] + d[yp]) * 0.11 + ((x > 0 ? d[ym - 1 < 0 ? ym : ym - (x > 0 ? 1 : 0)] : d[ym]) + (x < NX - 1 ? d[ym + 1] : d[ym]) + (x > 0 ? d[yp - 1] : d[yp]) + (x < NX - 1 ? d[yp + 1] : d[yp])) * 0.05;
  }
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    const xm = x > 0 ? i - 1 : i, xp = x < NX - 1 ? i + 1 : i, ym = y > 0 ? i - NX : i, yp = y < NY - 1 ? i + NX : i;
    const gx = (b[xp] - b[xm]) * 0.5, gy = (b[yp] - b[ym]) * 0.5, nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const lam = Math.max(0, (-gx * SUN[0] - gy * SUN[1] + SUN[2]) * nl);
    const m = mat[i];
    let T = 27 + lam * (17 + 5 * m) + m * 4 + fpn[i] * (2.5 + 3 * m);
    T = 22 + (T - 22) * cool;
    T += (22 - T) * wet[i] * 0.8;
    const dd = d[i];
    surfT[i] = T;
    matT[i] = m;
  }
}
function sampleF(f, x, y) {
  if (x < 0) x = 0; else if (x > NX - 1.001) x = NX - 1.001;
  if (y < 0) y = 0; else if (y > NY - 1.001) y = NY - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, j = y0 * NX + x0;
  return (f[j] * (1 - fx) + f[j + 1] * fx) * (1 - fy) + (f[j + NX] * (1 - fx) + f[j + NX + 1] * fx) * fy;
}

const VIEW_Y0 = 72, VIEW_Y1 = 46;
const bankX = y => cxOf(y) - 15.5;
const cars = [{ x: bankX(60) - 0.5, y: 60, a: -1.35 }, { x: bankX(63.5) - 1.6, y: 63.5, a: -1.1 }];
const people = [];
for (let k = 0; k < 5; k++) people.push({ x: bankX(58 + k * 1.6) + 1.2 + rnd() * 1.4, y: 58 + k * 1.6 + rnd(), ph: rnd() * 6.28 });
const fire = { x: bankX(61.5) - 3.2, y: 61.5 };

function camera(t) {
  const f = t / 32, y = VIEW_Y0 + (VIEW_Y1 - VIEW_Y0) * (f * f * (3 - 2 * f) * 0.6 + f * 0.4);
  const x = cxOf(y) - 2 + Math.sin(t * 0.12) * 1.2;
  return { x, y, z: 110, rot: 0.1 * Math.sin(t * 0.05 + 0.3) + (cxOf(y - 20) - cxOf(y + 20)) * 0.012, ppc: RH / P('view', 52) };
}

function render(t) {
  thermalField(t);
  const W = RW, H = RH, cam = camera(t);
  const cr = Math.cos(cam.rot), sr = Math.sin(cam.rot), href = 8, flowPh = (t * 0.6) % 1;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const ox = (px - W / 2) / cam.ppc, oy = (py - H / 2) / cam.ppc;
    const rx = ox * cr - oy * sr, ry = ox * sr + oy * cr;
    let k = 1, wx = cam.x + rx, wy = cam.y + ry;
    for (let it = 0; it < 2; it++) { const h = sampleF(sh, wx, wy); k = (cam.z - h) / (cam.z - href); wx = cam.x + rx * k; wy = cam.y + ry * k; }
    let T = sampleF(surfT, wx, wy);
    const m = sampleF(matT, wx, wy);
    T += texS(wx * 9, wy * 9) * (1.2 + 4 * m);
    const dw = sampleF(dS, wx, wy);
    if (dw > 0.006) {
      const uu = sampleF(u, wx, wy), vv = sampleF(v, wx, wy), sp = Math.hypot(uu, vv);
      const f1 = flowPh, f2 = (flowPh + 0.5) % 1, w1 = 1 - Math.abs(2 * f1 - 1);
      const n = texS(wx * 5 - uu * f1 * 6, wy * 5 - vv * f1 * 6) * w1 + texS(wx * 5 - uu * f2 * 6 + 97, wy * 5 - vv * f2 * 6 + 31) * (1 - w1);
      const Tw = 15.5 + Math.min(1, sampleF(s, wx, wy) * 4) * 5 + n * (3 + Math.min(1, sp * 0.3) * 13);
      const cov = smooth(0.01, 0.07, dw);
      T += (Tw - T) * cov;
    }
    tbuf[py * W + px] = T;
  }
  const toS = (wx, wy, h) => { const k = (cam.z - href) / (cam.z - h), dx = (wx - cam.x) * k, dy = (wy - cam.y) * k;
    return [W / 2 + (dx * cr + dy * sr) * cam.ppc, H / 2 + (-dx * sr + dy * cr) * cam.ppc]; };
  const stamp = (wx, wy, ang, hl, hw, T, soft) => {
    const h = sampleF(b, wx, wy), [sx, sy] = toS(wx, wy, h), R = (Math.max(hl, hw) + 0.6) * cam.ppc;
    const ca = Math.cos(ang - cam.rot), sa = Math.sin(ang - cam.rot);
    for (let y = Math.max(0, Math.floor(sy - R)); y <= Math.min(H - 1, Math.ceil(sy + R)); y++)
      for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(W - 1, Math.ceil(sx + R)); x++) {
        const dx = (x - sx) / cam.ppc, dy = (y - sy) / cam.ppc, l = dx * ca + dy * sa, w = -dx * sa + dy * ca;
        const e = Math.max(Math.abs(l) - hl, Math.abs(w) - hw);
        if (e < 0) tbuf[y * W + x] = soft ? tbuf[y * W + x] + (T - tbuf[y * W + x]) * Math.min(1, -e / soft) : T;
      }
  };
  const blob = (wx, wy, r, T, a) => {
    const h = sampleF(b, wx, wy), [sx, sy] = toS(wx, wy, h), R = r * cam.ppc;
    for (let y = Math.max(0, Math.floor(sy - R)); y <= Math.min(H - 1, Math.ceil(sy + R)); y++)
      for (let x = Math.max(0, Math.floor(sx - R)); x <= Math.min(W - 1, Math.ceil(sx + R)); x++) {
        const q = 1 - Math.hypot(x - sx, y - sy) / R; if (q <= 0) continue;
        const o = y * W + x; tbuf[o] += (T - tbuf[o]) * Math.min(1, q * 2.2) * a;
      }
  };
  for (const c of cars) {
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    stamp(c.x, c.y, c.a, 1.35, 0.62, 27, 0.15);
    stamp(c.x - ca * 0.05, c.y - sa * 0.05, c.a, 0.5, 0.5, 17, 0);
    const eng = 58 - smooth(4, 30, t) * 16;
    stamp(c.x + ca * 0.95, c.y + sa * 0.95, c.a, 0.36, 0.48, eng, 0.1);
  }
  const fireOn = smooth(17, 20, t);
  for (let k = 0; k < people.length; k++) {
    const p = people[k];
    const go = k < 4 ? fireOn : 0, ang = k * 1.26 + 0.4;
    const x = p.x + (fire.x + Math.cos(ang) * 1.3 - p.x) * go + Math.sin(t * 0.7 + p.ph) * 0.12;
    const y = p.y + (fire.y + Math.sin(ang) * 1.3 - p.y) * go + Math.cos(t * 0.5 + p.ph) * 0.12;
    blob(x, y, 0.5, 36, 1);
  }
  if (fireOn > 0.01) {
    const fl = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3);
    for (let k = 0; k < 8; k++) blob(fire.x + 1.0 + k * 0.9 + Math.sin(t * 1.3 + k) * 0.3, fire.y - k * 0.35, 0.8 + k * 0.28, 44, 0.18 * fireOn * (1 - k / 8));
    blob(fire.x, fire.y, 0.6 * fl, 120, fireOn);
  }
  let ns = (Math.floor(t * 30) * 2654435761 + 1) >>> 0;
  for (let y = 0; y < H; y++) {
    const yu = y > 0 ? -W : 0, yd = y < H - 1 ? W : 0, cyn = y / H - 0.5;
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      let T = tbuf[o] * 0.6 + (tbuf[x > 0 ? o - 1 : o] + tbuf[x < W - 1 ? o + 1 : o] + tbuf[o + yu] + tbuf[o + yd]) * 0.1;
      ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5;
      const cxn = x / W - 0.5;
      T += ((ns >>> 0) / 4294967296 - 0.5) * 0.4 + Math.sin(x * 12.9898) * 0.1 - (cxn * cxn + cyn * cyn) * 2.5;
      let k = Math.round((T - TMIN) / (TMAX - TMIN) * 511); k = k < 0 ? 0 : k > 511 ? 511 : k;
      buf32[o] = LUT[k];
    }
  }
  const rr = rainRate(t * SIM_PER_SEC) / RAIN;
  if (rr > 0.02) {
    let rs = 99173;
    const n = Math.round(rr * 360);
    for (let k = 0; k < n; k++) {
      rs = Math.imul(rs ^ (rs >>> 15), 2246822519) + 0x9e3779b9 | 0; const h1 = (rs >>> 0) / 4294967296;
      rs = Math.imul(rs ^ (rs >>> 13), 3266489917) + 7 | 0; const h2 = (rs >>> 0) / 4294967296;
      const x0 = h1 * (W + 40) - 20, y0 = ((h2 * 997 + t * (0.9 + h2)) % 1) * (H + 30) - 15, len = 3 + h2 * 5;
      for (let q = 0; q < len; q++) {
        const xx = Math.round(x0 - q * 0.3), yy = Math.round(y0 - q); if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const o = yy * W + xx, p = buf32[o], a = 0.28 * rr;
        buf32[o] = 0xff000000 | (((p >> 16 & 255) * (1 - a) + 28 * a) << 16) | (((p >> 8 & 255) * (1 - a)) << 8) | ((p & 255) * (1 - a));
      }
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, cv.width, cv.height);
  const cxs = W >> 1, cys = H >> 1; let spot = 0;
  for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) spot += tbuf[(cys + yy) * W + cxs + xx];
  hud(t, spot / 9, cam);
}

function hud(t, spot, cam) {
  const Wc = cv.width, Hc = cv.height, sc = Hc / 600;
  ctx.save();
  ctx.strokeStyle = 'rgba(240,240,236,0.85)'; ctx.fillStyle = 'rgba(240,240,236,0.9)'; ctx.lineWidth = Math.max(1, sc * 1.2);
  const cx = Wc / 2, cy = Hc / 2, g = 7 * sc, L = 19 * sc;
  ctx.beginPath();
  ctx.moveTo(cx - L, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + L, cy);
  ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + L);
  ctx.stroke();
  const fs = Math.round(Math.max(10, 11.5 * sc));
  ctx.font = `${fs}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
  ctx.fillText(spot.toFixed(1) + '°C', cx + L + 7 * sc, cy - 9 * sc);
  const bw = Wc * 0.19, bh = Hc * 0.36;
  ctx.globalAlpha = 0.5; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + sx * bw, y = cy + sy * bh;
    ctx.moveTo(x, y - sy * 14 * sc); ctx.lineTo(x, y); ctx.lineTo(x - sx * 14 * sc, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  const m = 26 * sc;
  ctx.textBaseline = 'top';
  const clock = 16 * 3600 + 51 * 60 + Math.floor(t * 24);
  const hh = String(Math.floor(clock / 3600)).padStart(2, '0'), mm = String(Math.floor(clock / 60) % 60).padStart(2, '0'), ss = String(clock % 60).padStart(2, '0');
  ctx.fillText('IR 8–14 µm  NADIR', m, m);
  ctx.fillText(hh + ':' + mm + ':' + ss, m, m + fs * 1.5);
  ctx.textAlign = 'right';
  ctx.fillText('ALT ' + Math.round(cam.z * 3) + ' m', Wc - m, m);
  ctx.fillText('HDG ' + String(Math.round((cam.rot * 180 / Math.PI + 360) % 360)).padStart(3, '0') + '°', Wc - m, m + fs * 1.5);
  const bx = Wc - m - 8 * sc, by0 = Hc * 0.3, by1 = Hc * 0.7;
  for (let y = by0; y < by1; y++) {
    const c = LUT[Math.round((1 - (y - by0) / (by1 - by0)) * 511)];
    ctx.fillStyle = `rgb(${c & 255},${c >> 8 & 255},${c >> 16 & 255})`; ctx.fillRect(bx, y, 8 * sc, 1.5);
  }
  ctx.fillStyle = 'rgba(240,240,236,0.9)'; ctx.textBaseline = 'middle';
  ctx.fillText(TMAX + '°', bx - 6 * sc, by0); ctx.fillText(TMIN + '°', bx - 6 * sc, by1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(t < 2.5 ? 'DRY' : t < 9 ? 'RAIN' : t < 20 ? 'SEIL' : 'RECESSION', m, Hc - m);
  ctx.restore();
}

const SIM_PER_SEC = 1.0, LOOP = 32;
function advanceTo(t) { const target = Math.floor(Math.min(t, LOOP) * SIM_PER_SEC / DT); while (stepN < target) step(); }
if (FIXED !== null) {
  const t0 = performance.now();
  advanceTo(FIXED);
  const t1 = performance.now();
  render(Math.min(FIXED, LOOP));
  if (qs.has('map')) { const sc = 3, dimg = ctx.createImageData(NX * sc, NY * sc); for (let y = 0; y < NY * sc; y++) for (let x = 0; x < NX * sc; x++) { const i = ((y / sc) | 0) * NX + ((x / sc) | 0), o = (y * NX * sc + x) * 4; dimg.data[o] = Math.min(255, b[i] * 12); dimg.data[o + 1] = 128 + (b[i] - b0[i]) * 60; dimg.data[o + 2] = Math.min(255, d[i] * 300); dimg.data[o + 3] = 255; } ctx.putImageData(dimg, 0, 0); }
  { let fy = 0; for (let y = 0; y < NY; y++) { const i = y * NX + Math.round(cxOf(y)); let m = 0; for (let k = -6; k <= 6; k++) m = Math.max(m, d[i + k]); if (m > 0.15) fy = y; } window.__dbg = 'front y ' + fy + ' cam y ' + camera(FIXED).y.toFixed(0); }
  ctx.getImageData(0, 0, 1, 1);
  window.__ms = Math.round(performance.now() - t0) + ' (render ' + Math.round(performance.now() - t1) + ')';
  document.title = 'done';
} else {
  let start = performance.now();
  (function loop() {
    let t = (performance.now() - start) / 1000;
    if (t > LOOP + 4) { resetSim(); start = performance.now(); t = 0; }
    advanceTo(t); render(Math.min(t, LOOP));
    requestAnimationFrame(loop);
  })();
}
})();
