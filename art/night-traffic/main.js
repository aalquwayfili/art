(function(){
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED = qs.has('t') ? parseFloat(qs.get('t')) || 0 : null;
const P = (k, d) => qs.has(k) ? parseFloat(qs.get(k)) : d;
let seed = 1446;
function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

const LX = 144, LY = 58;
const VROADS = [{ x: 14, art: 0 }, { x: 44, art: 0 }, { x: 72, art: 1 }, { x: 100, art: 0 }, { x: 130, art: 0 }];
const HROADS = [{ y: 8, art: 0 }, { y: 29, art: 1 }, { y: 50, art: 0 }];
const halfW = r => r.art ? 3 : 1;
const lanes = [];
function addLane(dir, road, off, vmax, dens, name) {
  const L = dir < 2 ? LX : LY;
  const ln = { dir, road, off, vmax, L, name, pos: [], vel: [], prev: [], id: [], stops: [], hist: [] };
  const n = Math.round(L * dens);
  const slots = []; for (let i = 0; i < L; i++) slots.push(i);
  for (let i = L - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const chosen = slots.slice(0, n).sort((a, b) => a - b);
  for (const s of chosen) { ln.pos.push(s); ln.vel.push(0); ln.prev.push(s); ln.id.push(ln.id.length); }
  lanes.push(ln); return ln;
}
const DENS_ART = P('da', 0.2), DENS_LOC = P('dl', 0.13);
for (const r of HROADS) {
  if (r.art) { addLane(0, r, 0.9, 4, DENS_ART, 'EB1'); addLane(0, r, 2.1, 4, DENS_ART * 0.8, 'EB2'); addLane(1, r, -0.9, 4, DENS_ART, 'WB1'); addLane(1, r, -2.1, 4, DENS_ART * 0.8, 'WB2'); }
  else { addLane(0, r, 0.5, 3, DENS_LOC, 'E'); addLane(1, r, -0.5, 3, DENS_LOC, 'W'); }
}
for (const r of VROADS) {
  if (r.art) { addLane(2, r, -0.9, 4, DENS_ART, 'SB1'); addLane(2, r, -2.1, 4, DENS_ART * 0.8, 'SB2'); addLane(3, r, 0.9, 4, DENS_ART, 'NB1'); addLane(3, r, 2.1, 4, DENS_ART * 0.8, 'NB2'); }
  else { addLane(2, r, -0.5, 3, DENS_LOC, 'S'); addLane(3, r, 0.5, 3, DENS_LOC, 'N'); }
}
const signals = [];
for (const h of HROADS) for (const v of VROADS) {
  const big = h.art || v.art, T = big ? 44 : 30;
  const off = h.art ? Math.round((v.x / 5) % T) : Math.floor(rnd() * T);
  signals.push({ h, v, T, off, hShare: h.art && !v.art ? 0.62 : v.art && !h.art ? 0.38 : 0.5 });
}
function sigState(sg, n) {
  const ph = (n + sg.off) % sg.T, g = Math.round(sg.T * sg.hShare);
  if (ph < g - 2) return 1; if (ph < g) return 0; if (ph < sg.T - 2) return 2; return 0;
}
for (const ln of lanes) {
  for (const sg of signals) {
    if (ln.dir < 2 && sg.h !== ln.road) continue;
    if (ln.dir >= 2 && sg.v !== ln.road) continue;
    const cross = ln.dir < 2 ? sg.v : sg.h, c = ln.dir < 2 ? cross.x : cross.y, hw = halfW(cross);
    let s;
    if (ln.dir === 0) s = c - hw;
    else if (ln.dir === 1) s = LX - 1 - (c + hw);
    else if (ln.dir === 2) s = c - hw;
    else s = LY - 1 - (c + hw);
    ln.stops.push({ s: ((s % ln.L) + ln.L) % ln.L, sg, axis: ln.dir < 2 ? 1 : 2 });
  }
  ln.stops.sort((a, b) => a.s - b.s);
}
const PSLOW = P('p', 0.22);
let stepN = 0;
function step() {
  for (const ln of lanes) {
    const n = ln.pos.length, L = ln.L;
    const red = [];
    for (const st of ln.stops) if (sigState(st.sg, stepN) !== st.axis) red.push(st.s);
    for (let i = 0; i < n; i++) {
      const s = ln.pos[i], nx = ln.pos[(i + 1) % n];
      let gap = n === 1 ? L : ((nx - s - 1) % L + L) % L;
      let v = Math.min(ln.vel[i] + 1, ln.vmax);
      for (const r of red) { const dr = ((r - s) % L + L) % L; if (dr > 0 && dr - 1 < gap) gap = dr - 1; }
      if (v > gap) v = gap;
      if (v > 0 && rnd() < PSLOW) v--;
      ln.vel[i] = v;
    }
    for (let i = 0; i < n; i++) { ln.prev[i] = ln.pos[i]; ln.pos[i] = (ln.pos[i] + ln.vel[i]) % L; }
    let k = 0; while (k < n - 1 && ln.pos[k] <= ln.pos[k + 1]) k++;
    if (k < n - 1) { const rot = a => a.splice(0, k + 1).forEach(q => a.push(q)); rot(ln.pos); rot(ln.vel); rot(ln.prev); rot(ln.id); }
    if (ln.track) { ln.hist.push({ pos: ln.pos.slice(), vel: ln.vel.slice(), prev: ln.prev.slice(), hi: ln.id.indexOf(0) }); if (ln.hist.length > 240) ln.hist.shift(); }
  }
  stepN++;
}
const tracked = lanes.find(l => l.dir === 0 && l.road.art && l.name === 'EB1'); tracked.track = true;

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const paper = document.createElement('canvas'), pctx = paper.getContext('2d');
let W, H, S, OX, OY, MW, MH, STY, STH, sc;
const INK = '#9fdcff', INK_S = 'rgba(159,220,255,', WHITE = 'rgba(236,247,255,', WARM = '#ffc56e';
function font(px, w) { return `${w || 400} ${Math.round(px)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`; }
function layout() {
  W = cv.width = innerWidth; H = cv.height = innerHeight; sc = Math.min(W / 1067, H / 600);
  const mx = W * 0.03, top = 46 * sc, minStrip = 96 * sc;
  S = Math.min((W - 2 * mx) / LX, (H - top - minStrip - 60 * sc) / LY);
  MW = LX * S; MH = LY * S;
  OX = (W - MW) / 2; OY = top;
  STY = OY + MH + 40 * sc; STH = H - STY - 22 * sc;
  paper.width = W; paper.height = H;
  drawPaper();
}
const wx = x => OX + x * S, wy = y => OY + y * S;
function jit() { return (rnd() - 0.5) * 0.9 * sc; }
function pline(c, x0, y0, x1, y1, over) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, o = (over || 0) * sc;
  c.beginPath(); c.moveTo(x0 - ux * o + jit(), y0 - uy * o + jit());
  const segs = Math.max(1, Math.round(l / (40 * sc)));
  for (let k = 1; k <= segs; k++) { const f = k / segs; c.lineTo(x0 + dx * f + (k === segs ? ux * o : 0) + jit() * 0.6, y0 + dy * f + (k === segs ? uy * o : 0) + jit() * 0.6); }
  c.stroke();
}
function drawPaper() {
  const c = pctx, saveSeed = seed; seed = 777;
  const g = c.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, '#113779'); g.addColorStop(0.6, '#0c2b66'); g.addColorStop(1, '#061640');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const nimg = c.getImageData(0, 0, W, H), dd = nimg.data;
  const cell = 64, grid = []; for (let i = 0; i < (Math.ceil(W / cell) + 2) * (Math.ceil(H / cell) + 2); i++) grid.push(rnd());
  const gw = Math.ceil(W / cell) + 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = x / cell, gy = y / cell, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
    const m = (grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x0 + 1] * fx) * (1 - fy) + (grid[(y0 + 1) * gw + x0] * (1 - fx) + grid[(y0 + 1) * gw + x0 + 1] * fx) * fy;
    const n = (rnd() - 0.5) * 10 + (m - 0.5) * 16, o = (y * W + x) * 4;
    dd[o] += n * 0.6; dd[o + 1] += n * 0.8; dd[o + 2] += n;
  }
  c.putImageData(nimg, 0, 0);
  c.strokeStyle = 'rgba(190,225,255,0.05)'; c.lineWidth = 1;
  for (let k = 0; k < 260; k++) { const x = rnd() * W, y = rnd() * H, a = rnd() * 6.28, l = 6 + rnd() * 20; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  c.strokeStyle = 'rgba(0,10,40,0.22)'; c.lineWidth = 2 * sc; c.beginPath(); c.moveTo(W * 0.5 + 3, 0); c.lineTo(W * 0.5 - 2, H); c.stroke();
  c.strokeStyle = 'rgba(180,215,255,0.06)'; c.lineWidth = 1.5 * sc; c.beginPath(); c.moveTo(W * 0.5 + 5, 0); c.lineTo(W * 0.5, H); c.stroke();
  c.strokeStyle = INK_S + '0.06)'; c.lineWidth = 1;
  for (let x = 0; x <= LX; x += 4) { c.beginPath(); c.moveTo(wx(x), wy(0)); c.lineTo(wx(x), wy(LY)); c.stroke(); }
  for (let y = 0; y <= LY; y += 4) { c.beginPath(); c.moveTo(wx(0), wy(y)); c.lineTo(wx(LX), wy(y)); c.stroke(); }
  c.strokeStyle = INK_S + '0.55)'; c.lineWidth = 1.2 * sc;
  c.strokeRect(OX - 6 * sc, OY - 6 * sc, MW + 12 * sc, MH + 12 * sc);
  c.strokeStyle = INK_S + '0.25)'; c.lineWidth = 1;
  c.strokeRect(OX - 10 * sc, OY - 10 * sc, MW + 20 * sc, MH + 20 * sc);
  const xs = [0, ...VROADS.map(r => r.x), LX], ys = [0, ...HROADS.map(r => r.y), LY];
  const vw = (i) => (i === 0 || i === xs.length - 1) ? 0 : halfW(VROADS[i - 1]) + 1.2, hw = (j) => (j === 0 || j === ys.length - 1) ? 0 : halfW(HROADS[j - 1]) + 1.2;
  let mosqueDone = false;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i] + vw(i), x1 = xs[i + 1] - vw(i + 1), y0 = ys[j] + hw(j), y1 = ys[j + 1] - hw(j + 1);
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    const midY = (y0 + y1) / 2;
    c.strokeStyle = INK_S + '0.18)'; c.lineWidth = 1; c.setLineDash([3 * sc, 3 * sc]);
    pline(c, wx(x0 + 1), wy(midY), wx(x1 - 1), wy(midY)); c.setLineDash([]);
    for (const [a0, a1] of [[y0 + 0.6, midY - 0.8], [midY + 0.8, y1 - 0.6]]) {
      let x = x0 + 0.6;
      while (x < x1 - 3) {
        const w = 3.2 + rnd() * 3.4, xe = Math.min(x + w, x1 - 0.6);
        if (xe - x < 2.4) break;
        c.strokeStyle = INK_S + '0.16)'; c.lineWidth = 0.8 * sc;
        c.strokeRect(wx(x), wy(a0), (xe - x) * S, (a1 - a0) * S);
        const bx0 = x + 0.5 + rnd() * 0.4, bx1 = xe - 0.5 - rnd() * 0.6, by0 = a0 + 0.5 + rnd() * 0.5, by1 = a1 - 0.6 - rnd() * 0.8;
        if (bx1 - bx0 > 1 && by1 - by0 > 1) {
          c.strokeStyle = INK_S + '0.36)'; c.lineWidth = 0.9 * sc;
          pline(c, wx(bx0), wy(by0), wx(bx1), wy(by0), 3); pline(c, wx(bx1), wy(by0), wx(bx1), wy(by1), 3);
          pline(c, wx(bx1), wy(by1), wx(bx0), wy(by1), 3); pline(c, wx(bx0), wy(by1), wx(bx0), wy(by0), 3);
          if (rnd() < 0.3) {
            c.save(); c.beginPath(); c.rect(wx(bx0), wy(by0), (bx1 - bx0) * S, (by1 - by0) * S); c.clip();
            c.strokeStyle = INK_S + '0.11)'; c.lineWidth = 0.7;
            for (let q = -H; q < W; q += 4 * sc) { c.beginPath(); c.moveTo(wx(bx0) + q, wy(by0)); c.lineTo(wx(bx0) + q + 60 * sc, wy(by0) + 60 * sc); c.stroke(); }
            c.restore();
          }
        }
        x = xe;
      }
    }
    if (!mosqueDone && i === 1 && j === 1) {
      mosqueDone = true;
      const cx = wx((x0 + x1) / 2 + 3), cy = wy(y0 + (midY - y0) / 2 + 0.2), r = 3.4 * S;
      c.save(); c.translate(cx, cy); c.rotate((244 - 270) * Math.PI / 180);
      c.fillStyle = '#10367c'; c.fillRect(-r * 1.2, -r * 0.9, r * 2.4, r * 1.8);
      c.strokeStyle = WHITE + '0.8)'; c.lineWidth = 1.1 * sc; c.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      c.beginPath(); c.arc(0, 0, r * 0.55, 0, 6.283); c.stroke();
      c.beginPath(); c.arc(r * 0.82, -r * 0.62, r * 0.14, 0, 6.283); c.stroke();
      c.beginPath(); c.moveTo(-r, -r * 0.18); c.lineTo(-r - r * 0.22, 0); c.lineTo(-r, r * 0.18); c.stroke();
      c.restore();
      c.fillStyle = INK_S + '0.7)'; c.font = font(8.5 * sc); c.textAlign = 'left';
      c.fillText('MASJID  → QIBLA 244°', cx - r * 1.3, cy + r * 1.55);
    }
  }
  for (const r of HROADS) {
    const hw = halfW(r);
    c.strokeStyle = INK_S + '0.85)'; c.lineWidth = 1.3 * sc;
    for (const e of [-hw, hw]) {
      let x = 0; const cuts = VROADS.map(v => [v.x - halfW(v), v.x + halfW(v)]);
      for (const [a, b] of cuts) { pline(c, wx(x), wy(r.y + e), wx(a), wy(r.y + e), 2); x = b; }
      pline(c, wx(x), wy(r.y + e), wx(LX), wy(r.y + e));
    }
    if (r.art) {
      c.lineWidth = 0.9 * sc; c.strokeStyle = INK_S + '0.6)';
      let x = 0; for (const v of VROADS) { const a = v.x - halfW(v) - 1.5; pline(c, wx(x + 1.5), wy(r.y - 0.25), wx(a), wy(r.y - 0.25)); pline(c, wx(x + 1.5), wy(r.y + 0.25), wx(a), wy(r.y + 0.25)); x = v.x + halfW(v); }
      pline(c, wx(x + 1.5), wy(r.y - 0.25), wx(LX), wy(r.y - 0.25)); pline(c, wx(x + 1.5), wy(r.y + 0.25), wx(LX), wy(r.y + 0.25));
      for (let px = 3; px < LX; px += 6) { if (VROADS.some(v => Math.abs(px - v.x) < halfW(v) + 3)) continue; palm(c, wx(px), wy(r.y), S * 0.55); }
      c.setLineDash([4 * sc, 6 * sc]); c.strokeStyle = INK_S + '0.3)'; c.lineWidth = 0.8 * sc;
      for (const o of [-1.5, 1.5]) pline(c, wx(0), wy(r.y + o), wx(LX), wy(r.y + o));
      c.setLineDash([]);
    } else { c.setLineDash([3 * sc, 5 * sc]); c.strokeStyle = INK_S + '0.35)'; c.lineWidth = 0.8 * sc; pline(c, wx(0), wy(r.y), wx(LX), wy(r.y)); c.setLineDash([]); }
  }
  for (const r of VROADS) {
    const hw = halfW(r);
    c.strokeStyle = INK_S + '0.85)'; c.lineWidth = 1.3 * sc;
    for (const e of [-hw, hw]) {
      let y = 0; for (const h of HROADS) { pline(c, wx(r.x + e), wy(y), wx(r.x + e), wy(h.y - halfW(h)), 2); y = h.y + halfW(h); }
      pline(c, wx(r.x + e), wy(y), wx(r.x + e), wy(LY));
    }
    if (r.art) {
      c.lineWidth = 0.9 * sc; c.strokeStyle = INK_S + '0.6)';
      let y = 0; for (const h of HROADS) { const a = h.y - halfW(h) - 1.5; pline(c, wx(r.x - 0.25), wy(y + 1.5), wx(r.x - 0.25), wy(a)); pline(c, wx(r.x + 0.25), wy(y + 1.5), wx(r.x + 0.25), wy(a)); y = h.y + halfW(h); }
      pline(c, wx(r.x - 0.25), wy(y + 1.5), wx(r.x - 0.25), wy(LY)); pline(c, wx(r.x + 0.25), wy(y + 1.5), wx(r.x + 0.25), wy(LY));
      for (let py = 3; py < LY; py += 6) { if (HROADS.some(h => Math.abs(py - h.y) < halfW(h) + 3)) continue; palm(c, wx(r.x), wy(py), S * 0.55); }
      c.setLineDash([4 * sc, 6 * sc]); c.strokeStyle = INK_S + '0.3)'; c.lineWidth = 0.8 * sc;
      for (const o of [-1.5, 1.5]) pline(c, wx(r.x + o), wy(0), wx(r.x + o), wy(LY));
      c.setLineDash([]);
    } else { c.setLineDash([3 * sc, 5 * sc]); c.strokeStyle = INK_S + '0.35)'; c.lineWidth = 0.8 * sc; pline(c, wx(r.x), wy(0), wx(r.x), wy(LY)); c.setLineDash([]); }
  }
  c.fillStyle = INK_S + '0.22)';
  for (const sg of signals) {
    if (!(sg.h.art || sg.v.art)) continue;
    const hwv = halfW(sg.v), hwh = halfW(sg.h);
    for (let k = -hwh + 0.3; k < hwh; k += 0.6) { c.fillRect(wx(sg.v.x - hwv - 1.1), wy(sg.h.y + k), 0.8 * S, 0.3 * S); c.fillRect(wx(sg.v.x + hwv + 0.3), wy(sg.h.y + k), 0.8 * S, 0.3 * S); }
    for (let k = -hwv + 0.3; k < hwv; k += 0.6) { c.fillRect(wx(sg.v.x + k), wy(sg.h.y - hwh - 1.1), 0.3 * S, 0.8 * S); c.fillRect(wx(sg.v.x + k), wy(sg.h.y + hwh + 0.3), 0.3 * S, 0.8 * S); }
  }
  c.fillStyle = INK_S + '0.75)'; c.font = font(9 * sc, 500); c.textAlign = 'left';
  c.fillText('ARTERIAL  ·  6 LANES  ·  Vₘₐₓ 4 CELLS/S', wx(3), wy(HROADS[1].y - 3.6));
  c.save(); c.translate(wx(VROADS[2].x - 4.6), wy(HROADS[1].y + 6)); c.rotate(Math.PI / 2); c.fillText('ARTERIAL  ·  N–S', 0, 0); c.restore();
  c.font = font(8 * sc); c.fillStyle = INK_S + '0.55)';
  c.fillText('LOCAL ST. 12', wx(18), wy(HROADS[0].y - 1.6)); c.fillText('LOCAL ST. 14', wx(104), wy(HROADS[2].y - 1.6));
  const nx = OX + MW - 10 * sc, ny = OY - 16 * sc;
  c.strokeStyle = WHITE + '0.8)'; c.fillStyle = WHITE + '0.8)'; c.lineWidth = 1 * sc;
  c.beginPath(); c.moveTo(nx, ny - 11 * sc); c.lineTo(nx + 4 * sc, ny + 5 * sc); c.lineTo(nx, ny + 2 * sc); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(nx, ny - 11 * sc); c.lineTo(nx - 4 * sc, ny + 5 * sc); c.lineTo(nx, ny + 2 * sc); c.closePath(); c.stroke();
  c.font = font(9 * sc, 600); c.textAlign = 'center'; c.fillText('N', nx, ny - 15 * sc);
  const sx0 = nx - 160 * sc, sy0 = ny + 2 * sc, per = 100 / 7.5 * S;
  c.lineWidth = 1 * sc;
  for (let k = 0; k < 4; k++) { if (k % 2 === 0) c.fillRect(sx0 + k * per / 2, sy0 - 2.5 * sc, per / 2, 3 * sc); else c.strokeRect(sx0 + k * per / 2, sy0 - 2.5 * sc, per / 2, 3 * sc); }
  c.font = font(8 * sc); c.textAlign = 'center';
  c.fillText('0', sx0, sy0 - 6 * sc); c.fillText('100', sx0 + per, sy0 - 6 * sc); c.fillText('200 m', sx0 + per * 2, sy0 - 6 * sc);
  c.textAlign = 'left'; c.fillStyle = WHITE + '0.9)'; c.font = font(12 * sc, 700);
  const ty = OY - 20 * sc;
  c.fillText('NIGHT TRAFFIC', OX, ty);
  c.fillStyle = INK_S + '0.7)'; c.font = font(8.5 * sc);
  seed = saveSeed;
  c.fillText('SUPERBLOCK GRID, PLAN  ·  NAGEL–SCHRECKENBERG, p = ' + PSLOW.toFixed(2) + '  ·  CELL 7.5 m, STEP 1 s', OX + 118 * sc, ty);
}
function palm(c, x, y, r) {
  c.strokeStyle = INK_S + '0.5)'; c.lineWidth = 0.8 * sc;
  c.beginPath(); c.arc(x, y, r * 0.18, 0, 6.283); c.stroke();
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + x; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25); c.quadraticCurveTo(x + Math.cos(a + 0.3) * r * 0.8, y + Math.sin(a + 0.3) * r * 0.8, x + Math.cos(a + 0.2) * r, y + Math.sin(a + 0.2) * r); c.stroke(); }
}

function laneXY(ln, s) {
  if (ln.dir === 0) return [wx(s + 0.5), wy(ln.road.y + ln.off)];
  if (ln.dir === 1) return [wx(LX - 1 - s + 0.5), wy(ln.road.y + ln.off)];
  if (ln.dir === 2) return [wx(ln.road.x + ln.off), wy(s + 0.5)];
  return [wx(ln.road.x + ln.off), wy(LY - 1 - s + 0.5)];
}
const DIRV = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const beam = document.createElement('canvas'); beam.width = 64; beam.height = 32;
{ const c = beam.getContext('2d'), g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,190,100,0.38)'); g.addColorStop(1, 'rgba(255,190,100,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, 12.8); c.lineTo(64, 6.4); c.lineTo(64, 25.6); c.lineTo(0, 19.2); c.fill(); }
const glow = document.createElement('canvas'); glow.width = glow.height = 32;
{ const c = glow.getContext('2d'), g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,170,80,0.16)'); g.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }

function render(t, frac) {
  ctx.drawImage(paper, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(OX - 1, OY - 1, MW + 2, MH + 2); ctx.clip();
  for (const sg of signals) {
    const st = sigState(sg, stepN - 1), hwv = halfW(sg.v), hwh = halfW(sg.h);
    ctx.lineWidth = 1.6 * sc;
    ctx.strokeStyle = st === 1 ? WHITE + '0.85)' : 'rgba(255,110,90,0.75)';
    ctx.beginPath(); ctx.moveTo(wx(sg.v.x - hwv - 0.2), wy(sg.h.y)); ctx.lineTo(wx(sg.v.x - hwv - 0.2), wy(sg.h.y + hwh)); ctx.moveTo(wx(sg.v.x + hwv + 0.2), wy(sg.h.y)); ctx.lineTo(wx(sg.v.x + hwv + 0.2), wy(sg.h.y - hwh)); ctx.stroke();
    ctx.strokeStyle = st === 2 ? WHITE + '0.85)' : 'rgba(255,110,90,0.75)';
    ctx.beginPath(); ctx.moveTo(wx(sg.v.x), wy(sg.h.y - hwh - 0.2)); ctx.lineTo(wx(sg.v.x - hwv), wy(sg.h.y - hwh - 0.2)); ctx.moveTo(wx(sg.v.x), wy(sg.h.y + hwh + 0.2)); ctx.lineTo(wx(sg.v.x + hwv), wy(sg.h.y + hwh + 0.2)); ctx.stroke();
  }
  const cars = [];
  for (const ln of lanes) {
    const n = ln.pos.length, [dx, dy] = DIRV[ln.dir];
    for (let i = 0; i < n; i++) {
      let from = ln.prev[i], to = ln.pos[i]; if (to < from) to += ln.L;
      const s = (from + (to - from) * frac) % ln.L;
      const [x, y] = laneXY(ln, s);
      cars.push([x, y, dx, dy, ln.vel[i], ln, ln.track && ln.id[i] === 0]);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, dx, dy, v] of cars) {
    const L = S * (1.8 + v * 0.45), fx = x + dx * S * 0.4, fy = y + dy * S * 0.4;
    ctx.setTransform(dx * L / 64, dy * L / 64, -dy * S / 16, dx * S / 16, fx, fy);
    ctx.drawImage(beam, 0, -16);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  for (const [x, y, dx, dy, v] of cars) {
    const hl = S * 0.5, hw = S * 0.28;
    ctx.fillStyle = '#0d2d6c'; ctx.strokeStyle = WHITE + '0.9)'; ctx.lineWidth = Math.max(0.8, 0.9 * sc);
    ctx.beginPath(); ctx.rect(x - Math.abs(dx) * hl - Math.abs(dy) * hw, y - Math.abs(dy) * hl - Math.abs(dx) * hw, 2 * (Math.abs(dx) * hl + Math.abs(dy) * hw), 2 * (Math.abs(dy) * hl + Math.abs(dx) * hw)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = WARM; const r = Math.max(1, 1.1 * sc);
    for (const sd of [-1, 1]) ctx.fillRect(x + dx * hl - dy * hw * 0.6 * sd - r / 2, y + dy * hl + dx * hw * 0.6 * sd - r / 2, r, r);
    if (v === 0) { ctx.fillStyle = 'rgba(255,90,70,0.95)'; for (const sd of [-1, 1]) ctx.fillRect(x - dx * hl - dy * hw * 0.6 * sd - r / 2, y - dy * hl + dx * hw * 0.6 * sd - r / 2, r, r); }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, dx, dy] of cars) { const gx = x + dx * S * 1.1, gy = y + dy * S * 1.1, R = S * 1.6; ctx.drawImage(glow, gx - R, gy - R, 2 * R, 2 * R); }
  ctx.globalCompositeOperation = 'source-over';
  annotateQueue(tracked, frac);
  annotateSignal();
  const me = cars.find(c => c[6]);
  if (me) {
    const [x, y, , , v] = me;
    ctx.fillStyle = WHITE + '0.95)'; ctx.fillRect(x - S * 0.5, y - S * 0.28, S, S * 0.56);
    ctx.strokeStyle = WHITE + '0.8)'; ctx.lineWidth = 0.9 * sc;
    const side = x < OX + 90 * sc ? 1 : -1, lx = x + side * 3 * S, ly = y + 5.5 * S, bx = side > 0 ? lx : lx - 74 * sc;
    ctx.beginPath(); ctx.moveTo(x + side * 0.3 * S, y + 0.6 * S); ctx.lineTo(lx, ly); ctx.lineTo(lx + side * 74 * sc, ly); ctx.stroke();
    ctx.fillStyle = '#0d2e6b'; ctx.fillRect(bx, ly + 2 * sc, 74 * sc, 20 * sc);
    ctx.fillStyle = WHITE + '0.95)'; ctx.font = font(8.5 * sc, 600); ctx.textAlign = 'left';
    ctx.fillText('CAR 042 \u2192 HOME', bx, ly + 11 * sc);
    ctx.fillStyle = WHITE + '0.75)'; ctx.font = font(8 * sc);
    ctx.fillText(Math.round(v * 27) + ' km/h', bx, ly + 20 * sc);
  }
  ctx.restore();
  spaceTime(t, frac);
  readouts(t);
}

function annotateSignal() {
  const sg = signals.find(q => q.h.art && q.v.art), n = stepN - 1, st = sigState(sg, n);
  const ph = (n + sg.off) % sg.T, g = Math.round(sg.T * sg.hShare);
  const left = st === 1 ? g - 2 - ph : st === 2 ? sg.T - 2 - ph : 2 - (ph < g ? ph - (g - 2) : ph - (sg.T - 2));
  const x = wx(sg.v.x + halfW(sg.v) + 0.6), y = wy(sg.h.y - halfW(sg.h) - 0.6), lx = x + 7 * S, ly = y - 7 * S;
  ctx.strokeStyle = WHITE + '0.8)'; ctx.lineWidth = 0.9 * sc;
  ctx.beginPath(); ctx.arc(wx(sg.v.x), wy(sg.h.y), (halfW(sg.v) + 1.6) * S, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1.2 * S, y - 1.2 * S); ctx.lineTo(lx, ly); ctx.lineTo(lx + 92 * sc, ly); ctx.stroke();
  ctx.fillStyle = '#0d2e6b'; ctx.fillRect(lx, ly - 22 * sc, 132 * sc, 20 * sc);
  ctx.fillStyle = WHITE + '0.95)'; ctx.font = font(8.5 * sc, 600); ctx.textAlign = 'left';
  ctx.fillText('SIGNAL C3  \u00b7  CYCLE ' + sg.T + ' s', lx + 2 * sc, ly - 13 * sc);
  ctx.fillStyle = st === 0 ? 'rgba(255,120,100,0.95)' : WHITE + '0.8)'; ctx.font = font(8 * sc);
  ctx.fillText((st === 1 ? 'E\u2013W GREEN ' : st === 2 ? 'N\u2013S GREEN ' : 'ALL RED ') + Math.max(0, left) + ' s', lx + 2 * sc, ly - 3.5 * sc);
}
function queues(ln) {
  const n = ln.pos.length, out = []; let cur = null;
  for (let k = 0; k < n; k++) {
    const i = k, v = ln.vel[i];
    if (v <= 1) { if (cur && ((ln.pos[i] - cur.end + ln.L) % ln.L) <= 2) { cur.end = ln.pos[i]; cur.n++; } else { if (cur) out.push(cur); cur = { start: ln.pos[i], end: ln.pos[i], n: 1 }; } }
  }
  if (cur) out.push(cur);
  return out.filter(q => q.n >= 3);
}
function annotateQueue(ln, frac) {
  const qsL = queues(ln); if (!qsL.length) return;
  let best = null, bd = 1e9;
  for (const q of qsL) { const mid = (q.start + ((q.end - q.start + ln.L) % ln.L) / 2) % ln.L, dd = Math.abs(mid - LX * 0.46) - q.n * 3; if (dd < bd) { bd = dd; best = q; } }
  const len = ((best.end - best.start + ln.L) % ln.L) + 1;
  if (best.end < best.start) return;
  const [x0, y] = laneXY(ln, best.start - 0.5), [x1] = laneXY(ln, best.end + 0.5), yy = y - 4.2 * S;
  ctx.strokeStyle = WHITE + '0.85)'; ctx.fillStyle = WHITE + '0.9)'; ctx.lineWidth = 0.9 * sc;
  ctx.beginPath(); ctx.moveTo(x0, y - 0.6 * S); ctx.lineTo(x0, yy - 3 * sc); ctx.moveTo(x1, y - 0.6 * S); ctx.lineTo(x1, yy - 3 * sc); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
  for (const [ax, sd] of [[x0, 1], [x1, -1]]) { ctx.beginPath(); ctx.moveTo(ax, yy); ctx.lineTo(ax + sd * 5 * sc, yy - 2 * sc); ctx.lineTo(ax + sd * 5 * sc, yy + 2 * sc); ctx.closePath(); ctx.fill(); }
  ctx.font = font(9 * sc, 600); ctx.textAlign = 'center';
  const label = 'QUEUE ' + best.n + ' VEH  ·  ' + Math.round(len * 7.5) + ' m';
  const tw = ctx.measureText(label).width + 8 * sc;
  ctx.fillStyle = '#0f3576'; ctx.fillRect((x0 + x1) / 2 - tw / 2, yy - 13 * sc, tw, 10 * sc);
  ctx.fillStyle = WHITE + '0.95)'; ctx.fillText(label, (x0 + x1) / 2, yy - 5 * sc);
}

function spaceTime(t, frac) {
  const x0 = OX, x1 = OX + MW, y0 = STY, h = STH, rows = tracked.hist.length;
  ctx.strokeStyle = INK_S + '0.55)'; ctx.lineWidth = 1 * sc; ctx.strokeRect(x0, y0, MW, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, MW, h); ctx.clip();
  const rh = Math.max(1.2, 1.5 * sc), NR = Math.min(rows, Math.floor(h / rh) + 1);
  ctx.lineWidth = Math.max(0.8, 0.9 * sc); ctx.lineCap = 'round';
  const mv = new Path2D(), st = new Path2D();
  for (let r = 0; r < NR; r++) {
    const rec = tracked.hist[rows - 1 - r], yb = y0 + (r + frac) * rh, ya = yb + rh;
    for (let i = 0; i < rec.pos.length; i++) {
      const a = rec.prev[i], b = rec.pos[i]; if (b < a) continue;
      const xa = x0 + (a + 0.5) * S, xb = x0 + (b + 0.5) * S;
      if (rec.vel[i] === 0) { st.moveTo(xa, ya); st.lineTo(xb, yb); } else { mv.moveTo(xa, ya); mv.lineTo(xb, yb); }
    }
  }
  ctx.strokeStyle = INK_S + '0.55)'; ctx.stroke(mv);
  const me = new Path2D();
  for (let r = 0; r < NR; r++) {
    const rec = tracked.hist[rows - 1 - r], i = rec.hi, a = rec.prev[i], b = rec.pos[i]; if (b < a) continue;
    const yb = y0 + (r + frac) * rh; me.moveTo(x0 + (a + 0.5) * S, yb + rh); me.lineTo(x0 + (b + 0.5) * S, yb);
  }
  ctx.save(); ctx.strokeStyle = WHITE + '0.95)'; ctx.lineWidth = Math.max(1.5, 2 * sc); ctx.stroke(me); ctx.restore();
  ctx.strokeStyle = 'rgba(255,197,110,0.85)'; ctx.lineWidth = Math.max(1, 1.3 * sc); ctx.stroke(st);
  ctx.restore();
  ctx.strokeStyle = INK_S + '0.25)'; ctx.setLineDash([2 * sc, 3 * sc]);
  for (const v of VROADS) { ctx.beginPath(); ctx.moveTo(wx(v.x), y0); ctx.lineTo(wx(v.x), y0 + h); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = INK_S + '0.8)'; ctx.font = font(8 * sc); ctx.textAlign = 'left';
  ctx.fillText('SPACE–TIME, ARTERIAL EASTBOUND  ·  x →   t ↓  (' + Math.round(h / rh) + ' s)', x0, y0 - 4 * sc);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,197,110,0.9)'; ctx.fillText('■ STOPPED', x1, y0 - 4 * sc);
  ctx.fillStyle = INK_S + '0.8)'; ctx.fillText('■ MOVING    ', x1 - 60 * sc, y0 - 4 * sc); ctx.fillStyle = WHITE + '0.95)'; ctx.fillText('— CAR 042    ', x1 - 128 * sc, y0 - 4 * sc);
}

function readouts(t) {
  let n = 0, sv = 0, stopped = 0;
  for (const ln of lanes) for (const v of ln.vel) { n++; sv += v; if (v === 0) stopped++; }
  const kmh = sv / n * 7.5 * 3.6;
  const clock = 23 * 3600 + 41 * 60 + stepN;
  const hh = String(Math.floor(clock / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(clock / 60) % 60).padStart(2, '0'), ss = String(clock % 60).padStart(2, '0');
  ctx.fillStyle = WHITE + '0.85)'; ctx.font = font(9 * sc); ctx.textAlign = 'left';
  const y = OY + MH + 22 * sc;
  ctx.fillText(hh + ':' + mm + ':' + ss + '   ' + n + ' VEHICLES   MEAN ' + kmh.toFixed(0) + ' km/h   STOPPED ' + stopped, OX, y);
}

const WARMUP = 240, SPS = P('sps', 1.6);
function advanceTo(t) { const target = WARMUP + Math.floor(Math.min(t, 600) * SPS) + 1; while (stepN < target) step(); }
layout();
addEventListener('resize', layout);
if (FIXED !== null) {
  const t0 = performance.now();
  advanceTo(FIXED);
  render(FIXED, (FIXED * SPS) % 1);
  ctx.getImageData(0, 0, 1, 1);
  window.__ms = Math.round(performance.now() - t0);
  document.title = 'done';
} else {
  const start = performance.now();
  (function loop() {
    const t = (performance.now() - start) / 1000;
    advanceTo(t); render(t, (t * SPS) % 1);
    requestAnimationFrame(loop);
  })();
}
})();
