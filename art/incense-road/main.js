(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
let seed = 20260925;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

const GW = 320, GH = 180, G = GW * GH;
const perm = new Float32Array(256 * 256); for (let i = 0; i < perm.length; i++) perm[i] = rnd();
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const a = perm[(yi & 255) * 256 + (xi & 255)], b = perm[(yi & 255) * 256 + ((xi + 1) & 255)],
        c = perm[((yi + 1) & 255) * 256 + (xi & 255)], d = perm[((yi + 1) & 255) * 256 + ((xi + 1) & 255)];
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const elev = new Float32Array(G);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  let f = 0, amp = 1, fr = 1 / 95, sum = 0;
  for (let o = 0; o < 5; o++) { let n = vn(x * fr + o * 17.3, y * fr - o * 9.1); if (o < 2) n = 1 - Math.abs(n * 2 - 1); f += n * amp; sum += amp; amp *= 0.5; fr *= 2.03; }
  elev[y * GW + x] = f / sum;
}
{ let mn = 1e9, mx = -1e9; for (const v of elev) { mn = Math.min(mn, v); mx = Math.max(mx, v); } for (let i = 0; i < G; i++) elev[i] = (elev[i] - mn) / (mx - mn); }

const wells = [];
for (let tries = 0; wells.length < 9 && tries < 5000; tries++) {
  let x = 26 + rnd() * (GW - 52), y = 24 + rnd() * (GH - 48);
  for (let s = 0; s < 40; s++) {
    const i = (y | 0) * GW + (x | 0); const gx = elev[i + 1] - elev[i - 1], gy = elev[i + GW] - elev[i - GW];
    x = Math.min(GW - 24, Math.max(24, x - Math.sign(gx) * 0.8)); y = Math.min(GH - 20, Math.max(20, y - Math.sign(gy) * 0.8)); }
  if (wells.every(w => Math.hypot(w[0] - x, w[1] - y) > 62)) wells.push([x, y]);
}

const NA = 20000;
const ax = new Float32Array(NA), ay = new Float32Array(NA), ah = new Float32Array(NA);
let trail = new Float32Array(G), tnext = new Float32Array(G);
for (let i = 0; i < NA; i++) { const w = wells[i % wells.length]; const r = rnd() * 6, a = rnd() * 6.2832;
  ax[i] = w[0] + Math.cos(a) * r; ay[i] = w[1] + Math.sin(a) * r; ah[i] = rnd() * 6.2832; }
const SA = 0.42, RA = 0.38, SD = 9, STEP = 1.1, DEP = 4, DECAY = 0.915, CLIMB = 26;
const RT = new Float32Array(65536); for (let i = 0; i < RT.length; i++) RT[i] = rnd();
let rtp = 0;
function sense(x, y) { const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= GW || yi >= GH) return -99; const i = yi * GW + xi; return trail[i] - elev[i] * CLIMB; }
function step() {
  for (const w of wells) { const i = (w[1] | 0) * GW + (w[0] | 0); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) trail[i + dy * GW + dx] += 14; }
  for (let k = 0; k < NA; k++) {
    let x = ax[k], y = ay[k], hd = ah[k];
    if ((k + done * 37) % 300 === 0) { const w = wells[(k + done) % wells.length]; x = w[0]; y = w[1]; hd = RT[(k * 7 + done) & 65535] * 6.2832; }
    const f = sense(x + Math.cos(hd) * SD, y + Math.sin(hd) * SD);
    const l = sense(x + Math.cos(hd - SA) * SD, y + Math.sin(hd - SA) * SD);
    const r = sense(x + Math.cos(hd + SA) * SD, y + Math.sin(hd + SA) * SD);
    const rr = RT[rtp = (rtp + 1) & 65535];
    if (f >= l && f >= r) {}
    else if (f < l && f < r) hd += rr < 0.5 ? RA : -RA;
    else if (l > r) hd -= RA; else hd += RA;
    hd += (rr - 0.5) * 0.12;
    x += Math.cos(hd) * STEP; y += Math.sin(hd) * STEP;
    if (x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1) { x = Math.min(GW - 2, Math.max(1, x)); y = Math.min(GH - 2, Math.max(1, y)); hd += 3.1416 * (0.5 + rr); }
    ax[k] = x; ay[k] = y; ah[k] = hd;
    trail[(y | 0) * GW + (x | 0)] += DEP;
  }
  for (let y = 1; y < GH - 1; y++) { const r0 = y * GW;
    for (let x = 1; x < GW - 1; x++) { const i = r0 + x;
      tnext[i] = (trail[i] * 4 + trail[i - 1] + trail[i + 1] + trail[i - GW] + trail[i + GW]) * 0.125 * DECAY; } }
  const t2 = trail; trail = tnext; tnext = t2;
}

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H, img, px;
function resize() { const d = Math.min(1.5, devicePixelRatio || 1); W = cv.width = Math.round(innerWidth * d); H = cv.height = Math.round(innerHeight * d); img = ctx.createImageData(W, H); px = img.data; }
resize();
function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
const smooth = new Float32Array(G);
const LEVELS = 16;
const PAPER = [240, 231, 212], PINK = [255, 72, 148], BLUE = [40, 92, 186];

function draw(t) {
  let sum = 0, cnt = 0; for (let i = 0; i < G; i++) { smooth[i] = trail[i]; if (trail[i] > 0.5) { sum += trail[i]; cnt++; } }
  const norm = 1 / ((sum / Math.max(1, cnt)) * 3.2 + 1e-6);
  const sc = Math.max(W / (GW - 8), H / (GH - 8)), ox = (W - GW * sc) / 2, oy = (H - GH * sc) / 2;
  const cell = Math.max(3, Math.round(sc * 0.9));
  const misX = Math.round(sc * 0.35), misY = -Math.round(sc * 0.2);
  const ca = Math.cos(0.26), sa = Math.sin(0.26), cb = Math.cos(1.31), sb = Math.sin(1.31);
  const bil = (arr, gx, gy) => { if (gx < 0) gx = 0; if (gy < 0) gy = 0; if (gx > GW - 1.001) gx = GW - 1.001; if (gy > GH - 1.001) gy = GH - 1.001;
    const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * GW + x0;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + GW] * (1 - fx) + arr[i + GW + 1] * fx) * fy; };
  const inv = 1 / sc;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (x - ox) * inv, gy = (y - oy) * inv;
    let ink = Math.min(1, bil(smooth, gx, gy) * norm);
    ink = ink * ink * (3 - 2 * ink);
    const u = (x * ca + y * sa) / cell, v = (-x * sa + y * ca) / cell;
    const du = u - Math.round(u), dv = v - Math.round(v);
    const dist = Math.sqrt(du * du + dv * dv);
    let pink = ink > 0.88 ? 1 : (dist < Math.sqrt(ink) * 0.62 ? 1 : 0);
    const bx = (x - ox - misX) * inv, by = (y - oy - misY) * inv;
    const e = bil(elev, bx, by);
    const ce = e * LEVELS, fr = ce - Math.floor(ce);
    const gxe = bil(elev, bx + 0.6, by) - bil(elev, bx - 0.6, by), gye = bil(elev, bx, by + 0.6) - bil(elev, bx, by - 0.6);
    const dpx = Math.sqrt(gxe * gxe + gye * gye) / 1.2 * LEVELS * inv + 1e-5;
    const cd = Math.min(fr, 1 - fr) / dpx;
    const major = (Math.floor(ce + 0.5) % 4) === 0;
    const lwpx = Math.max(0.6, sc * 0.16) * (major ? 1.9 : 1);
    let blue = Math.max(0, Math.min(1, lwpx - cd + 0.5));
    const shade = Math.max(0, 0.42 - e) * 0.9;
    const u2 = (x * cb + y * sb) / (cell * 0.8), v2 = (-x * sb + y * cb) / (cell * 0.8);
    const d2u = u2 - Math.round(u2), d2v = v2 - Math.round(v2);
    if (Math.sqrt(d2u * d2u + d2v * d2v) < Math.sqrt(shade) * 0.5) blue = Math.max(blue, 0.8);
    const g = hash(x, y), g2 = vn(x / 23 + 50, y / 23);
    pink *= (g > 0.08 ? 0.92 : 0.4) * (0.72 + 0.28 * Math.min(1, g2 * 1.6));
    blue *= g > 0.1 ? 0.78 : 0.3;
    const o = (y * W + x) * 4;
    const pr = 1 - pink * (1 - PINK[0] / 255), pg = 1 - pink * (1 - PINK[1] / 255), pb = 1 - pink * (1 - PINK[2] / 255);
    const br = 1 - blue * (1 - BLUE[0] / 255), bg = 1 - blue * (1 - BLUE[1] / 255), bb = 1 - blue * (1 - BLUE[2] / 255);
    const paper = 1 - (g - 0.5) * 0.05;
    px[o] = PAPER[0] * pr * br * paper; px[o + 1] = PAPER[1] * pg * bg * paper; px[o + 2] = PAPER[2] * pb * bb * paper; px[o + 3] = 255;
  }
  const dot = Math.max(1, Math.round(sc * 0.3));
  for (let k = 0; k < NA; k += 16) {
    const X = Math.round(ox + ax[k] * sc + misX), Y = Math.round(oy + ay[k] * sc + misY);
    for (let dy = 0; dy < dot; dy++) for (let dx = 0; dx < dot; dx++) {
      const xx = X + dx, yy = Y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const o = (yy * W + xx) * 4; px[o] *= BLUE[0] / 255; px[o + 1] *= BLUE[1] / 255; px[o + 2] *= BLUE[2] / 255; }
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  wells.forEach((w, k) => {
    const X = ox + w[0] * sc, Y = oy + w[1] * sc, R = sc * 2.6;
    ctx.fillStyle = 'rgb(255,72,148)'; ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgb(40,92,186)'; ctx.lineWidth = Math.max(1.5, sc * 0.45);
    ctx.beginPath(); ctx.arc(X + misX, Y + misY, R * 1.9, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = 'rgb(40,92,186)';
    ctx.font = `italic ${Math.round(sc * 5.2)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(['i','ii','iii','iv','v','vi','vii','viii','ix'][k], X + misX + R * 2.4, Y + misY - R * 1.4);
  });
  ctx.font = `${Math.round(Math.max(11, sc * 3.6))}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgb(40,92,186)';
  const sim = Math.round(t * SPS);
  ctx.fillText(`fig. 9  wells i–ix, 20 000 agents, step ${String(sim).padStart(4, '0')}`, ox + sc * 12 + misX, H - oy - sc * 9 + misY);
  ctx.restore();
}

const SPS = 22, CAP = 60;
let done = 0;
function advanceTo(t) { const target = Math.floor(Math.min(t, CAP) * SPS); while (done < target) { step(); done++; } }
if (FIXED !== null) {
  const t0 = performance.now();
  advanceTo(FIXED); draw(FIXED);
  window.__ms = Math.round(performance.now() - t0);
  document.title = 'done';
} else {
  const start = performance.now();
  addEventListener('resize', resize);
  (function loop() {
    const t = (performance.now() - start) / 1000;
    const target = Math.floor(t * SPS); let n = 0;
    while (done < target && n < 4) { step(); done++; n++; }
    draw(t); requestAnimationFrame(loop);
  })();
}
})();
