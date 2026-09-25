(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;

let seed = 0x9e3779b1;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

const N = 128, M = N - 1, NN = N * N;
const h = new Int16Array(NN);
const rock = new Uint8Array(NN);
const shadow = new Uint8Array(NN);
const P = k => parseFloat(qs.get(k));
const HOP = P('hop') || 2, PS = 0.6, PB = P('pb') || 0.4, REPOSE = 2, SHADOW_SLOPE = P('sh') || 0.55, JIT = qs.has('jit') ? P('jit') : 0.04;
const idx = (x, y) => ((y & M) << 7) | (x & M);

for (let k = 0; k < (P('heaps')||5); k++) {
  const cx = rnd() * N, cy = rnd() * N, r = (5 + rnd() * 5) * (P('rs')||1.5), amp = (10 + rnd() * 8) * (P('as')||1);
  for (let y = -32; y <= 32; y++) for (let x = -32; x <= 32; x++) {
    const d = Math.sqrt(x * x + y * y) / r; if (d > 2.2) continue;
    h[idx(Math.floor(cx + x), Math.floor(cy + y))] += Math.max(0, Math.round(amp * Math.exp(-d * d)));
  }
}
for (let i = 0; i < NN; i++) if (rnd() < 0.04) h[i] += 1;
const towers = [[40, 70], [96, 22], [70, 112]];
for (const [tx, ty] of towers) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const i = idx(tx + x, ty + y); rock[i] = 1; h[i] = 17; }

function computeShadow() {
  for (let y = 0; y < N; y++) {
    let top = 0; const row = y << 7;
    for (let p = 0; p < 2 * N; p++) {
      const x = p & M, i = row | x, hi = h[i];
      top -= SHADOW_SLOPE;
      if (p >= N) shadow[i] = top > hi + 0.5 ? 1 : 0;
      if (hi > top) top = hi;
    }
  }
}
const nb = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];
function slideDown(x, y) {
  for (let guard = 0; guard < 64; guard++) {
    const i = idx(x, y); let best = -1, bd = REPOSE, bx = 0, by = 0;
    for (let k = 0; k < 16; k += 2) {
      const nx = x + nb[k], ny = y + nb[k + 1], j = idx(nx, ny);
      const d = (h[i] - h[j]) * (k < 8 ? 1 : 0.7071);
      if (d > bd && !rock[j]) { bd = d; best = j; bx = nx; by = ny; }
    }
    if (best < 0) return;
    h[i]--; h[best]++; x = bx; y = by;
  }
}
function slideIn(x, y) {
  for (let guard = 0; guard < 64; guard++) {
    const i = idx(x, y); let best = -1, bd = REPOSE, bx = 0, by = 0;
    for (let k = 0; k < 16; k += 2) {
      const nx = x + nb[k], ny = y + nb[k + 1], j = idx(nx, ny);
      if (rock[j]) continue;
      const d = (h[j] - h[i]) * (k < 8 ? 1 : 0.7071);
      if (d > bd) { bd = d; best = j; bx = nx; by = ny; }
    }
    if (best < 0) return;
    h[best]--; h[i]++; x = bx; y = by;
  }
}
function sweep() {
  computeShadow();
  for (let e = 0; e < NN; e++) {
    const x = (rnd() * N) | 0, y = (rnd() * N) | 0, i = idx(x, y);
    if (h[i] <= 0 || shadow[i] || rock[i]) continue;
    h[i]--; slideIn(x, y);
    let px = x, py = y;
    for (let hop = 0; hop < 60; hop++) {
      px += HOP; py += (rnd() < JIT ? (rnd() < 0.5 ? 1 : -1) : 0);
      const j = idx(px, py);
      if (rock[j]) continue;
      if (shadow[j] || rnd() < (h[j] > 0 ? PS : PB)) { h[j]++; slideDown(px, py); break; }
    }
  }
}

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let RW = 320, RH = 180, img, buf32, ybuf;
const off = document.createElement('canvas'), octx = off.getContext('2d');
function resize() {
  const a = Math.max(0.5, Math.min(3, innerWidth / innerHeight));
  RH = 180; RW = Math.round(RH * a);
  off.width = RW; off.height = RH; img = octx.createImageData(RW, RH);
  buf32 = new Uint32Array(img.data.buffer); ybuf = new Float32Array(RW);
  cv.width = innerWidth; cv.height = innerHeight;
}
resize();
addEventListener('resize', () => { resize(); if (FIXED === null) {} });

const hs = new Float32Array(NN), light = new Float32Array(NN), tmp = new Float32Array(NN);
const SLAB = 0.7;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);

function prepMap(sunDir) {
  for (let i = 0; i < NN; i++) hs[i] = h[i] * SLAB;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      tmp[i] = rock[i] ? hs[i] : (hs[i] * 4 + hs[idx(x + 1, y)] + hs[idx(x - 1, y)] + hs[idx(x, y + 1)] + hs[idx(x, y - 1)]) / 8;
    }
    hs.set(tmp);
  }
  const [sx, sy, sz] = sunDir;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    const dx = (hs[idx(x + 1, y)] - hs[idx(x - 1, y)]) * 0.5, dy = (hs[idx(x, y + 1)] - hs[idx(x, y - 1)]) * 0.5;
    const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    let l = (-dx * sx - dy * sy + sz) * nl;
    let px = x + 0.5, py = y + 0.5, pz = hs[i] + 0.05, lit = 1;
    const st = 1.0 / Math.hypot(sx, sy);
    for (let s = 0; s < 48; s++) {
      px += sx * st; py += sy * st; pz += sz * st;
      if (hs[idx(px | 0, py | 0)] > pz) { lit = 0; break; }
      if (pz > 14) break;
    }
    const bounce = Math.max(0, (dx * sx + dy * sy) * nl * 1.6 + 0.25 * nl);
    light[i] = lit && l > 0.1 ? l : (bounce > 0.45 ? 0.07 : 0.02);
  }
}

function sampleH(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = hs[idx(x0, y0)], b = hs[idx(x0 + 1, y0)], c = hs[idx(x0, y0 + 1)], d = hs[idx(x0 + 1, y0 + 1)];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

const SAND = [[50, 36, 104], [78, 50, 128], [150, 66, 120], [228, 120, 96], [250, 180, 110], [255, 226, 168]];
const ROCK = [[62, 32, 58], [90, 44, 70], [140, 70, 58], [196, 108, 70], [226, 150, 96], [240, 190, 130]];
const HAZE = [255, 196, 170];
function ramp(pal, v) {
  const k = v < 0.05 ? 0 : v < 0.1 ? 1 : v < 0.24 ? 2 : v < 0.48 ? 3 : v < 0.78 ? 4 : 5; return pal[k];
}
const Q = 255 / 11;
function put(o, r, g, b, bx) {
  r = Math.round(r / Q + bx); g = Math.round(g / Q + bx); b = Math.round(b / Q + bx);
  r = r < 0 ? 0 : r > 11 ? 11 : r; g = g < 0 ? 0 : g > 11 ? 11 : g; b = b < 0 ? 0 : b > 11 ? 11 : b;
  buf32[o] = 0xff000000 | ((b * Q) << 16) | ((g * Q) << 8) | (r * Q);
}
function skyColor(v) {
  const top = [22, 52, 170], mid = [40, 132, 228], low = [150, 214, 240], hz = [255, 206, 178];
  if (v < 0.55) { const f = v / 0.55; return [top[0] + (mid[0] - top[0]) * f, top[1] + (mid[1] - top[1]) * f, top[2] + (mid[2] - top[2]) * f]; }
  if (v < 0.85) { const f = (v - 0.55) / 0.3; return [mid[0] + (low[0] - mid[0]) * f, mid[1] + (low[1] - mid[1]) * f, mid[2] + (low[2] - mid[2]) * f]; }
  const f = (v - 0.85) / 0.15; return [low[0] + (hz[0] - low[0]) * f, low[1] + (hz[1] - low[1]) * f, low[2] + (hz[2] - low[2]) * f];
}
const clouds = [];
{ let s = seed; seed = 777;
  for (let c = 0; c < 5; c++) { const cx = c * 0.63 + rnd() * 0.3, cy = 0.12 + rnd() * 0.22, w = 0.05 + rnd() * 0.05, blobs = [];
    for (let b = 0; b < 9; b++) blobs.push([(rnd() - 0.5) * w * 2, -rnd() * w * 0.55, w * (0.25 + rnd() * 0.35)]);
    clouds.push({ cx, cy, blobs }); }
  seed = s; }

function render(t) {
  const W = RW, H = RH;
  const yaw = 3.1416 + 0.18 + Math.sin(t * 0.21) * 0.05;
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const camX = DUNE[0] + 64 + t * 3.1, camY = DUNE[1] + 8 + Math.sin(t * 0.3) * 3;
  const sunAz = 3.1416 - 0.52, sunEl = 0.2;
  const sun = [Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl)];
  prepMap(sun);
  const camZ = sampleH(camX, camY) * 0.4 + 18;
  const horizon = H * 0.36, focal = H * 0.95, far = 170;
  const tanh = (W / H) * 0.62;
  for (let y = 0; y < H; y++) {
    const v = Math.min(1, Math.max(0, y / horizon / 1.05));
    const sc = skyColor(v);
    for (let x = 0; x < W; x++) {
      const bx = BAYER[((y & 3) << 2) | (x & 3)];
      let r = sc[0], g = sc[1], b = sc[2];
      const ang = yaw + (x / W * 2 - 1) * Math.atan(tanh);
      let da = ang - sunAz; da = Math.atan2(Math.sin(da), Math.cos(da));
      const sy = horizon - Math.tan(sunEl) * focal;
      const dd = Math.hypot(da * focal, y - sy);
      if (dd < 9) { r = 255; g = 246; b = 214; }
      else { const hl = Math.exp(-(dd - 9) / 26) * 0.7; r += (255 - r) * hl; g += (214 - g) * hl; b += (170 - b) * hl; }
      let cl = 0;
      for (const c of clouds) {
        let dx = ang * 0.5 - c.cx - t * 0.004; dx = dx - Math.round(dx / 3.1416) * 3.1416;
        if (Math.abs(dx) > 0.5) continue;
        const cy = y / H;
        for (const b2 of c.blobs) {
          const ex = dx - b2[0], ey = (cy - c.cy - b2[1]) * 0.9;
          const q = ex * ex + ey * ey;
          if (q < b2[2] * b2[2]) {
            const sh = (ey + b2[2] * 0.35) ; cl = Math.max(cl, sh < 0 ? 3 : (sh < b2[2] * 0.55 ? 2 : 1));
          }
        }
      }
      if (cl === 3) { r = 255; g = 244; b = 232; } else if (cl === 2) { r = 250; g = 206; b = 214; } else if (cl === 1) { r = 170; g = 150; b = 220; }
      put(y * W + x, r, g, b, bx);
    }
  }
  ybuf.fill(H);
  for (let x = 0; x < W; x++) {
    const s = (x / W * 2 - 1) * tanh;
    const rx = fx - fy * s, ry = fy + fx * s;
    let z = 1.2, dz = 0.12;
    let yb = H;
    while (z < far && yb > 0) {
      const px = camX + rx * z, py = camY + ry * z;
      const hgt = sampleH(px, py);
      const sy = horizon + (camZ - hgt) / z * focal;
      if (sy < yb) {
        const ci = idx(px | 0, py | 0);
        const pal = rock[ci] ? ROCK : SAND;
        let c = ramp(pal, light[ci] + (rock[ci] ? 0.15 : 0));
        const fog = Math.min(1, Math.pow(z / far, 1.9) * 1.1);
        const r = c[0] + (HAZE[0] - c[0]) * fog, g = c[1] + (HAZE[1] - c[1]) * fog, b = c[2] + (HAZE[2] - c[2]) * fog;
        const y0 = Math.max(0, Math.floor(sy));
        for (let yy = y0; yy < yb; yy++) put(yy * W + x, r, g, b, BAYER[((yy & 3) << 2) | (x & 3)]);
        yb = y0;
      }
      z += dz; dz *= 1.012;
    }
  }
  const crest = [];
  for (let i = 0; i < NN; i++) { const x = i & M, y = i >> 7; if (shadow[i] && !shadow[idx(x - 1, y)] && h[idx(x - 1, y)] > 5 && !rock[i]) crest.push(i); }
  if (crest.length) for (let k = 0; k < 700; k++) {
    const hk = Math.imul(k + 1, 2654435761) >>> 0;
    const ci = crest[hk % crest.length];
    const ph = (t * (0.35 + (hk >>> 20 & 15) / 40) + (hk & 1023) / 1024) % 1;
    const wx = (ci & M) - 1 + ph * 9, wy = (ci >> 7) + ((hk >>> 10 & 255) / 255 - 0.5) + Math.sin(ph * 6 + k) * 0.4;
    const wz = h[ci] * SLAB * 0.93 + Math.sin(ph * 3.14) * 1.2 - ph * 2.5;
    let dx = wx - camX, dy = wy - camY; dx -= Math.round(dx / N) * N; dy -= Math.round(dy / N) * N;
    const zf = dx * fx + dy * fy; if (zf < 2) continue;
    const ss = (dx * -fy + dy * fx) / zf;
    const px = Math.round((ss / tanh + 1) * 0.5 * W), py = Math.round(horizon + (camZ - wz) / zf * focal);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    const a = Math.sin(ph * 3.14) * (1 - Math.min(1, zf / 140));
    if (a < 0.25) continue;
    const o = py * W + px, p = buf32[o];
    const r = p & 255, g = p >> 8 & 255, b = p >> 16 & 255;
    put(o, r + (255 - r) * a * 0.8, g + (236 - g) * a * 0.8, b + (200 - b) * a * 0.8, 0);
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, cv.width, cv.height);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.22;
  ctx.filter = 'blur(' + Math.round(cv.height / 90) + 'px) brightness(1.1)';
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, cv.width, cv.height);
  ctx.restore();
}

const WARM = P('warm') || 320, SWEEPS_PER_SEC = 12;
let done = 0; const DUNE = [0, 0];
function locate() { let sx = 0, sy = 0, cx = 0, cy = 0, w = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = h[idx(x, y)]; if (v < 6 || rock[idx(x, y)]) continue;
    const a = x / N * 6.2832, b = y / N * 6.2832; sx += Math.cos(a) * v; sy += Math.sin(a) * v; cx += Math.cos(b) * v; cy += Math.sin(b) * v; w += v; }
  DUNE[0] = ((Math.atan2(sy, sx) / 6.2832 * N) + N) % N; DUNE[1] = ((Math.atan2(cy, cx) / 6.2832 * N) + N) % N; }
function advanceTo(t) { if (done < WARM) { while (done < WARM) { sweep(); done++; } locate(); } const target = WARM + Math.min(Math.floor(t * SWEEPS_PER_SEC), 1200); while (done < target) { sweep(); done++; } }
if (FIXED !== null) {
  const t0 = performance.now();
  advanceTo(FIXED); render(FIXED);
  if (qs.has('debug')) { const d=ctx.createImageData(N*4,N*4); for(let y=0;y<N*4;y++)for(let x=0;x<N*4;x++){const v=Math.min(255,h[idx(x>>2,y>>2)]*8), o=(y*N*4+x)*4; d.data[o]=v;d.data[o+1]=light[idx(x>>2,y>>2)]*255;d.data[o+2]=v;d.data[o+3]=255;} ctx.putImageData(d,0,0);}
  window.__ms = Math.round(performance.now() - t0);
  if (qs.has('debug')) { let mx=0,bare=0,sum=0; for(let i=0;i<NN;i++){ if(rock[i])continue; mx=Math.max(mx,h[i]); if(!h[i])bare++; sum+=h[i]; } window.__ms+=' max '+mx+' bare '+(bare/NN).toFixed(2)+' mean '+(sum/NN).toFixed(2); }
  document.title = 'done';
} else {
  const start = performance.now();
  advanceTo(0);
  (function loop() {
    const t = (performance.now() - start) / 1000;
    const target = WARM + Math.floor(t * SWEEPS_PER_SEC);
    let n = 0; while (done < target && n < 3) { sweep(); done++; n++; }
    render(t); requestAnimationFrame(loop);
  })();
}
})();
