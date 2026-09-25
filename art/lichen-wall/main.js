(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
const P = (k, d) => qs.has(k) ? parseFloat(qs.get(k)) : d;
let seed = 31337;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const PN = 256, perm = new Uint8Array(PN * 2), grad = new Float32Array(PN);
for (let i = 0; i < PN; i++) { perm[i] = i; grad[i] = rnd(); }
for (let i = PN - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
for (let i = 0; i < PN; i++) perm[i + PN] = perm[i];
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = grad[perm[(xi & 255) + perm[yi & 255]]], b = grad[perm[((xi + 1) & 255) + perm[yi & 255]]];
  const c = grad[perm[(xi & 255) + perm[(yi + 1) & 255]]], d = grad[perm[((xi + 1) & 255) + perm[(yi + 1) & 255]]];
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * vn(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

const SW = 256, SH = 144, SN = SW * SH;
const stoneId = new Int16Array(SN), edge = new Float32Array(SN), crack = new Float32Array(SN), tone = new Float32Array(64 * 64);
const stones = [];
{
  let y = -4;
  while (y < SH + 30) {
    const h = 17 + rnd() * 12; let x = -rnd() * 30;
    while (x < SW + 40) { const w = 22 + rnd() * 34; stones.push({ cx: x + w / 2, cy: y + h / 2 + (rnd() - 0.5) * h * 0.5, w, h, ph: rnd() * 100, tone: rnd() }); x += w; }
    y += h;
  }
  for (const st of stones) { st.x0 = st.cx - st.w / 2; st.x1 = st.cx + st.w / 2; st.y0 = st.cy - st.h / 2; st.y1 = st.cy + st.h / 2; }
}
const JOINT = P('jw', 0.95);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const wx = x + (fbm(x * 0.06, y * 0.06 + 50, 3) - 0.5) * 7, wy = y + (fbm(x * 0.06 + 20, y * 0.06, 3) - 0.5) * 5;
  let d1 = 1e9, d2 = 1e9, id = -1;
  for (let k = 0; k < stones.length; k++) {
    const st = stones[k], dx = (wx - st.cx) / 1.7, dy = wy - st.cy; if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue;
    const d = Math.hypot(dx, dy);
    if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
  }
  const e = JOINT - (d2 - d1) * 0.5 + (fbm(x * 0.2 + 5, y * 0.2, 2) - 0.5) * 1.2;
  stoneId[y * SW + x] = id; edge[y * SW + x] = e;
}
const crackPaths = [];
function walk(x, y, a, len, w) {
  const pts = [[x, y]];
  for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; pts.push([x, y]);
    if (k > 8 && rnd() < 0.035 && w > 0.5) walk(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5), len * 0.45, w * 0.6); }
  crackPaths.push({ pts, w });
}
walk(SW * 0.42, SH * 0.22, 1.25, 60, 0.8);
walk(SW * 0.62, SH * 0.98, -2.0, 40, 0.6);
for (const c of crackPaths) for (let i = 0; i < c.pts.length; i++) {
  const [px, py] = c.pts[i], w = c.w * (1 - i / c.pts.length * 0.6);
  for (let y = Math.floor(py - 4); y <= py + 4; y++) for (let x = Math.floor(px - 4); x <= px + 4; x++) {
    if (x < 0 || y < 0 || x >= SW || y >= SH) continue;
    const d = Math.hypot(x - px, y - py), v = Math.max(0, 1 - d / (1.2 + w * 2.6));
    if (v > crack[y * SW + x]) crack[y * SW + x] = v;
  }
}

let U = new Float32Array(SN), V = new Float32Array(SN), U2 = new Float32Array(SN), V2 = new Float32Array(SN);
const F = new Float32Array(SN), K = new Float32Array(SN), DTF = new Float32Array(SN);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const i = y * SW + x;
  const damp = smooth(0, 1, y / SH) * 0.6 + 0.4;
  const seam = Math.max(smooth(-1.5, 1.5, edge[i]), crack[i]);
  const m = Math.min(1, Math.max(0, seam + (fbm(x * 0.05 + 40, y * 0.05, 3) - 0.5) * 0.4));
  F[i] = 0.0545 + (fbm(x * 0.08, y * 0.08 + 9, 2) - 0.5) * 0.003;
  K[i] = 0.0612 + (1 - m) * P('ks', 0.0012) + (1 - damp) * P('kd', 0.0012);
  DTF[i] = (0.55 + 0.45 * m) * (0.5 + 0.5 * damp);
  const bd = Math.min(x, y, SW - 1 - x, SH - 1 - y); if (bd < 6) K[i] += (6 - bd) * 0.0012;
  U[i] = 1;
}
function seedAt(cx, cy, r) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { if (x * x + y * y > r * r) continue; const X = Math.round(cx + x), Y = Math.round(cy + y); if (X < 1 || Y < 1 || X >= SW - 1 || Y >= SH - 1) continue; const i = Y * SW + X; U[i] = 0.5; V[i] = 0.25 + rnd() * 0.05; } }
const IPS = P('ips', 70), WARM = P('warm', 250), NSEED = P('nseed', 20);
const seeds = [];
for (let k = 0; k < 4000 && seeds.length < NSEED; k++) {
  const x = 8 + rnd() * (SW - 16), y = 6 + rnd() * (SH - 12), i = (y | 0) * SW + (x | 0);
  const seam = edge[i] > 0.3 || crack[i] > 0.3;
  if (!seam && rnd() > 0.12) continue;
  if (crack[i] < 0.3 && rnd() < 0.45) continue;
  if (seeds.some(q => Math.hypot(q[0] - x, q[1] - y) < 14)) continue;
  const n = seeds.length, when = n < 7 ? -WARM / IPS + n * 0.4 : (n - 7) / (NSEED - 7) * 24 + rnd();
  seeds.push([x, y, when]);
}
const SPORE = seeds.map(s => ({ x: s[0], y: s[1], at: Math.max(0, Math.floor(WARM + s[2] * IPS)) }));
let iter = 0;
const DS = P('ds', 0.42);
const CU = new Float32Array(SN), CV = new Float32Array(SN), CF = new Float32Array(SN), CK = new Float32Array(SN);
for (let i = 0; i < SN; i++) { CU[i] = DTF[i] * DS; CV[i] = DTF[i] * DS * 0.5; CF[i] = DTF[i] * F[i]; CK[i] = DTF[i] * (F[i] + K[i]); }
function gsStep() {
  for (const s of SPORE) if (s.at === iter) seedAt(s.x, s.y, 4);
  for (let y = 1; y < SH - 1; y++) {
    const r = y * SW;
    for (let x = 1; x < SW - 1; x++) {
      const i = r + x;
      const u = U[i], v = V[i];
      const lu = (U[i - 1] + U[i + 1] + U[i - SW] + U[i + SW]) * 0.2 + (U[i - SW - 1] + U[i - SW + 1] + U[i + SW - 1] + U[i + SW + 1]) * 0.05 - u;
      const lv = (V[i - 1] + V[i + 1] + V[i - SW] + V[i + SW]) * 0.2 + (V[i - SW - 1] + V[i - SW + 1] + V[i + SW - 1] + V[i + SW + 1]) * 0.05 - v;
      const uvv = u * v * v;
      const dt = DTF[i], duv = dt * uvv;
      U2[i] = u + CU[i] * lu - duv + CF[i] * (1 - u);
      V2[i] = v + CV[i] * lv + duv - CK[i] * v;
    }
  }
  let tq = U; U = U2; U2 = tq; tq = V; V = V2; V2 = tq;
  iter++;
}
U2.fill(1);

function snailAt(t) {
  const f = t / 30, x = SW * (0.2 + 0.62 * f), y = SH * (0.66 - 0.2 * f) + Math.sin(f * 7 + 0.5) * 5;
  const x2 = SW * (0.2 + 0.62 * (f + 0.01)), y2 = SH * (0.66 - 0.2 * (f + 0.01)) + Math.sin((f + 0.01) * 7 + 0.5) * 5;
  return [x, y, Math.atan2(y2 - y, x2 - x)];
}
function graze(t) {
  const [x, y] = snailAt(t);
  for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
    if (xx * xx + yy * yy > 9) continue; const X = Math.round(x + xx), Y = Math.round(y + yy); if (X < 1 || Y < 1 || X >= SW - 1 || Y >= SH - 1) continue;
    const i = Y * SW + X; V[i] *= 0.3; U[i] = U[i] + (1 - U[i]) * 0.6; trail[i] = Math.min(1, trail[i] + 0.3);
  }
}
const trail = new Float32Array(SN);

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H, RW, RH, SX, SY, SOX, SOY, SC;
let STAT, NZ, BLOOM, HUE, washC, washX, washImg, wash32, dots;
function layout() {
  W = cv.width = innerWidth; H = cv.height = innerHeight; SC = Math.min(W, H) / 600;
  RW = Math.ceil(W / 2); RH = Math.ceil(H / 2);
  const s = Math.max(RW / SW, RH / SH); SX = SY = 1 / s; SOX = (SW - RW / s) / 2; SOY = (SH - RH / s) / 2;
  washC = document.createElement('canvas'); washC.width = RW; washC.height = RH; washX = washC.getContext('2d');
  washImg = washX.createImageData(RW, RH); wash32 = new Uint32Array(washImg.data.buffer);
  prepaint();
}
function sim(f, x, y) {
  if (x < 0) x = 0; else if (x > SW - 1.001) x = SW - 1.001; if (y < 0) y = 0; else if (y > SH - 1.001) y = SH - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, j = y0 * SW + x0;
  return (f[j] * (1 - fx) + f[j + 1] * fx) * (1 - fy) + (f[j + SW] * (1 - fx) + f[j + SW + 1] * fx) * fy;
}
const toS = (sx, sy) => [(sx - SOX) / SX * 2, (sy - SOY) / SY * 2];
function prepaint() {
  const save = seed; seed = 99;
  const lo = document.createElement('canvas'); lo.width = RW; lo.height = RH;
  const lx = lo.getContext('2d'), im = lx.createImageData(RW, RH), d = im.data;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const o = (y * RW + x) * 4, sx = SOX + x * SX, sy = SOY + y * SY;
    const m = fbm(x * 0.02, y * 0.02, 4), fib = Math.pow(Math.abs(Math.sin((x * 0.7 + y * 0.13) * 0.9 + fbm(x * 0.05, y * 0.3, 2) * 12)), 40);
    const g = (rnd() - 0.5) * 5;
    let r = 239 + (m - 0.5) * 14 + g + fib * 6, gg = 232 + (m - 0.5) * 14 + g + fib * 6, b = 217 + (m - 0.5) * 16 + g + fib * 5;
    const e = sim(edge, sx, sy);
    const id = stoneId[Math.min(SH - 1, Math.max(0, Math.round(sy))) * SW + Math.min(SW - 1, Math.max(0, Math.round(sx)))];
    let ink = 0;
    {
      const st = stones[id];
      ink = 0.02 + st.tone * st.tone * 0.16 + (fbm(sx * 0.1 + st.tone * 50, sy * 0.1, 4) - 0.5) * 0.14;
      ink += Math.exp(Math.min(0, e) / 1.2) * 0.16;
      ink += smooth(-0.2, 0.9, (sy - st.cy) / (st.h * 0.5)) * 0.1 + smooth(0.2, 1, (sx - st.cx) / (st.w * 0.5)) * 0.05;
      ink += smooth(0.58, 0.78, vn(sx * 1.9, sy * 1.9)) * 0.05;
      ink *= 0.6 + fbm(sx * 0.03 + 7, sy * 0.03, 3) * 0.7;
      ink = Math.max(0, ink);
    }
    const bw = 0.35 + 0.75 * fbm(sx * 0.035 + 17, sy * 0.035, 2);
    const brush = Math.exp(-Math.pow((JOINT - e) / bw, 2)) * (0.35 + 0.65 * smooth(0.32, 0.5, fbm(sx * 0.09 + 3, sy * 0.09, 3)));
    ink = Math.min(1, Math.max(ink, brush * 0.95));
    ink *= smooth(0.02, 0.2, sy / SH + (fbm(sx * 0.05 + 70, 0, 3) - 0.5) * 0.22);
    d[o] = r * (1 - ink * 0.74); d[o + 1] = gg * (1 - ink * 0.72); d[o + 2] = b * (1 - ink * 0.66); d[o + 3] = 255;
  }
  lx.putImageData(im, 0, 0);
  NZ = new Float32Array(RW * RH); BLOOM = new Float32Array(RW * RH); HUE = new Float32Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const o = y * RW + x, sx = SOX + x * SX, sy = SOY + y * SY;
    NZ[o] = vn(sx * 0.35, sy * 0.35) - 0.5; BLOOM[o] = fbm(sx * 0.06 + 3, sy * 0.06, 3); HUE[o] = fbm(sx * 0.04 + 11, sy * 0.04, 2); }
  STAT = new Uint8ClampedArray(im.data);
  dots = [];
  const sp = 5 * SC;
  for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
    const px = x + (rnd() - 0.5) * sp * 0.9, py = y + (rnd() - 0.5) * sp * 0.9;
    dots.push({ x: px, y: py, sx: SOX + px / 2 * SX, sy: SOY + py / 2 * SY, thr: 0.24 + rnd() * 0.18, r: (1.0 + rnd() * 1.9) * SC, a: -0.35 + (rnd() - 0.5) * 0.9, e: 0.55 + rnd() * 0.45, k: 0.55 + rnd() * 0.45 });
  }
  seed = save;
}
function drawStrokes(c) {
  const save = seed; seed = 4711;
  c.lineCap = 'round';
  for (const st of stones) {
    const n = Math.floor(1 + rnd() * 4);
    for (let k = 0; k < n; k++) {
      const u0 = 0.15 + rnd() * 0.5, v0 = 0.2 + rnd() * 0.6, len = 0.15 + rnd() * 0.3;
      const [x0, y0] = toS(st.x0 + (st.x1 - st.x0) * u0, st.y0 + (st.y1 - st.y0) * v0), [x1, y1] = toS(st.x0 + (st.x1 - st.x0) * (u0 + len), st.y0 + (st.y1 - st.y0) * (v0 + (rnd() - 0.5) * 0.12));
      for (let q = 0; q < 3; q++) {
        c.strokeStyle = `rgba(52,48,44,${0.08 + rnd() * 0.1})`; c.lineWidth = (0.6 + rnd() * 1.4) * SC;
        c.beginPath(); c.moveTo(x0, y0 + q * 2.2 * SC); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + (rnd() - 0.5) * 6 * SC + q * 2.2 * SC, x1, y1 + q * 2.2 * SC); c.stroke();
      }
    }
  }
  for (const cp of crackPaths) {
    const pts = cp.pts.map(p => toS(p[0], p[1]));
    for (let i = 1; i < pts.length; i++) {
      const f = i / pts.length;
      c.strokeStyle = `rgba(30,28,26,${(0.75 - f * 0.35) * smooth(0.05, 0.22, cp.pts[i][1] / SH)})`; c.lineWidth = Math.max(0.5, cp.w * (2.2 - f * 1.6) * SC);
      c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    }
  }
  seed = save;
}

const blurV = new Float32Array(SN), tmpV = new Float32Array(SN);
function blur(src, dst, r) {
  for (let y = 0; y < SH; y++) { const row = y * SW; let acc = 0; for (let x = -r; x <= r; x++) acc += src[row + Math.min(SW - 1, Math.max(0, x))];
    for (let x = 0; x < SW; x++) { tmpV[row + x] = acc / (2 * r + 1); acc += src[row + Math.min(SW - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < SW; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmpV[Math.min(SH - 1, Math.max(0, y)) * SW + x];
    for (let y = 0; y < SH; y++) { dst[y * SW + x] = acc / (2 * r + 1); acc += tmpV[Math.min(SH - 1, y + r + 1) * SW + x] - tmpV[Math.max(0, y - r) * SW + x]; } }
}
function render(t) {
  blur(V, blurV, P('br', 3)); blur(blurV, blurV, P('br2', 2));
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const o = y * RW + x, sx = SOX + x * SX, sy = SOY + y * SY;
    const nz = NZ[o], bloom = BLOOM[o];
    const bv = sim(blurV, sx, sy) + nz * 0.02, wsh = smooth(0.038, 0.05, bv);
    const o4 = o * 4;
    if (wsh <= 0.003) { wash32[o] = 0xff000000 | (STAT[o4 + 2] << 16) | (STAT[o4 + 1] << 8) | STAT[o4]; continue; }
    const ring = wsh * (1 - smooth(0.05, 0.075, bv));
    const h = HUE[o];
    let r, g, b;
    if (h < 0.5) { r = 150; g = 166; b = 124; }
    else if (h < 0.58) { const f = smooth(0.5, 0.58, h); r = 150 + 76 * f; g = 166 + 12 * f; b = 124 - 50 * f; }
    else if (h < 0.66) { r = 226; g = 178; b = 74; }
    else { const f = smooth(0.66, 0.72, h); r = 226 + 4 * f; g = 178 - 58 * f; b = 74 - 24 * f; }
    const v = sim(V, sx, sy), grey = smooth(0.14, 0.32, v) * (0.08 + 0.14 * bloom);
    const a = Math.min(1, wsh * (0.3 + 0.3 * bloom) + ring * 0.22 + grey);
    const mix = grey / (a + 1e-6);
    r = r * (1 - mix) + 60 * mix; g = g * (1 - mix) + 58 * mix; b = b * (1 - mix) + 54 * mix;
    const mr = 1 - a + a * r / 255, mg = 1 - a + a * g / 255, mb = 1 - a + a * b / 255;
    wash32[o] = 0xff000000 | ((STAT[o4 + 2] * mb) << 16) | ((STAT[o4 + 1] * mg) << 8) | (STAT[o4] * mr);
  }
  washX.putImageData(washImg, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(washC, 0, 0, W, H);
  drawStrokes(ctx);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.restore();
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (const d of dots) {
    const v = sim(V, d.sx, d.sy); if (v < d.thr) continue;
    const s = Math.min(1, (v - d.thr) * 6), a = (0.35 + 0.6 * s) * d.k, rr = d.r * (0.7 + 0.6 * s);
    const pth = paths[Math.min(3, Math.floor(a * 4.4))];
    pth.moveTo(d.x + rr, d.y); pth.ellipse(d.x, d.y, rr, rr * d.e, d.a, 0, 6.283);
  }
  for (let q = 0; q < 4; q++) { ctx.fillStyle = `rgba(26,24,22,${0.2 + q * 0.23})`; ctx.fill(paths[q]); }
  ctx.save(); ctx.strokeStyle = 'rgba(70,66,60,0.22)'; ctx.lineCap = 'round'; ctx.lineWidth = 1.1 * SC; ctx.setLineDash([9 * SC, 4 * SC, 3 * SC, 5 * SC]);
  ctx.beginPath(); for (let k = 0; k <= 60; k++) { const tt = Math.min(t, 36) * k / 60; const [sx, sy] = snailAt(tt); const [px, py] = toS(sx, sy); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke(); ctx.restore();
  drawSnail(t);
  seal();
}
const toScreen = (sx, sy) => toS(sx, sy);
function drawSnail(t) {
  const [sx, sy, a] = snailAt(t), [x, y] = toScreen(sx, sy), s = Math.min(W, H) / 600 * 1.7;
  const creep = Math.sin(t * 2.2) * 0.08;
  ctx.scale(1, 1);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(70,64,56,0.55)';
  ctx.beginPath(); ctx.moveTo(-17, 3); ctx.quadraticCurveTo(-4, 7 + creep * 10, 14 + creep * 20, 4); ctx.quadraticCurveTo(20 + creep * 20, 1, 16 + creep * 20, -3); ctx.quadraticCurveTo(0, -1, -17, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,32,0.85)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(15 + creep * 20, -2); ctx.quadraticCurveTo(20 + creep * 20, -9, 22 + creep * 20, -13); ctx.moveTo(14 + creep * 20, -2); ctx.quadraticCurveTo(16 + creep * 20, -8, 15.5 + creep * 20, -12); ctx.stroke();
  ctx.fillStyle = 'rgba(30,26,24,0.9)'; ctx.beginPath(); ctx.arc(22 + creep * 20, -13, 1.3, 0, 6.283); ctx.arc(15.5 + creep * 20, -12, 1.1, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(188,140,78,0.55)'; ctx.beginPath(); ctx.ellipse(-3, -6, 12, 11, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(28,24,22,0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let k = 0; k <= 80; k++) { const th = k / 80 * 4.2 * Math.PI, rr = 11.5 * Math.exp(-th * 0.19); const px = -3 + Math.cos(th + 2.6) * rr, py = -6 + Math.sin(th + 2.6) * rr * 0.95; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke();
  ctx.restore();
}
function seal() {
  const s = Math.min(W, H) / 600, x = W * 0.5 + Math.min(W * 0.2, H * 0.36) - 34 * s, y = 34 * s, w = 22 * s;
  ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#b8322a';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + 1 * s); ctx.lineTo(x + w - 0.5 * s, y + w); ctx.lineTo(x + 0.5 * s, y + w - 0.8 * s); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#efe6d4'; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) { const th = k / 40 * 3.4 * Math.PI, rr = 7.5 * s * Math.exp(-th * 0.2); const px = x + w / 2 + Math.cos(th) * rr, py = y + w / 2 + Math.sin(th) * rr; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke(); ctx.restore();
}

let grazedTo = 0;
function advanceTo(t) {
  const target = WARM + Math.floor(Math.min(t, 36) * IPS);
  while (iter < target) {
    gsStep();
    const tt = (iter - WARM) / IPS;
    if (tt > grazedTo + 0.05 && tt <= 36) { grazedTo = tt; graze(tt); }
    if ((iter & 7) === 0) for (let i = 0; i < SN; i++) trail[i] *= 0.995;
  }
}
layout();
addEventListener('resize', layout);
if (FIXED !== null) {
  const t0 = performance.now();
  advanceTo(FIXED);
  const t1 = performance.now();
  render(Math.min(FIXED, 36));
  { let mx = 0, cov = 0; for (let i = 0; i < SN; i++) { if (V[i] > mx) mx = V[i]; if (V[i] > 0.2) cov++; } window.__dbg = 'seeds ' + SPORE.length + ' vmax ' + mx.toFixed(3) + ' cov ' + (cov / SN).toFixed(3); }
  ctx.getImageData(0, 0, 1, 1);
  window.__ms = Math.round(performance.now() - t0) + ' (render ' + Math.round(performance.now() - t1) + ')';
  document.title = 'done';
} else {
  const start = performance.now();
  (function loop() {
    const t = (performance.now() - start) / 1000;
    advanceTo(t); render(Math.min(t, 36));
    requestAnimationFrame(loop);
  })();
}
})();
