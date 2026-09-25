(function(){
'use strict';
const T_START = performance.now();
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
const INK = '#2a1f16', RED = '#b8321f', PAPER = [236, 224, 196];

const DT = 0.00025, SIM_PER_SEC = 0.125, WARM = 1.2, EPS2 = 9e-6;
const SUN = 0, SHEP = 1, DOG = 2;
const bodies = [
  { x: 0, y: 0, vx: 0, vy: 0, m: 1 },
  { a: 0.4, ph: 0.4, m: 0.04 },
  { a: 0.67, ph: 2.9, m: 0.02 },
];
for (let i = 1; i < 3; i++) { const b = bodies[i], v = Math.sqrt((1 + b.m) / b.a); b.x = b.a * Math.cos(b.ph); b.y = b.a * Math.sin(b.ph); b.vx = -v * Math.sin(b.ph); b.vy = v * Math.cos(b.ph); }
{ let px = 0, py = 0; for (let i = 1; i < 3; i++) { px += bodies[i].m * bodies[i].vx; py += bodies[i].m * bodies[i].vy; } bodies[0].vx = -px; bodies[0].vy = -py; }
const NB = 3;
const NM = 56;
const mx = new Float64Array(NM), my = new Float64Array(NM), mvx = new Float64Array(NM), mvy = new Float64Array(NM);
const R = rng(314159);
function hill(i) { const b = bodies[i]; return Math.hypot(b.x - bodies[0].x, b.y - bodies[0].y) * Math.cbrt(b.m / 3); }
function spawn(k, mode) {
  const r = R();
  if (mode === 0 || r < 0.35) {
    const p = mode === 0 ? (k % 3 === 2 ? DOG : SHEP) : (R() < 0.6 ? SHEP : DOG), b = bodies[p], h = hill(p);
    const d = h * (0.4 + R() * 0.6), a = R() * 6.2832, v = Math.sqrt(b.m / d) * (0.75 + R() * 0.4) * (R() < 0.85 ? 1 : -1);
    mx[k] = b.x + d * Math.cos(a); my[k] = b.y + d * Math.sin(a); mvx[k] = b.vx - v * Math.sin(a); mvy[k] = b.vy + v * Math.cos(a);
  } else {
    const p = R() < 0.55 ? SHEP : DOG, b = bodies[p], rr = Math.hypot(b.x, b.y) * (0.88 + R() * 0.24), ang = Math.atan2(b.y, b.x) + (R() - 0.5) * 2.4;
    const v = Math.sqrt(1 / rr) * (0.95 + R() * 0.1);
    mx[k] = rr * Math.cos(ang); my[k] = rr * Math.sin(ang); mvx[k] = -v * Math.sin(ang); mvy[k] = v * Math.cos(ang);
  }
}
for (let k = 0; k < NM; k++) spawn(k, k < 24 ? 0 : 1);

function accBodies(ax, ay) {
  for (let i = 0; i < NB; i++) { ax[i] = 0; ay[i] = 0; }
  for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
    const dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y, r2 = dx * dx + dy * dy + EPS2, f = 1 / (r2 * Math.sqrt(r2));
    ax[i] += dx * f * bodies[j].m; ay[i] += dy * f * bodies[j].m; ax[j] -= dx * f * bodies[i].m; ay[j] -= dy * f * bodies[i].m;
  }
}
const bax = new Float64Array(NB), bay = new Float64Array(NB);
function moonAcc(k, out) {
  let ax = 0, ay = 0;
  for (let i = 0; i < NB; i++) { const b = bodies[i], dx = b.x - mx[k], dy = b.y - my[k], r2 = dx * dx + dy * dy + EPS2, f = b.m / (r2 * Math.sqrt(r2)); ax += dx * f; ay += dy * f; }
  out[0] = ax; out[1] = ay;
}
const tmpA = [0, 0];
const TR = 260, TR_EVERY = 16;
const trX = new Float32Array(NM * TR), trY = new Float32Array(NM * TR), trB = new Int8Array(NM * TR), trLen = new Int32Array(NM);
let trHead = 0;
const PTR = 1400;
const ptX = new Float32Array(3 * PTR), ptY = new Float32Array(3 * PTR); let ptN = 0;
const bound = new Int8Array(NM);
let steps = 0;
function step() {
  accBodies(bax, bay);
  for (let i = 0; i < NB; i++) { bodies[i].vx += bax[i] * DT / 2; bodies[i].vy += bay[i] * DT / 2; }
  for (let k = 0; k < NM; k++) { moonAcc(k, tmpA); mvx[k] += tmpA[0] * DT / 2; mvy[k] += tmpA[1] * DT / 2; }
  for (let i = 0; i < NB; i++) { bodies[i].x += bodies[i].vx * DT; bodies[i].y += bodies[i].vy * DT; }
  for (let k = 0; k < NM; k++) { mx[k] += mvx[k] * DT; my[k] += mvy[k] * DT; }
  accBodies(bax, bay);
  for (let i = 0; i < NB; i++) { bodies[i].vx += bax[i] * DT / 2; bodies[i].vy += bay[i] * DT / 2; }
  for (let k = 0; k < NM; k++) { moonAcc(k, tmpA); mvx[k] += tmpA[0] * DT / 2; mvy[k] += tmpA[1] * DT / 2; }
  steps++;
  if (steps % TR_EVERY === 0) sample();
}
function classify(k) {
  for (const p of [SHEP, DOG]) {
    const b = bodies[p], dx = mx[k] - b.x, dy = my[k] - b.y, d = Math.hypot(dx, dy);
    if (d > hill(p)) continue;
    const dvx = mvx[k] - b.vx, dvy = mvy[k] - b.vy, e = 0.5 * (dvx * dvx + dvy * dvy) - b.m / d;
    if (e < 0) return p;
  }
  return 0;
}
const PLACE = 3.75;
function frameAng() { return Math.atan2(bodies[SHEP].y - bodies[0].y, bodies[SHEP].x - bodies[0].x) - PLACE; }
let fc = 1, fs = 0;
function setFrame() { const a = frameAng(); fc = Math.cos(a); fs = Math.sin(a); }
function rot(x, y) { x -= bodies[0].x; y -= bodies[0].y; return [x * fc + y * fs, -x * fs + y * fc]; }
function sample() {
  setFrame();
  for (let k = 0; k < NM; k++) {
    const r = Math.hypot(mx[k], my[k]);
    if (r > 1.45 || r < 0.035) { spawn(k, 1); trLen[k] = 0; }
    bound[k] = classify(k);
    const o = k * TR + trHead, q = rot(mx[k], my[k]); trX[o] = q[0]; trY[o] = q[1]; trB[o] = bound[k];
    if (trLen[k] < TR) trLen[k]++;
  }
  trHead = (trHead + 1) % TR;
  { const o = ptN % PTR; for (let i = 0; i < 3; i++) { const q = rot(bodies[i].x, bodies[i].y); ptX[i * PTR + o] = q[0]; ptY[i * PTR + o] = q[1]; } ptN++; }
}
function advanceTo(simT) { const target = Math.round(simT / DT); while (steps < target) step(); }

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H, s, CX, CY, SC, paper, ringC;
function resize() {
  const dpr = FIXED !== null ? 1 : Math.min(2, devicePixelRatio || 1);
  W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
  s = H / 600; CX = W / 2; CY = H / 2; SC = H * 0.395 / 0.8;
  buildPaper();
}
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif';
function buildPaper() {
  paper = document.createElement('canvas'); paper.width = W; paper.height = H; const p = paper.getContext('2d');
  const q = 2, w = Math.ceil(W / q), h = Math.ceil(H / q), id = p.createImageData(w, h), r = rng(11);
  const blobs = []; for (let i = 0; i < 26; i++) blobs.push([r() * w, r() * h, (4 + r() * 30) * s / q, r()]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = (Math.sin(x * 0.031 + Math.sin(y * 0.017) * 2) + Math.sin(y * 0.027 + x * 0.009) + Math.sin((x - y) * 0.013)) * 2.2;
    let n = (r() - 0.5) * 9 + m;
    const ex = (x / w - 0.5) * 2, ey = (y / h - 0.5) * 2, vig = Math.pow(Math.max(Math.abs(ex) * 0.85, Math.abs(ey)), 4) * 34 + (ex * ex + ey * ey) * 8;
    let fox = 0; for (const b of blobs) { const d = Math.hypot(x - b[0], y - b[1]) / b[2]; if (d < 1.4) fox += (d < 1 ? 0.6 + 0.4 * d : Math.max(0, 1.4 - d) * 2.5) * (0.4 + b[3] * 0.6); }
    const o = (y * w + x) * 4;
    id.data[o] = PAPER[0] + n - vig * 0.9 - fox * 10; id.data[o + 1] = PAPER[1] + n - vig * 1.1 - fox * 16; id.data[o + 2] = PAPER[2] + n * 0.8 - vig * 1.6 - fox * 26; id.data[o + 3] = 255;
  }
  const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(id, 0, 0);
  p.imageSmoothingEnabled = true; p.drawImage(t, 0, 0, W, H);
  const D = Math.ceil(Math.hypot(W, H)); ringC = document.createElement('canvas'); ringC.width = ringC.height = D;
  const rc = ringC.getContext('2d'); rc.translate(D / 2 - CX, D / 2 - CY);
  drawStatic(p, rc);
}
function drawStatic(pc, cc) {
  let c = cc;
  for (const q of [pc, c]) { q.strokeStyle = INK; q.fillStyle = INK; q.lineCap = 'round'; }
  pc.globalAlpha = 0.5; pc.lineWidth = 1.2 * s; pc.strokeRect(14 * s, 14 * s, W - 28 * s, H - 28 * s);
  pc.globalAlpha = 0.35; pc.lineWidth = 0.6 * s; pc.strokeRect(19 * s, 19 * s, W - 38 * s, H - 38 * s);
  const R0 = 0.8 * SC, R1 = R0 + 16 * s, R2 = R1 + 5 * s;
  c.globalAlpha = 0.16; c.lineWidth = 0.6 * s;
  for (let i = 0; i < 32; i++) { const a = i / 32 * 6.2832; c.beginPath(); c.moveTo(CX + Math.cos(a) * 0.06 * SC, CY + Math.sin(a) * 0.06 * SC); c.lineTo(CX + Math.cos(a) * R0, CY + Math.sin(a) * R0); if (i % 4) c.setLineDash([2 * s, 3 * s]); else c.setLineDash([]); c.stroke(); }
  c.setLineDash([]);
  for (let rr = 0.2; rr < 0.8; rr += 0.2) { c.globalAlpha = 0.2; c.setLineDash([1 * s, 4 * s]); c.beginPath(); c.arc(CX, CY, rr * SC, 0, 6.2832); c.stroke(); }
  c.setLineDash([]);
  c.globalAlpha = 0.85; c.lineWidth = 1.1 * s; c.beginPath(); c.arc(CX, CY, R0, 0, 6.2832); c.stroke();
  c.lineWidth = 0.7 * s; c.beginPath(); c.arc(CX, CY, R1, 0, 6.2832); c.stroke();
  c.lineWidth = 1.4 * s; c.beginPath(); c.arc(CX, CY, R2, 0, 6.2832); c.stroke();
  c.lineWidth = 0.6 * s;
  for (let d = 0; d < 360; d++) {
    const a = -d / 180 * Math.PI, L = d % 10 === 0 ? 16 : d % 5 === 0 ? 9 : 4.5;
    c.beginPath(); c.moveTo(CX + Math.cos(a) * R0, CY + Math.sin(a) * R0); c.lineTo(CX + Math.cos(a) * (R0 + L * s), CY + Math.sin(a) * (R0 + L * s)); c.stroke();
  }
  c.font = `italic ${Math.round(8.5 * s)}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    const a = -d / 180 * Math.PI, rr = R2 + 9 * s; c.save(); c.translate(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr); c.rotate(a + Math.PI / 2); c.fillText(String(d), 0, 0); c.restore();
  }
  const NUM = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  c.font = `${Math.round(9 * s)}px ${SERIF}`; c.globalAlpha = 0.55;
  for (let i = 0; i < 12; i++) { const a = -(i * 30 + 15) / 180 * Math.PI, rr = R0 - 10 * s; c.save(); c.translate(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr); c.rotate(a + Math.PI / 2); c.fillText(NUM[i], 0, 0); c.restore();
    const b = -(i * 30) / 180 * Math.PI; c.beginPath(); c.moveTo(CX + Math.cos(b) * (R0 - 18 * s), CY + Math.sin(b) * (R0 - 18 * s)); c.lineTo(CX + Math.cos(b) * R0, CY + Math.sin(b) * R0); c.stroke(); }
  c.beginPath(); c.arc(CX, CY, R0 - 18 * s, 0, 6.2832); c.globalAlpha = 0.35; c.stroke();
  { const r = rng(23), D = Math.hypot(W, H) / 2;
    for (let i = 0; i < 150; i++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * D; if (d < 0.8 * SC + 40 * s && d > 0.72 * SC) continue;
      if (d < 0.72 * SC && r() < 0.75) continue;
      const x = CX + Math.cos(a) * d, y = CY + Math.sin(a) * d, mag = r(), L = (1.5 + mag * mag * 4.5) * s, np = mag > 0.8 ? 8 : mag > 0.45 ? 6 : 4;
      c.globalAlpha = d < 0.72 * SC ? 0.35 : 0.7; c.lineWidth = 0.55 * s;
      c.beginPath(); for (let k = 0; k < np; k++) { const b = k / np * 6.2832 + a; const l = k % 2 && np > 4 ? L * 0.55 : L; c.moveTo(x, y); c.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); } c.stroke();
      if (mag > 0.8) { c.beginPath(); c.arc(x, y, 1.1 * s, 0, 6.2832); c.fill(); }
    } }
  c.globalAlpha = 1;
  c = pc;
  c.globalAlpha = 0.9; c.textAlign = 'center';
  const tx0 = Math.max(110 * s, (CX - 0.4 * H - 34 * s) / 2 + 10 * s);
  c.font = `${Math.round(14 * s)}px ${SERIF}`; spaced(c, 'ORBITAL  PASTORAL', tx0, 48 * s, 2.2 * s);
  c.font = `italic ${Math.round(9 * s)}px ${SERIF}`; c.fillText('the Shepherd, the Dog,', tx0, 64 * s); c.fillText('and the moons they keep', tx0, 76 * s);
  c.globalAlpha = 0.5; c.beginPath(); c.moveTo(tx0 - 40 * s, 88 * s); c.lineTo(tx0 + 40 * s, 88 * s); c.stroke(); c.globalAlpha = 0.9;
  c.font = `italic ${Math.round(9 * s)}px ${SERIF}`; c.textAlign = 'left';
  const ly = H - 64 * s, lx = W - 200 * s;
  c.lineWidth = 0.9 * s; c.strokeStyle = INK; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 22 * s, ly); c.stroke(); c.fillText('a moon at liberty', lx + 27 * s, ly);
  c.strokeStyle = RED; c.beginPath(); c.moveTo(lx, ly + 14 * s); c.lineTo(lx + 22 * s, ly + 14 * s); c.stroke(); c.fillStyle = RED; c.fillText('a moon held by a planet', lx + 27 * s, ly + 14 * s);
  c.fillStyle = INK; c.strokeStyle = INK;
  c.globalAlpha = 0.8; const sb = 0.2 * SC, sx0 = W - 200 * s, sy0 = H - 94 * s;
  for (let i = 0; i < 4; i++) { c.lineWidth = 0.8 * s; c.strokeRect(sx0 + i * sb / 4, sy0 - 2.5 * s, sb / 4, 5 * s); if (i % 2 === 0) c.fillRect(sx0 + i * sb / 4, sy0 - 2.5 * s, sb / 4, 5 * s); }
  c.font = `italic ${Math.round(8 * s)}px ${SERIF}`; c.textAlign = 'left'; c.fillText('one fifth of the chart', sx0, sy0 - 10 * s); c.textAlign = 'center';
  const rx = 58 * s, ry = H - 62 * s, rl = 26 * s;
  c.globalAlpha = 0.75; c.lineWidth = 0.7 * s;
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832 - Math.PI / 2, L = i % 2 ? rl * 0.55 : rl, w2 = (i % 2 ? 3 : 5) * s;
    const tx = rx + Math.cos(a) * L, ty = ry + Math.sin(a) * L, px = -Math.sin(a) * w2, py = Math.cos(a) * w2;
    c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + px, ry + py); c.lineTo(tx, ty); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx - px, ry - py); c.lineTo(tx, ty); c.closePath(); c.stroke(); }
  c.beginPath(); c.arc(rx, ry, rl * 0.38, 0, 6.2832); c.stroke();
  c.font = `${Math.round(9 * s)}px ${SERIF}`; c.fillText('N', rx, ry - rl - 7 * s);
  c.globalAlpha = 1;
}
function spaced(c, str, x, y, sp) { const w = c.measureText(str).width + sp * (str.length - 1); let px = x - w / 2; c.textAlign = 'left'; for (const ch of str) { c.fillText(ch, px, y); px += c.measureText(ch).width + sp; } c.textAlign = 'center'; }

const P = (x, y) => [CX + x * SC, CY - y * SC];
function hatchDisc(x, y, r, lightAng, dens) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = `rgb(${PAPER[0] + 6},${PAPER[1] + 6},${PAPER[2] + 4})`; ctx.fill(); ctx.clip();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.55 * s;
  const lx = Math.cos(lightAng), ly = Math.sin(lightAng), n = Math.ceil(2 * r / dens);
  for (let i = -n; i <= n; i++) {
    const off = i * dens; if (off > r * 0.15) continue;
    const cx0 = x + lx * off, cy0 = y + ly * off, half = Math.sqrt(Math.max(0, r * r - off * off));
    ctx.globalAlpha = clamp(0.35 + (-off / r) * 0.7, 0.2, 1);
    ctx.beginPath(); ctx.moveTo(cx0 - ly * half, cy0 + lx * half); ctx.lineTo(cx0 + ly * half, cy0 - lx * half); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9 * s; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
}
function sun(x, y, t) {
  const r = 11 * s;
  ctx.strokeStyle = INK; ctx.fillStyle = INK;
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * 6.2832 + t * 0.02, L = (i % 2 ? 13 : 22) * s, w = (i % 2 ? 1.4 : 2.4) * s;
    const ca = Math.cos(a), sa = Math.sin(a);
    if (i % 2) {
      ctx.lineWidth = 0.7 * s; ctx.beginPath();
      for (let k = 0; k <= 12; k++) { const u = k / 12, rr = r + 2 * s + u * L, wob = Math.sin(u * 9 + t * 0.6) * 1.6 * s * u; const px = x + ca * rr - sa * wob, py = y + sa * rr + ca * wob; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    } else {
      ctx.lineWidth = 0.6 * s;
      const bx = x + ca * (r + 2 * s), by = y + sa * (r + 2 * s), tx = x + ca * (r + 2 * s + L), ty = y + sa * (r + 2 * s + L);
      ctx.beginPath(); ctx.moveTo(bx - sa * w, by + ca * w); ctx.lineTo(tx, ty); ctx.lineTo(bx + sa * w, by - ca * w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + sa * w, by - ca * w); ctx.closePath(); ctx.fill();
    }
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = `rgb(${PAPER[0] + 8},${PAPER[1] + 6},${PAPER[2]})`; ctx.fill(); ctx.lineWidth = 1.1 * s; ctx.stroke();
  const rr = rng(4); ctx.fillStyle = INK; for (let i = 0; i < 70; i++) { const a = rr() * 6.2832, d = Math.sqrt(rr()) * r * 0.92; if (Math.cos(a - 0.8) * d / r > -0.1) continue; ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9 * s, 0.9 * s); }
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.2832); ctx.lineWidth = 0.5 * s; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
}
function render(t) {
  ctx.drawImage(paper, 0, 0);
  setFrame();
  const fa = frameAng();
  ctx.save(); ctx.beginPath(); ctx.rect(21 * s, 21 * s, W - 42 * s, H - 42 * s); ctx.clip(); ctx.translate(CX, CY); ctx.rotate(fa); ctx.drawImage(ringC, -ringC.width / 2, -ringC.height / 2); ctx.restore();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 1; i < 3; i++) {
    const n = Math.min(ptN, PTR); if (n < 2) continue;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.6 * s; ctx.globalAlpha = 0.5; ctx.beginPath();
    for (let j = 0; j < n; j++) { const o = (ptN - n + j) % PTR; const p = P(ptX[i * PTR + o], ptY[i * PTR + o]); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const NBK = 10, paths = [];
  for (let c = 0; c < 2; c++) for (let q = 0; q < NBK; q++) paths.push(new Path2D());
  for (let k = 0; k < NM; k++) {
    const n = trLen[k]; if (n < 2) continue;
    let px = 0, py = 0;
    for (let j = 0; j < n; j++) {
      const o = k * TR + (trHead - n + j + TR * 2) % TR;
      const x = CX + trX[o] * SC, y = CY - trY[o] * SC;
      if (j) { const age = j / n, b = trB[o] ? 1 : 0, al = b ? 0.2 + 0.8 * age : 0.06 + 0.72 * age * age;
        const path = paths[b * NBK + Math.min(NBK - 1, Math.floor(al * NBK))]; path.moveTo(px, py); path.lineTo(x, y); }
      px = x; py = y;
    }
  }
  for (let c = 0; c < 2; c++) for (let q = 0; q < NBK; q++) {
    ctx.strokeStyle = c ? RED : INK; ctx.lineWidth = (c ? 1.0 : 0.8) * s; ctx.globalAlpha = Math.min(1, (q + 0.5) / NBK * 1.15); ctx.stroke(paths[c * NBK + q]);
  }
  ctx.globalAlpha = 1;
  for (let k = 0; k < NM; k++) {
    const q = rot(mx[k], my[k]), p = P(q[0], q[1]);
    ctx.fillStyle = bound[k] ? RED : INK;
    ctx.beginPath(); ctx.arc(p[0], p[1], 1.7 * s, 0, 6.2832); ctx.fill();
  }
  { const GR = 'αβγδεζηθικλμνξοπρστυφχψω'; ctx.font = `italic ${Math.round(8.5 * s)}px ${SERIF}`; ctx.fillStyle = RED; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let n = 0; for (let k = 0; k < NM && n < 9; k++) { if (!bound[k]) continue; const q = rot(mx[k], my[k]), p = P(q[0], q[1]); ctx.fillText(GR[k % GR.length], p[0] + 3 * s, p[1] - 4 * s); n++; } }
  ctx.globalAlpha = 1;
  const sp = P(0, 0);
  sun(sp[0], sp[1], t);
  const names = ['', 'the Shepherd', 'the Dog'];
  for (let i = 1; i < 3; i++) {
    const b = bodies[i], q = rot(b.x, b.y), p = P(q[0], q[1]), hr = hill(i) * SC;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.6 * s; ctx.globalAlpha = 0.5; ctx.setLineDash([1 * s, 3 * s]); ctx.beginPath(); ctx.arc(p[0], p[1], hr, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    const la = Math.atan2(sp[1] - p[1], sp[0] - p[0]);
    hatchDisc(p[0], p[1], (i === 1 ? 7.5 : 6) * s, la, 1.5 * s);
    let held = 0; for (let k = 0; k < NM; k++) if (bound[k] === i) held++;
    ctx.font = `italic ${Math.round(10.5 * s)}px ${SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    const ox = p[0] + hr * 0.72 + 5 * s, oy = p[1] - hr * 0.72 - 3 * s;
    ctx.fillText(names[i], ox, oy);
    ctx.font = `${Math.round(8.5 * s)}px ${SERIF}`; ctx.fillStyle = held ? RED : INK; ctx.fillText(held ? `keeping ${held}` : 'keeping none', ox, oy + 11 * s);
  }
}

resize();
if (FIXED !== null) {
  const t0 = performance.now();
  const tt = Math.min(FIXED, 120);
  advanceTo(WARM + tt * SIM_PER_SEC); render(tt);
  window.__ms = Math.round(performance.now() - T_START);
  if (qs.has('prof')) { const a = performance.now(); for (let i = 0; i < 10; i++) render(tt); window.__ms += ' per-render ' + ((performance.now() - a) / 10).toFixed(1); }
  document.title = 'done';
} else {
  addEventListener('resize', resize);
  const start = performance.now();
  (function loop() { const t = (performance.now() - start) / 1000; const target = Math.round((WARM + t * SIM_PER_SEC) / DT); let n = 0; while (steps < target && n < 4000) { step(); n++; } render(t); requestAnimationFrame(loop); })();
}
})();
