(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
let seed = 1987;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

const NX = 128, NY = 72, NC = NX * NY;
const u = new Float32Array(NC), v = new Float32Array(NC), T = new Float32Array(NC), Q = new Float32Array(NC), C = new Float32Array(NC);
const u2 = new Float32Array(NC), v2 = new Float32Array(NC), T2 = new Float32Array(NC), Q2 = new Float32Array(NC), C2 = new Float32Array(NC);
const R = new Float32Array(NC), R2 = new Float32Array(NC);
const p = new Float32Array(NC), div = new Float32Array(NC), curl = new Float32Array(NC);
const I = (x, y) => y * NX + ((x % NX) + NX) % NX;
const GROUND = 7;
const BUOY = P('buoy', 0.012), GRAV = P('grav', 0.004), LAT = P('lat', 3), VORT = P('vort', 0.35);
function P(k, d) { return qs.has(k) ? parseFloat(qs.get(k)) : d; }
const QSRC = P('qsrc', 0.06), HUM = P('hum', 0.95);
const SHEAR = P('shear', 0.22), RAIN = P('rain', 0.3), ANV = P('anv', 0.0015);
const QS0 = 1.0, QSH = 22, BASE = P('base', 18);
const qsat = new Float32Array(NY); for (let y = 0; y < NY; y++) qsat[y] = y < BASE ? 3 : QS0 * Math.exp(-(y - BASE) / QSH);
const sources = []; for (let k = 0; k < 5; k++) sources.push({ x: 8 + k * 25 + rnd() * 8, w: 9 + rnd() * 6, s: 0.6 + rnd() * 0.6, ph: rnd() * 6.28, f: 0.03 + rnd() * 0.03 });
const AMB = new Float32Array(NY);
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) Q[I(x, y)] = AMB[y] = (y < BASE ? QS0 : qsat[y]) * (HUM - 0.1 * y / NY);

function samp(f, x, y) {
  if (y < 0) y = 0; if (y > NY - 1.001) y = NY - 1.001;
  const x0 = Math.floor(x), y0 = y | 0, fx = x - x0, fy = y - y0;
  const a = f[I(x0, y0)], b = f[I(x0 + 1, y0)], c = f[I(x0, y0 + 1)], d = f[I(x0 + 1, y0 + 1)];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
let stepN = 0;
function step() {
  const tt = stepN * 0.2;
  for (const s of sources) {
    const k = s.s * (0.55 + 0.45 * Math.sin(tt * s.f + s.ph));
    for (let y = GROUND; y < GROUND + 3; y++) for (let dx = -s.w; dx <= s.w; dx++) {
      const i = I(Math.round(s.x + dx), y), fall = (1 - Math.abs(dx) / (s.w + 1)) * (0.35 + 0.65 * Math.max(0, Math.sin(dx * 0.7 + tt * 0.9 * s.f * 10 + s.ph * 3)));
      T[i] += 0.065 * k * fall; Q[i] += QSRC * k * fall;
    }
  }
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    if (y < GROUND) { u[i] = v[i] = 0; T[i] = 0; continue; }
    const qs = qsat[y];
    if (Q[i] > qs) { const d = (Q[i] - qs) * 0.5; Q[i] -= d; C[i] += d; T[i] += LAT * d; }
    else if (C[i] > 0) { const e = Math.min(C[i], (qs - Q[i]) * 0.25); C[i] -= e; Q[i] += e; T[i] -= LAT * e; }
    v[i] += BUOY * T[i] - GRAV * C[i];
    T[i] *= 0.996; u[i] += (SHEAR * (y - GROUND) / NY - u[i]) * 0.01; v[i] *= 0.995;
    if (y > NY - 13) { if (T[i] > 0) T[i] *= 1 - 0.02 * (y - NY + 13); v[i] *= 0.97; C[i] *= 1 - ANV * (y - NY + 13); }
    if (y > NY - 5) { C[i] *= 0.9; v[i] *= 0.6; }
    if (C[i] > RAIN) { const r = (C[i] - RAIN) * 0.04; C[i] -= r; T[i] -= r * 3; R[i] += r; }
    C[i] *= 0.9985; Q[i] += (AMB[y] - Q[i]) * 0.003;
  }
  for (let y = 1; y < NY - 1; y++) for (let x = 0; x < NX; x++) curl[y * NX + x] = (v[I(x + 1, y)] - v[I(x - 1, y)] - u[I(x, y + 1)] + u[I(x, y - 1)]) * 0.5;
  for (let y = 2; y < NY - 2; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    let gx = (Math.abs(curl[I(x + 1, y)]) - Math.abs(curl[I(x - 1, y)])) * 0.5, gy = (Math.abs(curl[i + NX]) - Math.abs(curl[i - NX])) * 0.5;
    const l = Math.hypot(gx, gy) + 1e-5; gx /= l; gy /= l;
    u[i] += VORT * gy * curl[i]; v[i] -= VORT * gx * curl[i];
  }
  project();
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x, px = x - u[i], py = y - v[i];
    u2[i] = samp(u, px, py); v2[i] = samp(v, px, py); T2[i] = samp(T, px, py); Q2[i] = samp(Q, px, py); C2[i] = samp(C, px, py);
  }
  u.set(u2); v.set(v2); T.set(T2); Q.set(Q2); C.set(C2);
  project();
  for (let y = 0; y < NY - 1; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x; R[i] = R[i] * 0.82 + R[i + NX] * 0.16 + (R[I(x - 1, y + 1)] + R[I(x + 1, y + 1)]) * 0.005; }
  stepN++;
}
function project() {
  for (let y = 1; y < NY - 1; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x;
    div[i] = -0.5 * (u[I(x + 1, y)] - u[I(x - 1, y)] + v[i + NX] - v[i - NX]); p[i] = 0; }
  for (let it = 0; it < 16; it++) {
    for (let y = 1; y < NY - 1; y++) { const r = y * NX;
      for (let x = 0; x < NX; x++) { const i = r + x;
        const pl = x ? p[i - 1] : p[r + NX - 1], pr = x < NX - 1 ? p[i + 1] : p[r];
        p[i] = (div[i] + pl + pr + p[i - NX] + p[i + NX]) * 0.25; } }
    for (let x = 0; x < NX; x++) { p[x] = p[x + NX]; p[(NY - 1) * NX + x] = p[(NY - 2) * NX + x]; }
  }
  for (let y = 1; y < NY - 1; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x;
    u[i] -= 0.5 * (p[I(x + 1, y)] - p[I(x - 1, y)]); v[i] -= 0.5 * (p[i + NX] - p[i - NX]); }
  for (let x = 0; x < NX; x++) { v[x] = 0; v[(NY - 1) * NX + x] = 0; }
}

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const off = document.createElement('canvas'), octx = off.getContext('2d');
const glow = document.createElement('canvas'), gctx = glow.getContext('2d');
let W, H, RW, RH, img, b32;
function resize() {
  W = cv.width = innerWidth; H = cv.height = innerHeight;
  RW = Math.min(W, 720); RH = Math.round(RW * H / W);
  off.width = RW; off.height = RH; img = octx.createImageData(RW, RH); b32 = new Uint32Array(img.data.buffer);
  glow.width = Math.round(RW / 4); glow.height = Math.round(RH / 4);
}
resize();
const shade = new Float32Array(NC), rim = new Float32Array(NC);
const SUN = [0.55, 0.62];
const Cb = new Float32Array(NC);
function lightField() {
  for (let y = 1; y < NY - 1; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x;
    Cb[i] = (C[i] * 4 + C[I(x - 1, y)] + C[I(x + 1, y)] + C[i - NX] + C[i + NX]) / 8; }
  const sl = Math.hypot(SUN[0], SUN[1]), sxn = SUN[0] / sl, syn = SUN[1] / sl;
  for (let y = 1; y < NY - 1; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    let od = 0, px = x, py = y;
    for (let s = 0; s < 18 && py < NY - 1; s++) { px += sxn * 1.4; py += syn * 1.4; od += samp(C, px, py) * 1.4; }
    const gx = Cb[I(x + 1, y)] - Cb[I(x - 1, y)], gy = Cb[i + NX] - Cb[i - NX];
    const gl = Math.hypot(gx, gy) + 1e-6;
    const lam = -(gx * sxn + gy * syn) / gl;
    const edge = C[i] < 0.14 ? Math.min(1, gl * 20) : 0;
    const trans = Math.exp(-od * P('odk', 0.16));
    shade[i] = Math.max(0, Math.min(1, trans + edge * lam * 0.25));
  }
}
const col = (r, g, b) => 0xff000000 | (b << 16) | (g << 8) | r;
function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
const SKY_TOP = [18, 46, 168], SKY_MID = [36, 112, 226], SKY_LOW = [120, 196, 244], SKY_HZ = [236, 226, 222];
const CL = [[255, 250, 240], [252, 222, 214], [176, 174, 232], [118, 118, 204], [84, 80, 170]];
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; }
function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }

const layers = [];
{ let s = seed; seed = 5150;
  for (let L = 0; L < 2; L++) { const bl = []; let x = -0.02;
    while (x < 1.02) { const w = (0.012 + rnd() * 0.035) * (L ? 1.3 : 0.8), tall = rnd() < (L ? 0.12 : 0.22);
      const h = (tall ? 0.09 + rnd() * 0.12 : 0.025 + rnd() * 0.045) * (L ? 0.8 : 0.75);
      bl.push({ x, w, h, ant: tall && rnd() < 0.6, tank: !tall && rnd() < 0.5, win: rnd() }); x += w + (rnd() < 0.25 ? 0.008 : 0.0015); }
    layers.push(bl); }
  seed = s; }
function paint(t) {
  lightField();
  const sx = NX / RW, groundY = GROUND / NY;
  const frame = Math.floor(t * 24);
  for (let y = 0; y < RH; y++) {
    const gyf = (1 - y / RH) * NY - 0.5; const vy = y / RH;
    const sky = vy < 0.5 ? mix(SKY_TOP, SKY_MID, vy / 0.5) : vy < 0.82 ? mix(SKY_MID, SKY_LOW, (vy - 0.5) / 0.32) : mix(SKY_LOW, SKY_HZ, Math.min(1, (vy - 0.82) / 0.16));
    for (let x = 0; x < RW; x++) {
      const gx = x * sx * (NX / NX) - 0.5;
      const c = samp(C, gx + 0.5, gyf);
      let r = sky[0], g = sky[1], b = sky[2];
      { const dx = (x - RW * 0.9) / RH, dy = (y - RH * 0.08) / RH, d2 = dx * dx + dy * dy; const s2 = Math.exp(-d2 * 9) * 0.55 + Math.exp(-d2 * 60) * 0.4;
        r += (255 - r) * s2; g += (240 - g) * s2; b += (220 - b) * s2; }
      if (vy < 0.45) {
        const cx = x / RW * 3 + t * 0.01, cy = vy * 14;
        const n = vnoise(cx * 1.3, cy * 1.6) * 0.55 + vnoise(cx * 7, cy * 6) * 0.45;
        const band = Math.exp(-Math.pow((vy - 0.16 - 0.05 * Math.sin(cx * 2)) / 0.05, 2));
        const q = n * band;
        if (q > 0.55) { const a = q > 0.64 ? 0.5 : 0.22; r += (250 - r) * a; g += (246 - g) * a; b += (255 - b) * a; }
      }
      const rr = samp(R, gx + 0.5, gyf);
      if (rr > 0.004 && c < 0.2) {
        const sl = ((x * 0.35 + y + frame * 5) % 9 + 9) % 9, dens = Math.min(1, (rr - 0.004) * 90);
        const a = (sl < 1.4 ? 0.55 : 0.18) * dens;
        r += (150 - r) * a; g += (160 - g) * a; b += (215 - b) * a;
      }
      if (c > 0.035) {
        const L = samp(shade, gx + 0.5, gyf) ;
        const k = L > 0.62 ? 0 : L > 0.46 ? 1 : L > 0.28 ? 2 : L > 0.12 ? 3 : 4;
        const cc = CL[k]; const a = Math.min(1, (c - 0.035) * 60);
        r += (cc[0] - r) * a; g += (cc[1] - g) * a; b += (cc[2] - b) * a;
      }
      const n = (hash(x + frame * 131, y + frame * 71) - 0.5) * 14;
      b32[y * RW + x] = col(Math.max(0, Math.min(255, r + n)) | 0, Math.max(0, Math.min(255, g + n)) | 0, Math.max(0, Math.min(255, b + n)) | 0);
    }
  }
  octx.putImageData(img, 0, 0);
  const base = RH * (1 - groundY) + RH * 0.03;
  const LC = [{ body: '#7a83d4', lit: '#f5c7b6', win: null, dy: -RH * 0.035 }, { body: '#262a7c', lit: '#ee9f86', win: '#ffe7a0', dy: 0 }];
  layers.forEach((bl, L) => { const st = LC[L], b0 = base + st.dy;
    for (const k of bl) {
      const x0 = Math.round(k.x * RW), w = Math.max(2, Math.round(k.w * RW)), top = Math.round(b0 - k.h * RH);
      octx.fillStyle = st.body; octx.fillRect(x0, top, w, RH - top);
      octx.fillStyle = st.lit; octx.fillRect(x0 + Math.round(w * 0.7), top, Math.ceil(w * 0.3), RH - top);
      octx.fillStyle = st.body;
      if (k.ant) octx.fillRect(x0 + Math.round(w * 0.4), top - Math.round(RH * 0.045), 1, Math.round(RH * 0.045));
      if (k.tank) { octx.fillRect(x0 + 2, top - 3, 3, 3); octx.fillRect(x0 + w - 6, top - 2, 2, 2); }
      if (st.win) { octx.fillStyle = st.win;
        for (let wy = top + 4; wy < RH - 3; wy += 5) for (let wx = x0 + 2; wx < x0 + w * 0.66 - 1; wx += 3)
          if (hash(wx | 0, wy | 0) < 0.08 + 0.12 * k.win) octx.fillRect(wx | 0, wy | 0, 1, 2); }
    }
  });
  octx.fillStyle = '#1c1f63'; octx.fillRect(0, base, RW, RH - base);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, W, H);
  gctx.filter = 'blur(3px)'; gctx.clearRect(0, 0, glow.width, glow.height); gctx.drawImage(off, 0, 0, glow.width, glow.height); gctx.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.28; ctx.drawImage(glow, 0, 0, W, H); ctx.restore();
}

const SPS = 8, WARM = P('warm', 160), CAP = 30;
let done = 0;
function advanceTo(t) { const target = WARM + Math.floor(Math.min(t, CAP) * SPS); while (done < target) { step(); done++; } }
if (FIXED !== null) {
  const t0 = performance.now(); advanceTo(FIXED); paint(FIXED);
  window.__ms = Math.round(performance.now() - t0); document.title = 'done';
} else {
  addEventListener('resize', resize);
  const start = performance.now(); advanceTo(0);
  (function loop() { const t = (performance.now() - start) / 1000; const target = WARM + Math.floor(t * SPS); let n = 0;
    while (done < target && n < 3) { step(); done++; n++; } paint(t); requestAnimationFrame(loop); })();
}
})();
