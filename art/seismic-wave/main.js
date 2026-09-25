(function(){
'use strict';
const T_START = performance.now();
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;

const NXI = 256, NZI = 96, B = 14, GX = NXI + 2 * B, GZ = NZI + 2 * B, NG = GX * GZ, NI = NXI * NZI;
const K = 420;
const F0 = 1 / 26, T0 = 34;
const ZS = 2, ZR = 2;
const SHOTS = [80, 176, 112, 146];
const SHOT_DUR = 6.5, FWD_DUR = 3.6, BWD_DUR = 2.7, HOLD = 2, CYCLE = SHOTS.length * SHOT_DUR + HOLD;

function iface1(x) { return 21 + 3.5 * Math.sin(x * 0.024 + 1.2); }
function iface2(x) { return 52 - 20 * Math.exp(-Math.pow((x - 136) / 46, 2)) + 0.05 * (x - 128); }
function iface3(x) { return 77 + 0.1 * (x - 128) + (x > 190 ? 7 : 0) - 4 * Math.exp(-Math.pow((x - 60) / 30, 2)); }
const cTrue = new Float64Array(NG), cSm = new Float64Array(NG), gam = new Float64Array(NG);
const c2True = new Float64Array(NG), c2Sm = new Float64Array(NG);
for (let gz = 0; gz < GZ; gz++) for (let gx = 0; gx < GX; gx++) {
  const x = Math.min(NXI - 1, Math.max(0, gx - B)), z = gz - B;
  let c = 0.34;
  if (z > iface1(x)) c = 0.44;
  if (z > iface2(x)) c = 0.54;
  if (z > iface3(x)) c = 0.66;
  const i = gz * GX + gx;
  cTrue[i] = c;
  const d = Math.min(gx, GX - 1 - gx, gz, GZ - 1 - gz);
  gam[i] = d < B ? 0.22 * Math.pow((B - d) / B, 2) : 0;
}
{
  const a = new Float32Array(NG), t = new Float32Array(NG);
  for (let i = 0; i < NG; i++) a[i] = 1 / cTrue[i];
  for (let p = 0; p < 6; p++) {
    for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const xx = x + k; if (xx >= 0 && xx < GX) { s += a[z * GX + xx]; n++; } } t[z * GX + x] = s / n; }
    for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const zz = z + k; if (zz >= 0 && zz < GZ) { s += t[zz * GX + x]; n++; } } a[z * GX + x] = s / n; }
  }
  for (let i = 0; i < NG; i++) cSm[i] = 1 / a[i];
  for (let gz = 0; gz < GZ; gz++) for (let gx = 0; gx < GX; gx++) {
    const x = Math.min(NXI - 1, Math.max(0, gx - B)), z = gz - B, i = gz * GX + gx, lim = iface1(x) - 3;
    if (z < lim) cSm[i] = 0.34; else if (z < lim + 6) cSm[i] += (0.34 - cSm[i]) * (1 - (z - lim) / 6);
  }
}
for (let i = 0; i < NG; i++) { c2True[i] = cTrue[i] * cTrue[i]; c2Sm[i] = cSm[i] * cSm[i]; }

function ricker(k) { const a = Math.PI * F0 * (k - T0), a2 = a * a; return (1 - 2 * a2) * Math.exp(-a2); }

function Sim(c2) { this.c2 = c2; this.u = new Float64Array(NG); this.p = new Float64Array(NG); this.n = new Float64Array(NG); }
Sim.prototype.reset = function () { this.u.fill(0); this.p.fill(0); this.n.fill(0); };
Sim.prototype.step = function () {
  const u = this.u, p = this.p, n = this.n, c2 = this.c2;
  for (let z = 1; z < GZ - 1; z++) {
    const r = z * GX, inner = z >= B && z < GZ - B;
    const a0 = inner ? r + B : r + GX - 1, a1 = inner ? r + GX - B : r + GX - 1;
    for (let i = r + 1; i < a0; i++) { const g = gam[i], ui = u[i]; n[i] = (2 - g) * ui - (1 - g) * p[i] + c2[i] * (u[i - 1] + u[i + 1] + u[i - GX] + u[i + GX] - 4 * ui); }
    for (let i = a0; i < a1; i++) { const ui = u[i]; n[i] = 2 * ui - p[i] + c2[i] * (u[i - 1] + u[i + 1] + u[i - GX] + u[i + GX] - 4 * ui); }
    for (let i = a1; i < r + GX - 1; i++) { const g = gam[i], ui = u[i]; n[i] = (2 - g) * ui - (1 - g) * p[i] + c2[i] * (u[i - 1] + u[i + 1] + u[i - GX] + u[i + GX] - 4 * ui); }
  }
  this.p = u; this.u = n; this.n = p;
};
Sim.prototype.add = function (x, z, v) {
  const gx = x + B, gz = z + B, u = this.u;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) u[(gz + dz) * GX + gx + dx] += v * (dx || dz ? (dx && dz ? 0.25 : 0.5) : 1) * this.c2[gz * GX + gx];
};

const simT = new Sim(c2True), simS = new Sim(c2Sm), simR = new Sim(c2Sm);
const rec = new Float32Array(K * NXI);
const snaps = new Float32Array((K >> 1) * NI);
const illum = new Float32Array(NI), imgShot = new Float32Array(NI), imgAll = new Float32Array(NI);

let shot = 0, phase = 0, k = 0;
function resetAll() { shot = 0; phase = 0; k = 0; imgAll.fill(0); beginShot(); }
function beginShot() { simT.reset(); simS.reset(); simR.reset(); illum.fill(0); imgShot.fill(0); }
let recMax = 1;
function muteRec() {
  const sx = SHOTS[shot];
  for (let x = 0; x < NXI; x++) {
    const d = Math.hypot(x - sx, ZR - ZS), kd = d / 0.34 + T0 + 8;
    for (let kk = 0; kk < K; kk++) { const w = kk < kd ? 0 : kk < kd + 12 ? (kk - kd) / 12 : 1; rec[kk * NXI + x] *= w * (1 + kk / 120); }
    let a = 0, b = rec[x];
    for (let kk = 0; kk < K; kk++) { const c = kk + 1 < K ? rec[(kk + 1) * NXI + x] : 0; rec[kk * NXI + x] = (c - 2 * b + a) * 8; a = b; b = c; }
  }
  recMax = 1e-9; for (let i = 0; i < K * NXI; i++) { const v = Math.abs(rec[i]); if (v > recMax) recMax = v; }
}
function unit() {
  const sx = SHOTS[shot];
  if (phase === 0) {
    const s = ricker(k) * 2;
    simT.add(sx, ZS, s); simS.add(sx, ZS, s);
    simT.step(); simS.step();
    const uT = simT.u, row = (ZR + B) * GX + B;
    const uS0 = simS.u;
    for (let x = 0; x < NXI; x++) rec[k * NXI + x] = uT[row + x] - uS0[row + x];
    if ((k & 1) === 0) {
      const o = (k >> 1) * NI, uS = simS.u;
      for (let z = 0; z < NZI; z++) { const r = (z + B) * GX + B, q = z * NXI; for (let x = 0; x < NXI; x++) { const v = uS[r + x]; snaps[o + q + x] = v; illum[q + x] += v * v; } }
    }
    if (++k === K) { phase = 1; k = 0; muteRec(); }
  } else if (phase === 1) {
    const kk = K - 1 - k, row = ZR;
    for (let x = 0; x < NXI; x++) { const v = rec[kk * NXI + x]; if (v) simR.u[(row + B) * GX + x + B] += v * 0.5; }
    simR.step();
    if ((kk & 1) === 0) {
      const o = (kk >> 1) * NI, uR = simR.u;
      for (let z = 0; z < NZI; z++) { const r = (z + B) * GX + B, q = z * NXI; for (let x = 0; x < NXI; x++) imgShot[q + x] += snaps[o + q + x] * uR[r + x]; }
    }
    if (++k === K) {
      let mx = 0; for (let i = 0; i < NI; i++) if (illum[i] > mx) mx = illum[i];
      for (let i = 0; i < NI; i++) imgAll[i] += imgShot[i] / (illum[i] + mx * 0.02);
      imgShot.fill(0);
      shot++; k = 0;
      if (shot === SHOTS.length) phase = 2; else { phase = 0; beginShot(); }
    }
  }
}
function targetFor(t) {
  const s = Math.min(SHOTS.length, Math.floor(t / SHOT_DUR));
  if (s >= SHOTS.length) return [SHOTS.length, 2, 0];
  const u = t - s * SHOT_DUR;
  if (u < FWD_DUR) return [s, 0, Math.floor(u / FWD_DUR * K)];
  return [s, 1, Math.min(K, Math.floor((u - FWD_DUR) / BWD_DUR * K))];
}
function before(a, b) { return a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2]))); }
function advanceTo(t) {
  const tg = targetFor(t);
  if (tg[1] === 1 && tg[2] >= K) { tg[0]++; tg[2] = 0; tg[1] = tg[0] >= SHOTS.length ? 2 : 0; }
  while (phase !== 2 && before([shot, phase, k], tg)) unit();
}

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let RW = 320, RH = 180, img, buf32;
const off = document.createElement('canvas'), octx = off.getContext('2d');
function resize() {
  const a = Math.max(0.5, Math.min(3, innerWidth / innerHeight));
  RH = 180; RW = Math.round(RH * a);
  off.width = RW; off.height = RH; img = octx.createImageData(RW, RH); buf32 = new Uint32Array(img.data.buffer);
  cv.width = innerWidth; cv.height = innerHeight;
}
resize(); addEventListener('resize', resize);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
const Q = 255 / 11;
function put(o, r, g, b, bx) {
  r = Math.round(r / Q + bx); g = Math.round(g / Q + bx); b = Math.round(b / Q + bx);
  r = r < 0 ? 0 : r > 11 ? 11 : r; g = g < 0 ? 0 : g > 11 ? 11 : g; b = b < 0 ? 0 : b > 11 ? 11 : b;
  buf32[o] = 0xff000000 | ((b * Q) << 16) | ((g * Q) << 8) | (r * Q);
}
const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
function skyColor(v) {
  const top = [22, 52, 170], mid = [40, 132, 228], low = [150, 214, 240], hz = [255, 206, 178];
  if (v < 0.55) return mix(top, mid, v / 0.55);
  if (v < 0.85) return mix(mid, low, (v - 0.55) / 0.3);
  return mix(low, hz, (v - 0.85) / 0.15);
}
const WPOS = [[150, 66, 120], [228, 120, 96], [250, 180, 110], [255, 236, 190]];
const WNEG = [[70, 70, 170], [60, 120, 210], [120, 190, 240], [210, 240, 255]];
const RPOS = [[40, 130, 130], [80, 190, 160], [160, 235, 190], [230, 255, 225]];
const RNEG = [[110, 60, 150], [170, 90, 190], [220, 150, 220], [255, 220, 250]];
const IPOS = [[120, 80, 90], [206, 140, 90], [246, 196, 120], [255, 238, 196]];
const INEG = [[34, 26, 80], [24, 18, 60], [16, 12, 44], [10, 8, 30]];
const band = v => v < 0.2 ? -1 : v < 0.38 ? 0 : v < 0.58 ? 1 : v < 0.8 ? 2 : 3;
const lap = new Float32Array(NI);
let lastTx = -1, facing = 1;

const TRUCK = [
  '..wwwwwwwwwww.....',
  '..wwwwwwwwwwwwsw..',
  '..wsswwsswwwwwccw.',
  '..wwwwwwwwwwwwccww',
  '..sssssssssssswwww',
  'rrrrrrrrrrrrrrrrrr',
  '.kkk..rpppr...kkk.',
  'kkKkk.......kkKkk.',
  '.kkk.........kkk..',
];
const TCOL = { w: [250, 244, 232], s: [196, 176, 196], c: [90, 170, 230], r: [60, 40, 80], k: [36, 26, 50], K: [200, 190, 200], p: [120, 110, 130] };
const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const ss = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

function render(t) {
  const W = RW, H = RH, Y0 = Math.round(H * 0.33);
  const GH = H - Y0 - 1;
  const sx2px = x => (x + 0.5) / NXI * W;
  const sunX = W * 0.3, sunY = Y0 * 0.62;
  for (let y = 0; y < Y0; y++) {
    const sc = skyColor(y / Y0);
    for (let x = 0; x < W; x++) {
      let r = sc[0], g = sc[1], b = sc[2];
      const dd = Math.hypot(x - sunX, (y - sunY) * 1.1);
      if (dd < 7) { r = 255; g = 246; b = 214; }
      else { const hl = Math.exp(-(dd - 7) / 20) * 0.7; r += (255 - r) * hl; g += (214 - g) * hl; b += (170 - b) * hl; }
      const u = x / W;
      for (let c = 0; c < 3; c++) {
        const cx = ((0.18 + c * 0.37 + t * 0.004) % 1.1) - 0.05, cy = 0.2 + c * 0.13;
        for (let q = 0; q < 6; q++) {
          const bx = cx + (hash(c * 17 + q) - 0.5) * 0.12, by = cy - hash(c * 31 + q) * 0.06, br = 0.025 + hash(c * 7 + q * 3) * 0.03;
          const ex = (u - bx) * W / H, ey = y / H - by, qq = ex * ex + ey * ey;
          if (qq < br * br) { const s = ey + br * 0.35; if (s < 0) { r = 255; g = 244; b = 232; } else if (s < br * 0.55) { if (g > 206 || r < 250) { r = 250; g = 206; b = 214; } } else if (r < 250) { r = 170; g = 150; b = 220; } }
        }
      }
      const d1 = Y0 - 9 - 5 * Math.pow(Math.abs(Math.sin(x * 0.021 + 0.7)), 1.6) - 2 * Math.sin(x * 0.07);
      const d2 = Y0 - 4 - 4 * Math.pow(Math.abs(Math.sin(x * 0.034 + 2.1)), 1.4);
      if (y > d2) { r = 150; g = 66; b = 120; } else if (y > d1) { const lit = Math.cos(x * 0.021 + 0.7) > 0; r = lit ? 250 : 228; g = lit ? 180 : 120; b = lit ? 150 : 110; r = r * 0.9 + 25; }
      put(y * W + x, r, g, b, BAYER[((y & 3) << 2) | (x & 3)]);
    }
  }
  const fwd = phase === 0 || (phase === 1 && k === 0 && false);
  const showSim = phase === 0 ? simT : phase === 1 ? simR : null;
  let amax = 1e-9;
  if (showSim) { const u = showSim.u; for (let z = 0; z < NZI; z++) { const r = (z + B) * GX + B; for (let x = 0; x < NXI; x++) { const v = Math.abs(u[r + x]); if (v > amax) amax = v; } } }
  let mxI = 0;
  {
    const part = phase === 1 ? 1 : 0;
    let mx = 0; if (part) for (let i = 0; i < NI; i++) if (illum[i] > mx) mx = illum[i];
    const im = lap;
    const src = new Float32Array(NI);
    for (let i = 0; i < NI; i++) src[i] = imgAll[i] + (part ? imgShot[i] / (illum[i] + mx * 0.02) : 0);
    for (let z = 0; z < NZI; z++) for (let x = 0; x < NXI; x++) {
      const i = z * NXI + x;
      if (z < 1 || z >= NZI - 1 || x < 1 || x >= NXI - 1) { im[i] = 0; continue; }
      const v = -(src[i - 1] + src[i + 1] + src[i - NXI] + src[i + NXI] - 4 * src[i]);
      const zt = ss(4, 12, z) * ss(0, 14, x) * ss(0, 14, NXI - 1 - x) * ss(0, 8, NZI - 1 - z);
      im[i] = v * zt * (0.7 + 2.2 * z / NZI);
    }
  }
  const IREF = 1.0;
  let fade = 1; const tc = t; if (tc > CYCLE - 1.1) fade = 1 - ss(CYCLE - 1.1, CYCLE - 0.1, tc);
  const pal = phase === 1 ? [RPOS, RNEG] : [WPOS, WNEG];
  const u = showSim ? showSim.u : null;
  const gain = 1 / amax;
  for (let y = Y0 + 1; y < H; y++) {
    const zf = (y - Y0 - 1) / GH * NZI - 0.5, z0 = Math.max(0, Math.min(NZI - 2, Math.floor(zf))), fz = Math.min(1, Math.max(0, zf - z0));
    const depth = (y - Y0) / GH;
    const base = mix([58, 40, 108], [20, 14, 50], Math.pow(depth, 0.8));
    for (let x = 0; x < W; x++) {
      const xf = x / W * NXI - 0.5, x0 = Math.max(0, Math.min(NXI - 2, Math.floor(xf))), fx = Math.min(1, Math.max(0, xf - x0));
      const bx = BAYER[((y & 3) << 2) | (x & 3)];
      let r = base[0], g = base[1], b = base[2];
      const gr = hash(Math.floor(x / 3) * 0.37 + y * 13.1) - 0.5; r += gr * 6; g += gr * 4; b += gr * 8;
      const ii = z0 * NXI + x0;
      const iv = ((lap[ii] * (1 - fx) + lap[ii + 1] * fx) * (1 - fz) + (lap[ii + NXI] * (1 - fx) + lap[ii + NXI + 1] * fx) * fz) / IREF * fade;
      const ib = band(Math.abs(iv));
      if (ib >= 0) { const c = iv > 0 ? IPOS[ib] : INEG[ib]; r = c[0]; g = c[1]; b = c[2]; }
      if (u) {
        const gi = (z0 + B) * GX + x0 + B;
        const wv = ((u[gi] * (1 - fx) + u[gi + 1] * fx) * (1 - fz) + (u[gi + GX] * (1 - fx) + u[gi + GX + 1] * fx) * fz) * gain;
        const m = Math.sqrt(Math.abs(wv)) * (1 + depth * 0.6);
        const wb = band(m);
        if (wb >= 0) { const c = (wv > 0 ? pal[0] : pal[1])[wb]; const a = wb === 0 ? 0.55 : 1; r += (c[0] - r) * a; g += (c[1] - g) * a; b += (c[2] - b) * a; }
      }
      put(y * W + x, r, g, b, bx);
    }
  }
  for (let x = 0; x < W; x++) {
    put(Y0 * W + x, 255, 214, 150, BAYER[(Y0 & 3) << 2 | (x & 3)]);
    put((Y0 - 1) * W + x, 250, 186, 120, BAYER[((Y0 - 1) & 3) << 2 | (x & 3)]);
    put((Y0 - 2) * W + x, 236, 150, 110, BAYER[((Y0 - 2) & 3) << 2 | (x & 3)]);
  }
  const kRec = phase === 0 ? Math.max(0, k - 1) : -1;
  for (let gxi = 4; gxi < NXI; gxi += 8) {
    const px = Math.round(sx2px(gxi));
    let jump = 0, glow = 0;
    if (kRec >= 0) { const v = Math.abs(simT.u[(ZR + B) * GX + gxi + B]) * gain; jump = v > 0.12 ? 1 : 0; }
    else if (phase === 1) { const kk = K - 1 - k; let e = 0; for (let d = 0; d < 12 && kk - d >= 0; d++) e += Math.abs(rec[(kk - d) * NXI + gxi]); glow = Math.min(1, e / (recMax * 3)); }
    const yy = Y0 - 3 - jump;
    if (glow > 0.15) { put(yy * W + px, 160, 255, 210, 0); put((yy + 1) * W + px, 120, 230, 190, 0); put((yy - 1) * W + px, 230, 255, 240, 0); if (glow > 0.5) put((yy - 2) * W + px, 160, 255, 210, 0); }
    else { put(yy * W + px, 255, 140, 60, 0); put((yy + 1) * W + px, 255, 170, 80, 0); put((yy - 1) * W + px, 90, 40, 70, 0); }
  }
  let tx;
  const st = Math.min(SHOTS.length, Math.floor(t / SHOT_DUR)), su = t - st * SHOT_DUR;
  if (st >= SHOTS.length) tx = sx2px(SHOTS[SHOTS.length - 1]) + (sx2px(SHOTS[0]) - sx2px(SHOTS[SHOTS.length - 1])) * ss(0.2, 1.6, t - SHOTS.length * SHOT_DUR);
  else if (su < FWD_DUR + 0.4) tx = sx2px(SHOTS[st]);
  else { const nx = st + 1 < SHOTS.length ? SHOTS[st + 1] : SHOTS[st]; tx = sx2px(SHOTS[st]) + (sx2px(nx) - sx2px(SHOTS[st])) * ss(FWD_DUR + 0.4, SHOT_DUR - 0.2, su); }
  const shaking = st < SHOTS.length && su < 0.7;
  const moving = st < SHOTS.length ? su > FWD_DUR + 0.4 && su < SHOT_DUR - 0.2 : (t - SHOTS.length * SHOT_DUR) > 0.2 && (t - SHOTS.length * SHOT_DUR) < 1.6;
  const jx = shaking ? ((Math.floor(t * 30) & 1) ? 1 : 0) : 0, jy = moving && (Math.floor(t * 8) & 1) ? -1 : 0;
  const ox = Math.round(tx) - 9 + jx, oy = Y0 - 2 - TRUCK.length + jy;
  if (Math.abs(tx - lastTx) > 0.05) facing = tx > lastTx ? 1 : -1; lastTx = tx;
  TRUCK.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) {
    let ch = row[facing > 0 ? rx : row.length - 1 - rx]; if (ch === '.') continue;
    if (ch === 'p' && shaking) continue;
    const c = TCOL[ch], px = ox + rx, py = oy + ry; if (px < 0 || px >= W || py < 0 || py >= H) continue;
    put(py * W + px, c[0], c[1], c[2], 0);
  } });
  if (shaking) for (let rx = 7; rx < 11; rx++) put((Y0 - 2) * W + ox + rx, 120, 110, 130, 0);
  if (st < SHOTS.length && su < 0.5) {
    const a = 1 - su / 0.5;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -8; dx <= 8; dx++) {
      const d = Math.hypot(dx, dy * 2.2); if (d > 8 * a + 1) continue;
      const px = Math.round(tx) + dx, py = Y0 - 1 + dy; if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const o = py * W + px, p = buf32[o]; const r = p & 255, g = p >> 8 & 255, b = p >> 16 & 255;
      put(o, r + (255 - r) * a * 0.8, g + (240 - g) * a * 0.8, b + (200 - b) * a * 0.6, BAYER[((py & 3) << 2) | (px & 3)]);
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, cv.width, cv.height);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.22;
  ctx.filter = 'blur(' + Math.round(cv.height / 90) + 'px) brightness(1.1)';
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, cv.width, cv.height);
  ctx.restore();
}

if (FIXED !== null) {
  const t0 = performance.now();
  const tc = ((FIXED % CYCLE) + CYCLE) % CYCLE;
  resetAll(); advanceTo(tc); render(tc);
  window.__ms = Math.round(performance.now() - T_START);
  if (qs.has('debug')) { let m = 0; for (let i = 0; i < NI; i++) m = Math.max(m, Math.abs(lap[i])); const a = Array.from(lap).map(Math.abs).sort((a, b) => b - a); window.__ms += ' lapmax ' + m.toExponential(3) + ' p1% ' + a[Math.floor(NI * 0.01)].toExponential(3); }
  document.title = 'done';
} else {
  const start = performance.now(); let cyc = -1;
  (function loop() {
    const T = (performance.now() - start) / 1000, c = Math.floor(T / CYCLE), tc = T - c * CYCLE;
    if (c !== cyc) { cyc = c; resetAll(); }
    advanceTo(tc); render(tc); requestAnimationFrame(loop);
  })();
}
})();
