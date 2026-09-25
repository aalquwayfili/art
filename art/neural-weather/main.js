(function(){
'use strict';
const T_START = performance.now();
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
const CYCLE = 30, LEARN = 25, TOTAL_STEPS = 1300;

function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x, ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};

const BLOBS = [[-0.35,0.05,0.34,1],[0.05,-0.22,0.3,1],[0.32,0.08,0.22,0.9],[-0.05,0.3,0.2,0.8],[0.95,-0.45,0.17,1],[-1.05,-0.5,0.2,0.95],[1.05,0.5,0.16,0.9],[-0.12,0.02,0.12,-1.3]];
function land(x, y) { let s = -0.5; for (const b of BLOBS) { const dx = x - b[0], dy = y - b[1]; s += b[3] * Math.exp(-(dx*dx+dy*dy)/(b[2]*b[2])); } return s; }
const XR = 1.85, YR = 0.98;
const R0 = rng(20260925);
const ST = [];
{ const nx = 22, ny = 12; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
  const x = -XR + (i + 0.5 + (R0() - 0.5) * 0.8) * (2 * XR / nx), y = -YR + (j + 0.5 + (R0() - 0.5) * 0.8) * (2 * YR / ny);
  ST.push({ x, y, lab: land(x, y) > 0 ? 1 : 0, loss: 0.7 }); } }
const NS = ST.length;

const H1 = 16, H2 = 16;
const nP = 2*H1 + H1 + H1*H2 + H2 + H2 + 1;
const P = new Float64Array(nP), G = new Float64Array(nP), M1 = new Float64Array(nP), V1 = new Float64Array(nP);
const oW1 = 0, oB1 = oW1 + 2*H1, oW2 = oB1 + H1, oB2 = oW2 + H1*H2, oW3 = oB2 + H2, oB3 = oW3 + H2;
let step = 0;
function initNet() {
  const r = rng(7), g = () => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return (u - 3) / Math.sqrt(0.5); };
  for (let i = 0; i < 2*H1; i++) P[oW1+i] = g() * 2.2;
  for (let i = 0; i < H1; i++) P[oB1+i] = g() * 1.2;
  for (let i = 0; i < H1*H2; i++) P[oW2+i] = g() * 1.3 / Math.sqrt(H1);
  for (let i = 0; i < H2; i++) P[oB2+i] = g() * 0.3;
  for (let i = 0; i < H2; i++) P[oW3+i] = g() * 2.2 / Math.sqrt(H2);
  P[oB3] = 0.3;
  M1.fill(0); V1.fill(0); step = 0;
}
const a1 = new Float64Array(H1), a2 = new Float64Array(H2), d1 = new Float64Array(H1), d2 = new Float64Array(H2);
function forward(x, y) {
  for (let i = 0; i < H1; i++) a1[i] = Math.tanh(P[oW1+2*i]*x + P[oW1+2*i+1]*y + P[oB1+i]);
  let z = P[oB3];
  for (let j = 0; j < H2; j++) { let s = P[oB2+j]; const o = oW2 + j*H1; for (let i = 0; i < H1; i++) s += P[o+i]*a1[i]; a2[j] = Math.tanh(s); z += P[oW3+j]*a2[j]; }
  return z;
}
let meanLoss = 0.7;
function trainStep() {
  G.fill(0); let L = 0;
  for (let n = 0; n < NS; n++) {
    const s = ST[n], z = forward(s.x, s.y);
    const p = 1 / (1 + Math.exp(-z)), l = s.lab ? Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
    s.loss = l; L += l;
    const dz = (p - s.lab) / NS;
    G[oB3] += dz;
    for (let j = 0; j < H2; j++) { G[oW3+j] += dz * a2[j]; d2[j] = dz * P[oW3+j] * (1 - a2[j]*a2[j]); }
    d1.fill(0);
    for (let j = 0; j < H2; j++) { const o = oW2 + j*H1, dj = d2[j]; G[oB2+j] += dj; for (let i = 0; i < H1; i++) { G[o+i] += dj * a1[i]; d1[i] += dj * P[o+i]; } }
    for (let i = 0; i < H1; i++) { const di = d1[i] * (1 - a1[i]*a1[i]); G[oB1+i] += di; G[oW1+2*i] += di * s.x; G[oW1+2*i+1] += di * s.y; }
  }
  meanLoss = L / NS;
  step++;
  const lr = 0.007 * Math.min(1, 0.05 + step / 220), b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step);
  for (let i = 0; i < nP; i++) { M1[i] = b1*M1[i] + (1-b1)*G[i]; V1[i] = b2*V1[i] + (1-b2)*G[i]*G[i]; P[i] -= lr * (M1[i]/c1) / (Math.sqrt(V1[i]/c2) + 1e-8); }
}
function stepsAt(t) { return Math.round(TOTAL_STEPS * Math.pow(clamp(t / LEARN), 1.9)); }
const LAG = 14;
let prevP = null;
const hist = [];
function advanceTo(n) {
  while (step < n) { hist.push(P.slice()); if (hist.length > LAG) hist.shift(); trainStep(); }
  if (step === 0) { let L = 0; for (const s of ST) { const z = forward(s.x, s.y); s.loss = s.lab ? Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)); L += s.loss; } meanLoss = L / NS; }
  prevP = hist.length ? hist[0] : P.slice();
}

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W, H, S, CELL, GW, GH, zF, zPrevF, pF, radarC, radarCtx, radarImg;
const noise = new Float32Array(128 * 128);
{ const r = rng(99), base = new Float32Array(128 * 128);
  for (let o = 0; o < 4; o++) { const f = 4 << o, amp = 1 / (o + 1.2), g = new Float32Array((f + 1) * (f + 1)); for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const gx = x / 128 * f, gy = y / 128 * f, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
      const I = (a, b) => g[(b % f) * (f + 1) + (a % f)];
      base[y*128+x] += amp * ((I(ix,iy)*(1-sx) + I(ix+1,iy)*sx)*(1-sy) + (I(ix,iy+1)*(1-sx) + I(ix+1,iy+1)*sx)*sy); } }
  let mn = 1e9, mx = -1e9; for (const v of base) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (let i = 0; i < base.length; i++) noise[i] = (base[i] - mn) / (mx - mn); }
function noiseAt(u, v) { u = ((u % 1) + 1) % 1 * 128; v = ((v % 1) + 1) % 1 * 128; const x = u | 0, y = v | 0, fx = u - x, fy = v - y;
  const a = noise[y*128+x], b = noise[y*128+((x+1)&127)], c = noise[((y+1)&127)*128+x], d = noise[((y+1)&127)*128+((x+1)&127)];
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy; }

function resize() {
  const dpr = FIXED !== null ? 1 : Math.min(2, devicePixelRatio || 1);
  W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
  S = H / 2.1;
  CELL = Math.max(5, Math.round(H / 110));
  GW = Math.ceil(W / CELL) + 1; GH = Math.ceil(H / CELL) + 1;
  zF = new Float32Array(GW * GH); zPrevF = new Float32Array(GW * GH); pF = new Float32Array(GW * GH);
  radarC = document.createElement('canvas'); radarC.width = Math.ceil(W / 3); radarC.height = Math.ceil(H / 3);
  radarCtx = radarC.getContext('2d'); radarImg = radarCtx.createImageData(radarC.width, radarC.height);
  buildBase();
}
const wx = px => (px - W / 2) / S, wy = py => (py - H / 2) / S, sxp = x => W / 2 + x * S, syp = y => H / 2 + y * S;

function contour(F, level) {
  const segs = [], pts = new Map();
  const ep = (key) => { if (pts.has(key)) return key;
    const e = key >> 1, horiz = (key & 1) === 0, i = e % GW, j = (e / GW) | 0;
    const a = F[j*GW+i], b = horiz ? F[j*GW+i+1] : F[(j+1)*GW+i], t = (level - a) / (b - a);
    pts.set(key, horiz ? [(i + t) * CELL, j * CELL] : [i * CELL, (j + t) * CELL]); return key; };
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const o = j*GW+i, v0 = F[o] > level, v1 = F[o+1] > level, v2 = F[o+GW+1] > level, v3 = F[o+GW] > level;
    const c = (v0?1:0) | (v1?2:0) | (v2?4:0) | (v3?8:0); if (c === 0 || c === 15) continue;
    const T = (o) * 2, R = (o + 1) * 2 + 1, Bm = (o + GW) * 2, Lf = o * 2 + 1;
    const add = (p, q) => segs.push([ep(p), ep(q)]);
    switch (c) {
      case 1: case 14: add(Lf, T); break; case 2: case 13: add(T, R); break; case 4: case 11: add(R, Bm); break; case 8: case 7: add(Bm, Lf); break;
      case 3: case 12: add(Lf, R); break; case 6: case 9: add(T, Bm); break;
      case 5: case 10: { const ctr = (F[o] + F[o+1] + F[o+GW] + F[o+GW+1]) / 4 > level;
        if ((c === 5) === ctr) { add(Lf, Bm); add(T, R); } else { add(Lf, T); add(R, Bm); } break; }
    }
  }
  const adj = new Map(); segs.forEach((s, k) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(k); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let k0 = 0; k0 < segs.length; k0++) { if (used[k0]) continue;
    const walk = (startKey, k) => { const out = []; let cur = startKey; while (k >= 0 && !used[k]) { used[k] = 1; const s = segs[k]; const nxt = s[0] === cur ? s[1] : s[0]; out.push(nxt); cur = nxt; const l = adj.get(cur); k = -1; for (const kk of l) if (!used[kk]) { k = kk; break; } } return out; };
    used[k0] = 1; const s = segs[k0];
    const fwd = walk(s[1], (adj.get(s[1]).find(kk => !used[kk])) ?? -1);
    const bwd = walk(s[0], (adj.get(s[0]).find(kk => !used[kk])) ?? -1);
    const keys = bwd.reverse().concat([s[0], s[1]], fwd);
    const closed = keys.length > 3 && keys[0] === keys[keys.length - 1];
    lines.push({ pts: keys.map(q => pts.get(q)), closed });
  }
  return lines;
}
function smooth(pts, closed) {
  if (pts.length < 3) return pts; const o = closed ? [] : [pts[0]]; const n = pts.length;
  for (let i = 0; i < n - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0]*0.75+b[0]*0.25, a[1]*0.75+b[1]*0.25], [a[0]*0.25+b[0]*0.75, a[1]*0.25+b[1]*0.75]); }
  if (!closed) o.push(pts[n - 1]); else o.push(o[0]); return o; }
function pathOf(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }

let baseC;
const INK = '#1e2630', SEA = [218, 228, 229], LAND = [238, 230, 208];
function buildBase() {
  baseC = document.createElement('canvas'); baseC.width = W; baseC.height = H; const b = baseC.getContext('2d');
  const q = 3, w = Math.ceil(W / q), h = Math.ceil(H / q), id = b.createImageData(w, h), r = rng(5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = land(wx(x * q), wy(y * q)); const c = L > 0 ? LAND : SEA; const n = (r() - 0.5) * 5 + (noiseAt(x / w * 3, y / h * 2) - 0.5) * 8;
    const o = (y * w + x) * 4; id.data[o] = c[0] + n; id.data[o+1] = c[1] + n; id.data[o+2] = c[2] + n * 0.8; id.data[o+3] = 255; }
  const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(id, 0, 0);
  b.imageSmoothingEnabled = true; b.drawImage(t, 0, 0, W, H);
  const saveF = zF; const cf = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) cf[j*GW+i] = land(wx(i * CELL), wy(j * CELL));
  const lines = contour(cf, 0);
  b.strokeStyle = 'rgba(40,60,70,0.55)'; b.lineWidth = Math.max(1, H / 500); b.lineJoin = 'round';
  for (const l of lines) { const p = smooth(smooth(l.pts, l.closed), l.closed); b.beginPath(); p.forEach((v, i) => i ? b.lineTo(v[0], v[1]) : b.moveTo(v[0], v[1])); b.stroke(); }
  b.strokeStyle = 'rgba(40,80,100,0.18)';
  for (const l of contour(cf, -0.09)) { const p = smooth(l.pts, l.closed); b.beginPath(); p.forEach((v, i) => i ? b.lineTo(v[0], v[1]) : b.moveTo(v[0], v[1])); b.stroke(); }
  b.strokeStyle = 'rgba(30,40,50,0.18)'; b.lineWidth = 1; b.setLineDash([2, 4]);
  for (let g = -3; g <= 3; g += 0.5) { b.beginPath(); b.moveTo(sxp(g), 0); b.lineTo(sxp(g), H); b.stroke(); b.beginPath(); b.moveTo(0, syp(g)); b.lineTo(W, syp(g)); b.stroke(); }
  b.setLineDash([]);
  b.fillStyle = 'rgba(30,40,50,0.45)'; b.font = `${Math.round(H / 70)}px Helvetica, Arial, sans-serif`; b.textBaseline = 'top';
  for (let g = -3; g <= 3; g += 0.5) { const x = sxp(g); if (x > 10 && x < W - 30) b.fillText(`${Math.round(46 + g * 10)}°E`, x + 3, 4); const y = syp(g); if (y > 16 && y < H - 16) b.fillText(`${Math.round(24 - g * 10)}°N`, 4, y + 3); }
}

function barb(x, y, u, v, kt) {
  const L = H / 26, m = Math.hypot(u, v); if (m < 1e-9) return;
  const dx = -u / m, dy = -v / m, nx = -dy, ny = dx;
  const ex = x + dx * L, ey = y + dy * L;
  ctx.beginPath(); ctx.moveTo(x + dx * H / 170, y + dy * H / 170); ctx.lineTo(ex, ey);
  let k = Math.round(kt / 5) * 5, pos = 0; const fl = L * 0.42, gap = L * 0.14;
  while (k >= 50) { const px = ex - dx * pos, py = ey - dy * pos; ctx.moveTo(px, py); ctx.lineTo(px + nx * fl, py + ny * fl); ctx.lineTo(px - dx * gap, py - dy * gap); ctx.closePath(); pos += gap * 1.3; k -= 50; }
  ctx.stroke(); ctx.fill(); ctx.beginPath();
  while (k >= 10) { const px = ex - dx * pos, py = ey - dy * pos; ctx.moveTo(px, py); ctx.lineTo(px + (nx * fl + dx * fl * 0.35), py + (ny * fl + dy * fl * 0.35)); pos += gap; k -= 10; }
  if (k >= 5) { if (pos === 0) pos = gap; const px = ex - dx * pos, py = ey - dy * pos; ctx.moveTo(px, py); ctx.lineTo(px + (nx * fl + dx * fl * 0.35) * 0.5, py + (ny * fl + dy * fl * 0.35) * 0.5); }
  ctx.stroke();
}
function station(x, y, oktas) {
  const r = H / 150;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = '#fbfaf5'; ctx.fill(); ctx.stroke();
  if (oktas <= 0) return;
  ctx.fillStyle = INK; ctx.beginPath();
  if (oktas >= 8) { ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); return; }
  ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + oktas / 8 * 6.2832); ctx.closePath(); ctx.fill();
}
const RADAR = [[140, 215, 120], [70, 175, 80], [245, 225, 70], [245, 150, 50], [220, 50, 50], [200, 60, 170]];

function render(t) {
  const saveP = P.slice();
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const z = forward(wx(i * CELL), wy(j * CELL)); zF[j*GW+i] = z; pF[j*GW+i] = 1012 + 26 * Math.tanh(z / 9); }
  P.set(prevP);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) zPrevF[j*GW+i] = forward(wx(i * CELL), wy(j * CELL));
  P.set(saveP);
  const at = (F, x, y) => { const gx = clamp(x / CELL, 0, GW - 1.001), gy = clamp(y / CELL, 0, GH - 1.001), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j;
    return (F[j*GW+i]*(1-fx)+F[j*GW+i+1]*fx)*(1-fy)+(F[(j+1)*GW+i]*(1-fx)+F[(j+1)*GW+i+1]*fx)*fy; };

  ctx.drawImage(baseC, 0, 0);
  { const rw = radarC.width, rh = radarC.height, d = radarImg.data, sig = 0.16, is2 = 1 / (sig * sig);
    const hot = ST.filter(s => s.loss > 0.12);
    const grid = new Float32Array(Math.ceil(rw / 4 + 1) * Math.ceil(rh / 4 + 1)), gw4 = Math.ceil(rw / 4 + 1);
    for (let j = 0; j * 4 < rh + 4; j++) for (let i = 0; i < gw4; i++) { const x = wx(i * 12), y = wy(j * 12); let s = 0;
      for (const h of hot) { const dx = x - h.x, dy = y - h.y, q = (dx*dx+dy*dy) * is2; if (q < 9) s += Math.min(1, h.loss - 0.12) * Math.exp(-q); }
      grid[j * gw4 + i] = s; }
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const gx = x / 4, gy = y / 4, i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j;
      const R = (grid[j*gw4+i]*(1-fx)+grid[j*gw4+i+1]*fx)*(1-fy)+(grid[(j+1)*gw4+i]*(1-fx)+grid[(j+1)*gw4+i+1]*fx)*fy;
      const n = noiseAt(x / rw * 2.2 - t * 0.018, y / rh * 1.3 - t * 0.006) * 0.7 + noiseAt(x / rw * 6 - t * 0.04, y / rh * 3.5 + t * 0.01) * 0.5;
      const v = Math.min(R, 1.5) * (n * 2.2 - 0.75);
      const o = (y * rw + x) * 4;
      const k = v < 0.35 ? -1 : v < 0.6 ? 0 : v < 0.85 ? 1 : v < 1.1 ? 2 : v < 1.35 ? 3 : v < 1.6 ? 4 : 5;
      if (k < 0) { d[o+3] = 0; continue; }
      const c = RADAR[k]; d[o] = c[0]; d[o+1] = c[1]; d[o+2] = c[2]; d[o+3] = 150;
    }
    radarCtx.putImageData(radarImg, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.8; ctx.drawImage(radarC, 0, 0, W, H); ctx.restore();
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fs = Math.round(H / 62);
  ctx.font = `${fs}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const labels = [];
  for (let lev = 976; lev <= 1048; lev += 4) {
    const lines = contour(pF, lev);
    for (const l of lines) {
      const p = smooth(smooth(l.pts, l.closed), l.closed); if (p.length < 6) continue;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, H / 480); ctx.globalAlpha = 0.85; pathOf(p); ctx.stroke(); ctx.globalAlpha = 1;
      if (p.length > 40) { const q = p[(p.length * 0.37) | 0]; if (q[0] > 30 && q[0] < W - 30 && q[1] > 30 && q[1] < H - 30 && labels.every(L => Math.hypot(L[0] - q[0], L[1] - q[1]) > H / 9)) labels.push([q[0], q[1], String(lev)]); }
    }
  }
  for (const [x, y, s] of labels) { const w = ctx.measureText(s).width + 6; ctx.fillStyle = 'rgba(246,244,236,0.95)'; ctx.fillRect(x - w / 2, y - fs * 0.6, w, fs * 1.2); ctx.fillStyle = INK; ctx.fillText(s, x, y); }
  { const r = 7, big = Math.round(H / 18);
    for (let j = r; j < GH - r; j++) for (let i = r; i < GW - r; i++) {
      const v = pF[j*GW+i]; let isMax = true, isMin = true;
      for (let b = -r; b <= r && (isMax || isMin); b++) for (let a = -r; a <= r; a++) { if (!a && !b) continue; const w = pF[(j+b)*GW+i+a]; if (w >= v) isMax = false; if (w <= v) isMin = false; }
      if (!isMax && !isMin) continue;
      let avg = 0; for (let a = -r; a <= r; a++) avg += pF[j*GW+i+a] + pF[(j+a)*GW+i]; avg /= 4 * r + 2;
      if (Math.abs(v - avg) < 1.2) continue;
      const x = i * CELL, y = j * CELL;
      ctx.font = `bold ${big}px Helvetica, Arial, sans-serif`; ctx.fillStyle = isMax ? '#1f5fbf' : '#c8322a'; ctx.fillText(isMax ? 'H' : 'L', x, y);
      ctx.font = `${Math.round(fs * 0.95)}px Helvetica, Arial, sans-serif`; ctx.fillStyle = INK; ctx.fillText(String(Math.round(v)), x, y + big * 0.72);
      ctx.beginPath(); ctx.moveTo(x - 5, y + big * 0.72 + fs); ctx.lineTo(x + 5, y + big * 0.72 + fs); ctx.stroke();
    } }
  { const lines = contour(zF, 0), sp = H / 30, sz = H / 75;
    for (const l of lines) {
      const p = smooth(smooth(l.pts, l.closed), l.closed); if (p.length < 4) continue;
      const kind = p.map(q => { const x = q[0], y = q[1];
        const gx = (at(zF, x + CELL, y) - at(zF, x - CELL, y)) / (2 * CELL), gy = (at(zF, x, y + CELL) - at(zF, x, y - CELL)) / (2 * CELL);
        const g = Math.hypot(gx, gy) + 1e-9, dz = at(zF, x, y) - at(zPrevF, x, y);
        const speed = -dz / g;
        return speed > 1.2 ? -1 : speed < -1.2 ? 1 : 0; });
      const K2 = kind.map((_, i) => { let s = 0; for (let d = -6; d <= 6; d++) s += kind[clamp(i + d, 0, kind.length - 1)]; return s > 3 ? 1 : s < -3 ? -1 : 0; });
      ctx.lineWidth = Math.max(2, H / 190);
      for (let i = 0; i < p.length - 1; i++) {
        const k = K2[i]; ctx.strokeStyle = k > 0 ? '#c8322a' : k < 0 ? '#1f5fbf' : (Math.floor(i / 5) & 1 ? '#c8322a' : '#1f5fbf');
        ctx.beginPath(); ctx.moveTo(p[i][0], p[i][1]); ctx.lineTo(p[i + 1][0], p[i + 1][1]); ctx.stroke();
      }
      let acc = sp * 0.5, n = 0;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (seg < 1e-6) continue;
        acc += seg; if (acc < sp) continue; acc = 0; n++;
        const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
        const gx = at(zF, a[0] + CELL, a[1]) - at(zF, a[0] - CELL, a[1]), gy = at(zF, a[0], a[1] + CELL) - at(zF, a[0], a[1] - CELL);
        let nx = -ty, ny = tx; const toLand = nx * gx + ny * gy > 0 ? 1 : -1;
        let k = K2[i]; let side;
        if (k === 0) { k = n & 1 ? 1 : -1; side = k > 0 ? -toLand : toLand; }
        else side = k > 0 ? -toLand : toLand;
        nx *= side; ny *= side;
        ctx.fillStyle = k > 0 ? '#c8322a' : '#1f5fbf'; ctx.beginPath();
        if (k > 0) { const ang = Math.atan2(ny, nx); ctx.arc(a[0], a[1], sz * 0.8, ang - Math.PI / 2, ang + Math.PI / 2); ctx.closePath(); }
        else { ctx.moveTo(a[0] - tx * sz, a[1] - ty * sz); ctx.lineTo(a[0] + tx * sz, a[1] + ty * sz); ctx.lineTo(a[0] + nx * sz * 1.3, a[1] + ny * sz * 1.3); ctx.closePath(); }
        ctx.fill();
      }
    } }
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1, H / 520);
  for (const s of ST) {
    const x = sxp(s.x), y = syp(s.y); if (x < -20 || x > W + 20) continue;
    const e = 2;
    const dpx = (at(pF, x + CELL * e, y) - at(pF, x - CELL * e, y)) / (2 * CELL * e), dpy = (at(pF, x, y + CELL * e) - at(pF, x, y - CELL * e)) / (2 * CELL * e);
    const u = dpy, v = -dpx, kt = Math.min(55, Math.hypot(u, v) * H * 0.9);
    ctx.fillStyle = INK; if (kt >= 2.5) barb(x, y, u, v, kt);
    station(x, y, Math.round(clamp(s.loss / 0.6) * 8));
  }
  { const fsz = Math.round(H / 48); ctx.font = `bold ${fsz}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const line1 = 'SURFACE ANALYSIS', line2 = `STEP ${String(step).padStart(4, '0')}   ·   MEAN LOSS ${meanLoss.toFixed(3)}`;
    ctx.font = `${Math.round(fsz * 0.8)}px Helvetica, Arial, sans-serif`; const w = Math.max(ctx.measureText(line2).width, fsz * 10) + fsz * 2;
    ctx.fillStyle = 'rgba(250,248,240,0.92)'; ctx.fillRect(W / 2 - w / 2, H - fsz * 3.4, w, fsz * 2.8);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - w / 2, H - fsz * 3.4, w, fsz * 2.8);
    ctx.fillStyle = INK; ctx.font = `bold ${fsz}px Helvetica, Arial, sans-serif`; ctx.fillText(line1, W / 2, H - fsz * 2.15);
    ctx.font = `${Math.round(fsz * 0.8)}px Helvetica, Arial, sans-serif`; ctx.fillText(line2, W / 2, H - fsz * 1.05); }
}

resize();
if (FIXED !== null) {
  const t0 = performance.now();
  const tc = ((FIXED % CYCLE) + CYCLE) % CYCLE;
  initNet(); advanceTo(stepsAt(tc)); render(tc);
  window.__ms = Math.round(performance.now() - T_START);
  if (qs.has('debug')) window.__ms += ` loss ${meanLoss.toFixed(3)} step ${step} wrong ${ST.filter(s => s.loss > 0.69).length}`;
  document.title = 'done';
} else {
  addEventListener('resize', resize);
  const start = performance.now(); let cyc = -1;
  (function loop() {
    const T = (performance.now() - start) / 1000, c = Math.floor(T / CYCLE), tc = T - c * CYCLE;
    if (c !== cyc) { cyc = c; initNet(); hist.length = 0; }
    advanceTo(stepsAt(tc)); render(tc); requestAnimationFrame(loop);
  })();
}
})();
