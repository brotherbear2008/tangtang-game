'use strict';
/* =========================================================
   航天基地爆破战 · 画面与 HUD
   ========================================================= */

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const fogC = document.createElement('canvas');
const fctx = fogC.getContext('2d');
let CW = 0, CH = 0, DPR = 1;
const CAM = { x: MW * TILE / 2, y: MH * TILE / 2, s: 0.6 };
const FONT = (w, s) => `${w} ${s}px "Chakra Petch", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
const DFONT = s => `${s}px "ZCOOL QingKe HuangYou", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = cv.clientWidth || window.innerWidth; CH = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  fogC.width = cv.width; fogC.height = cv.height;
  if (typeof resize3d === 'function') resize3d();
}
window.addEventListener('resize', resize);

function worldXf(c) { c.setTransform(DPR * CAM.s, 0, 0, DPR * CAM.s, DPR * (CW / 2 - CAM.x * CAM.s), DPR * (CH / 2 - CAM.y * CAM.s)); }
function screenToWorld(sx, sy) { return { x: (sx - CW / 2) / CAM.s + CAM.x, y: (sy - CH / 2) / CAM.s + CAM.y }; }
function worldToScreen(x, y) { return { x: (x - CAM.x) * CAM.s + CW / 2, y: (y - CAM.y) * CAM.s + CH / 2 }; }

function updateCamera(dt) {
  if (G.mode === '3d' && T3) return updateCamera3d(dt);
  if (G.state !== 'game') {
    const t = performance.now() / 1000;
    CAM.s = Math.max(CW / (MW * TILE), CH / (MH * TILE)) * 1.08;
    CAM.x = MW * TILE / 2 + Math.sin(t * 0.05) * 140;
    CAM.y = MH * TILE / 2 + Math.cos(t * 0.04) * 70;
    return;
  }
  const v = viewer() || G.player;
  let s = clamp(Math.min(CW / 1350, CH / 820), 0.42, 1.25);
  let tx = v.x, ty = v.y;
  const p = G.player;
  if (v === p && p.alive) {
    const look = p.scoped ? 0.55 : 0.2;
    tx += (Input.mx - CW / 2) / CAM.s * look;
    ty += (Input.my - CH / 2) / CAM.s * look;
    if (p.scoped) s *= 0.8;
  }
  const k = 1 - Math.exp(-dt * 10);
  CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k;
  CAM.s += (s - CAM.s) * (1 - Math.exp(-dt * 6));
}

/* ---------- 地图 ---------- */
function drawZone(c, rect, color, letter, sub) {
  const [x, y, w, h] = rect.map(v => v * TILE);
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.globalAlpha = 0.07; c.fillStyle = color; c.fillRect(x, y, w, h);
  c.globalAlpha = 0.13; c.strokeStyle = color; c.lineWidth = 6;
  c.beginPath();
  for (let k = -h; k < w; k += 28) { c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); }
  c.stroke();
  c.restore();
  c.save();
  c.globalAlpha = 0.65; c.strokeStyle = color; c.lineWidth = 2; c.setLineDash([12, 8]);
  c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  c.setLineDash([]);
  c.globalAlpha = 0.2; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = DFONT(150); c.fillText(letter, x + w / 2, y + h / 2);
  if (sub) { c.globalAlpha = 0.55; c.font = FONT(600, 16); c.fillText(sub, x + w / 2, y + h / 2 + 88); }
  c.restore();
}
function drawCentrifuge(c, x, y, r, t) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 4, x, y, r);
  g.addColorStop(0, '#5a5f86'); g.addColorStop(1, '#25243f');
  c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x + 5, y + 7, r, 0, TAU); c.fill();
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(190,180,255,0.35)'; c.lineWidth = 2; c.stroke();
  c.save(); c.translate(x, y); c.rotate(t * 2.2);
  c.strokeStyle = 'rgba(210,200,255,0.5)'; c.lineWidth = 6;
  for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.82, 0); c.stroke(); c.fillStyle = '#c7c1ff'; c.beginPath(); c.arc(r * 0.82, 0, 6, 0, TAU); c.fill(); }
  c.restore();
  c.fillStyle = '#14132a'; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
}
function drawRocket(c, x, y, r) {
  c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(x + 6, y + 8, r * 0.9, 0, TAU); c.fill();
  c.fillStyle = '#7d3a2c';
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + Math.PI / 4;
    c.beginPath();
    c.moveTo(x + Math.cos(a - 0.25) * r * 0.55, y + Math.sin(a - 0.25) * r * 0.55);
    c.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
    c.lineTo(x + Math.cos(a + 0.25) * r * 0.55, y + Math.sin(a + 0.25) * r * 0.55);
    c.fill();
  }
  const g = c.createRadialGradient(x - r * 0.25, y - r * 0.25, 2, x, y, r * 0.7);
  g.addColorStop(0, '#f2f4f8'); g.addColorStop(1, '#9aa3b4');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.66, 0, TAU); c.fill();
  c.strokeStyle = '#c94f3a'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, r * 0.48, 0, TAU); c.stroke();
  c.fillStyle = '#1b2230'; c.beginPath(); c.arc(x, y, r * 0.2, 0, TAU); c.fill();
}
function drawDecor(c, t) {
  for (const d of DECOR) {
    if (d.type === 'pool') {
      const [x, y, w, h] = d.rect.map(v => v * TILE);
      c.fillStyle = 'rgba(40,120,170,0.22)'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
      c.strokeStyle = 'rgba(110,190,230,0.25)'; c.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const yy = y + 14 + ((t * 12 + k * (h / 3)) % (h - 24));
        c.beginPath(); c.moveTo(x + 10, yy); c.lineTo(x + w - 10, yy); c.stroke();
      }
      c.strokeStyle = 'rgba(110,190,230,0.35)'; c.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    } else if (d.type === 'pad') {
      const x = d.at[0] * TILE, y = d.at[1] * TILE, r = d.r * TILE;
      c.strokeStyle = 'rgba(255,190,80,0.18)'; c.lineWidth = 10; c.setLineDash([22, 14]);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.setLineDash([]);
      c.strokeStyle = 'rgba(255,190,80,0.1)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 0.75, 0, TAU); c.stroke();
    } else if (d.type === 'track') {
      const x = d.at[0] * TILE, y = d.at[1] * TILE, r = d.r * TILE;
      c.strokeStyle = 'rgba(170,150,255,0.14)'; c.lineWidth = 16; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    }
  }
}
function drawMapLayer(c, { labels = true, detail = true, t = 0 } = {}) {
  const W = MW * TILE, H = MH * TILE;
  c.fillStyle = PALETTE.floor; c.fillRect(0, 0, W, H);
  for (const r of REGIONS) { const [x, y, w, h] = r.rect; c.fillStyle = r.tint; c.fillRect(x * TILE, y * TILE, w * TILE, h * TILE); }
  if (detail) {
    c.strokeStyle = 'rgba(140,170,220,0.05)'; c.lineWidth = 1; c.beginPath();
    for (let x = 1; x < MW; x++) { c.moveTo(x * TILE, 0); c.lineTo(x * TILE, H); }
    for (let y = 1; y < MH; y++) { c.moveTo(0, y * TILE); c.lineTo(W, y * TILE); }
    c.stroke();
    drawDecor(c, t);
  }
  drawZone(c, PLANT_ZONE, PALETTE.spike, 'A', detail ? '炸弹安放区' : '');
  drawZone(c, B_ZONE, '#7f8fb0', 'B', detail ? '未开放' : '');
  if (labels) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const r of REGIONS) {
      const [x, y, w, h] = r.rect;
      const cx = (x + w / 2) * TILE, cy = (h > 8 ? y + 1.4 : y + h / 2 - 0.25) * TILE;
      c.fillStyle = 'rgba(205,220,250,0.2)'; c.font = DFONT(34); c.fillText(r.name, cx, cy);
      c.fillStyle = 'rgba(205,220,250,0.3)'; c.font = FONT(600, 13); c.fillText(r.code, cx, cy + 28);
    }
  }
  // 墙体阴影
  c.fillStyle = 'rgba(0,0,0,0.38)';
  WALL_GROUPS.forEach(g => g.rects.forEach(r => { if (r.shape === 'round' || r.shape === 'rocket') return; const [x, y, w, h] = rectOf(r); c.fillRect(x * TILE + 5, y * TILE + 7, w * TILE, h * TILE); }));
  // 地图边界
  c.fillStyle = PALETTE.border;
  c.fillRect(0, 0, W, TILE); c.fillRect(0, H - TILE, W, TILE); c.fillRect(0, 0, TILE, H); c.fillRect(W - TILE, 0, TILE, H);
  c.strokeStyle = 'rgba(120,150,200,0.25)'; c.lineWidth = 2; c.strokeRect(TILE, TILE, W - TILE * 2, H - TILE * 2);
  // 4 组墙
  WALL_GROUPS.forEach(g => g.rects.forEach(r => {
    const [x, y, w, h] = rectOf(r);
    const px = x * TILE, py = y * TILE, pw = w * TILE, ph = h * TILE;
    if (r.shape === 'round') return drawCentrifuge(c, px + pw / 2, py + ph / 2, pw / 2, t);
    if (r.shape === 'rocket') return drawRocket(c, px + pw / 2, py + ph / 2, pw / 2);
    c.fillStyle = g.color; c.fillRect(px, py, pw, ph);
    c.fillStyle = 'rgba(255,255,255,0.09)'; c.fillRect(px, py, pw, 3);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(px, py + ph - 3, pw, 3);
    c.strokeStyle = 'rgba(170,200,255,0.16)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }));
}

/* 菜单「地图」页的示意图 */
function drawSchematic(canvas) {
  const c = canvas.getContext('2d');
  const s = canvas.width / (MW * TILE);
  c.setTransform(s, 0, 0, s, 0, 0);
  drawMapLayer(c, { labels: false, detail: true, t: 0 });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const r of REGIONS) {
    const [x, y, w, h] = r.rect;
    const cx = (x + w / 2) * TILE * s, cy = (y + Math.min(h / 2, 1.9)) * TILE * s;
    c.font = FONT(700, Math.max(11, canvas.width / 52)); c.fillStyle = 'rgba(231,238,248,0.92)';
    c.fillText(r.name, cx, cy - 7);
    c.font = FONT(500, Math.max(9, canvas.width / 72)); c.fillStyle = 'rgba(160,175,200,0.9)';
    c.fillText(r.code, cx, cy + 9);
  }
}

/* ---------- 小地图 ---------- */
let MINI = null;
const MS = 3.6;
function buildMinimap() {
  const c = document.createElement('canvas'), sc = 2;
  c.width = MW * MS * sc; c.height = MH * MS * sc;
  const x = c.getContext('2d');
  x.scale(MS * sc / TILE, MS * sc / TILE);
  drawMapLayer(x, { labels: false, detail: false });
  MINI = c;
}
function drawMinimap(x0, y0) {
  const w = MW * MS, h = MH * MS;
  ctx.save();
  notch(x0 - 4, y0 - 4, w + 8, h + 8, 8);
  ctx.fillStyle = 'rgba(6,10,17,0.85)'; ctx.fill();
  ctx.strokeStyle = 'rgba(80,110,160,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha = 0.92; ctx.drawImage(MINI, x0, y0, w, h); ctx.globalAlpha = 1;
  const k = MS / TILE, p = G.player;
  const S = G.spike;
  if (S && (S.state === 'planted' || S.state === 'dropped' || (S.state === 'carried' && S.carrier.team === p.team))) {
    const blink = S.state === 'planted' ? 0.5 + 0.5 * Math.sin(G.time * 10) : 1;
    ctx.fillStyle = PALETTE.spike; ctx.globalAlpha = blink;
    ctx.beginPath(); const sx = x0 + S.x * k, sy = y0 + S.y * k;
    ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 5, sy); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const a of G.agents) {
    if (!a.alive) continue;
    const ally = a.team === p.team;
    if (!ally && a.spotted[p.team] < G.time && !G.vis.has(a)) continue;
    ctx.fillStyle = ally ? PALETTE.ally : PALETTE.enemy;
    const ax = x0 + a.x * k, ay = y0 + a.y * k;
    ctx.beginPath(); ctx.arc(ax, ay, a.isPlayer ? 3.4 : 2.6, 0, TAU); ctx.fill();
    if (a.isPlayer) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(a.angle) * 9, ay + Math.sin(a.angle) * 9); ctx.stroke();
    }
  }
  const v = viewer();
  const reg = v ? regionAt(v.x, v.y) : null;
  if (reg) G.lastRegion = reg;
  if (G.lastRegion) {
    ctx.font = FONT(600, 12); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.muted; ctx.fillText('位置', x0, y0 + h + 10);
    ctx.fillStyle = PALETTE.fg; ctx.fillText(`${G.lastRegion.name} · ${G.lastRegion.code}`, x0 + 32, y0 + h + 10);
  }
  ctx.restore();
}

/* ---------- 世界里的东西 ---------- */
function computeVisible(v) {
  G.vis.clear();
  const p = G.player;
  for (const a of G.agents) {
    if (a.team === p.team) { G.vis.add(a); continue; }
    if (!v) { G.vis.add(a); continue; }
    if (dist(v, a) > 1600) continue;
    if (a.alive ? canSee(v, a) : wallLOS(v, a)) {
      G.vis.add(a);
      if (a.alive) a.spotted[p.team] = Math.max(a.spotted[p.team], G.time + 0.3);
    }
  }
}
function drawDrops() {
  for (const d of G.drops) {
    const w = WEAPONS[d.id], bob = Math.sin(G.time * 3 + d.x) * 1.5;
    ctx.save(); ctx.translate(d.x, d.y + bob);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = STAGES[w.stage].color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(-0.5); ctx.fillStyle = '#d6dde8'; ctx.fillRect(-w.len / 2, -2.5, w.len, 5); ctx.fillRect(-w.len / 2, 0, 5, 6);
    ctx.restore();
    ctx.font = FONT(600, 10); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(231,238,248,0.8)';
    ctx.fillText(w.name, d.x, d.y + 26);
  }
}
function drawSpikeWorld() {
  const S = G.spike;
  if (!S || S.state === 'carried' || S.state === 'exploded') return;
  ctx.save(); ctx.translate(S.x, S.y);
  if (S.state === 'planted') {
    const prog = G.phase === 'planted' ? G.timer / CFG.SPIKE_TIME : 0;
    const pulse = 0.5 + 0.5 * Math.sin(G.time * (6 + (1 - prog) * 18));
    ctx.fillStyle = `rgba(255,80,60,${0.12 + pulse * 0.25})`; ctx.beginPath(); ctx.arc(0, 0, 34 + pulse * 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = PALETTE.spike; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,201,60,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, CFG.DEFUSE_RANGE, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = '#2a2316'; ctx.strokeStyle = PALETTE.spike; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = S.state === 'planted' && Math.sin(G.time * 12) > 0 ? '#ff4a3a' : PALETTE.spike;
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawCorpses() {
  for (const a of G.agents) {
    if (a.alive || !G.vis.has(a)) continue;
    const ally = a.team === G.player.team;
    ctx.save(); ctx.translate(a.x, a.y); ctx.globalAlpha = 0.55;
    ctx.fillStyle = ally ? PALETTE.allyDark : PALETTE.enemyDark;
    ctx.beginPath(); ctx.ellipse(0, 0, R + 3, R - 3, a.angle, 0, TAU); ctx.fill();
    ctx.strokeStyle = ally ? PALETTE.ally : PALETTE.enemy; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
    ctx.restore();
  }
}
function drawAgent(a) {
  const ally = a.team === G.player.team;
  const body = ally ? PALETTE.ally : PALETTE.enemy, dark = ally ? PALETTE.allyDark : PALETTE.enemyDark;
  const d = WEAPONS[curW(a).id];
  ctx.save(); ctx.translate(a.x, a.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(2, 4, R + 1, 0, TAU); ctx.fill();
  ctx.rotate(a.angle);
  ctx.fillStyle = '#121822'; ctx.fillRect(R - 6, -3, d.len, 6);
  ctx.fillStyle = d.sniper ? '#55607a' : '#3a4458'; ctx.fillRect(R - 6, -1.5, d.len, 3);
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(R * 0.55, R * 0.62, 4, 0, TAU); ctx.arc(R * 0.55, -R * 0.62, 4, 0, TAU); ctx.fill();
  if (a.armor > 0) { ctx.strokeStyle = STAGES[a.armorStage].color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, R - 1.2, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, R * CFG.HEAD_RATIO + 0.5, 0, TAU); ctx.fill();
  if (a.helmet > 0) { ctx.strokeStyle = STAGES[a.helmetStage].color; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  if (a.isPlayer) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, R + 4, 0, TAU); ctx.stroke(); }
  if (a.action) {
    const prog = a.action === 'plant' ? a.plantProg / CFG.PLANT_TIME : a.defuseProg / CFG.DEFUSE_TIME;
    ctx.strokeStyle = a.action === 'plant' ? PALETTE.spike : PALETTE.ally; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(a.x, a.y, R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
  }
}
function drawAgentsWorld() {
  for (const a of G.agents) if (a.alive && G.vis.has(a)) drawAgent(a);
}
function drawOverheads() {
  const p = G.player;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const a of G.agents) {
    if (!a.alive || !G.vis.has(a) || a.isPlayer) continue;
    const ally = a.team === p.team, y = a.y - R - 12;
    ctx.font = FONT(600, 11); ctx.fillStyle = ally ? 'rgba(160,240,230,0.9)' : 'rgba(255,180,175,0.95)';
    let label = a.name;
    if (ally && G.spike.state === 'carried' && G.spike.carrier === a) label = '◆ ' + label;
    ctx.fillText(label, a.x, y - 4);
    const bw = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(a.x - bw / 2, y, bw, 4);
    ctx.fillStyle = a.hp > 50 ? (ally ? PALETTE.ally : PALETTE.enemy) : a.hp > 25 ? PALETTE.warn : '#ff3b3b';
    ctx.fillRect(a.x - bw / 2, y, bw * clamp(a.hp / 100, 0, 1), 4);
    if (a.armor > 0) { ctx.fillStyle = STAGES[a.armorStage].color; ctx.fillRect(a.x - bw / 2, y + 5, bw * a.armor / a.armorMax, 2); }
  }
}
function drawNadesWorld() {
  for (const n of G.nades) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(n.x + 2, n.y + 3, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = n.type === 'frag' ? '#5f7a3a' : '#9aa6b8';
    ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, TAU); ctx.fill();
    if (n.type === 'frag' && Math.sin(G.time * 20) > 0) { ctx.fillStyle = '#ff5040'; ctx.beginPath(); ctx.arc(n.x, n.y, 2, 0, TAU); ctx.fill(); }
  }
}
function drawTracers() {
  for (const t of G.tracers) {
    const k = 1 - t.t / t.life;
    ctx.strokeStyle = t.team === G.player.team ? `rgba(255,240,200,${0.75 * k})` : `rgba(255,190,170,${0.75 * k})`;
    ctx.lineWidth = t.w;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
}
function drawFx() {
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (f.type === 'flash') {
      ctx.fillStyle = `rgba(255,220,130,${1 - k})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, TAU); ctx.fill();
    } else if (f.type === 'spark') {
      ctx.fillStyle = `rgba(255,210,150,${0.8 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2 + k * 4, 0, TAU); ctx.fill();
    } else if (f.type === 'blood') {
      ctx.fillStyle = f.head ? `rgba(255,220,90,${0.9 * (1 - k)})` : `rgba(255,90,80,${0.8 * (1 - k)})`;
      for (let i = 0; i < 4; i++) {
        const a = f.a + (i - 1.5) * 0.35, r = 6 + k * 18 + i * 2;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 2.2, 0, TAU); ctx.fill();
      }
    } else if (f.type === 'boom') {
      const r = f.r * (0.3 + 0.7 * Math.min(1, k * 2.5));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,240,190,${0.9 * (1 - k)})`);
      g.addColorStop(0.4, `rgba(255,140,60,${0.6 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,220,160,${0.6 * (1 - k)})`; ctx.lineWidth = f.big ? 6 : 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * Math.min(1, k * 1.6), 0, TAU); ctx.stroke();
    }
  }
}
function drawSmokes() {
  for (const s of G.smokes) {
    const r = smokeRadius(s);
    const D = CFG.SMOKE.duration;
    const alpha = s.t > D - 1 ? Math.max(0, D - s.t) : 1;
    for (let i = 0; i < 8; i++) {
      const a = s.seed + i * 0.785, rr = r * (0.45 + 0.12 * Math.sin(s.seed + i * 1.7));
      const x = s.x + Math.cos(a + s.t * 0.05) * r * 0.42, y = s.y + Math.sin(a + s.t * 0.05) * r * 0.42;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 1.25);
      g.addColorStop(0, `rgba(176,188,205,${0.85 * alpha})`);
      g.addColorStop(1, 'rgba(150,162,180,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 1.25, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(160,172,190,${0.9 * alpha})`; ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.7, 0, TAU); ctx.fill();
  }
}
function drawScopeLine() {
  const p = G.player;
  if (!p.alive || !p.scoped) return;
  const d = WEAPONS[curW(p).id];
  const len = rayWall(p.x, p.y, Math.cos(p.angle), Math.sin(p.angle), d.range);
  ctx.strokeStyle = 'rgba(255,70,60,0.45)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * len, p.y + Math.sin(p.angle) * len); ctx.stroke();
}
function drawFloats() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const f of G.floats) {
    const k = f.t / f.life;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = FONT(700, f.head ? 17 : 14);
    ctx.fillStyle = f.head ? PALETTE.spike : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    const y = f.y - k * 26;
    ctx.strokeText(f.head ? `${f.text} 爆头` : f.text, f.x, y);
    ctx.fillText(f.head ? `${f.text} 爆头` : f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}

/* 视野遮罩：墙后面变暗（敌人只有在视线内才显示） */
function drawFog(v) {
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fogC.width, fogC.height);
  fctx.fillStyle = 'rgba(3,6,12,0.68)';
  fctx.fillRect(0, 0, fogC.width, fogC.height);
  if (v) {
    worldXf(fctx);
    fctx.globalCompositeOperation = 'destination-out';
    const N = 420, maxD = 1500;
    fctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      let d = rayWall(v.x, v.y, dx, dy, maxD);
      if (d < maxD) d += 16;
      const x = v.x + dx * d, y = v.y + dy * d;
      if (i) fctx.lineTo(x, y); else fctx.moveTo(x, y);
    }
    fctx.closePath();
    const g = fctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, maxD);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = g; fctx.fill();
    fctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fogC, 0, 0);
}

/* ---------- HUD ---------- */
function notch(x, y, w, h, n = 8) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w - n, y); ctx.lineTo(x + w, y + n);
  ctx.lineTo(x + w, y + h); ctx.lineTo(x + n, y + h); ctx.lineTo(x, y + h - n); ctx.closePath();
}
function panel(x, y, w, h, n = 10) {
  notch(x, y, w, h, n);
  ctx.fillStyle = 'rgba(8,13,22,0.82)'; ctx.fill();
  ctx.strokeStyle = 'rgba(70,98,145,0.55)'; ctx.lineWidth = 1; ctx.stroke();
}
function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}
function text(str, x, y, font, color, align = 'left', base = 'alphabetic') {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(str, x, y);
}

function drawTopBar() {
  const cx = CW / 2, y = 12, w = Math.min(380, CW - 32), h = 62;
  panel(cx - w / 2, y, w, h, 12);
  const off = w / 2 - 50;
  text(String(G.score[0]), cx - off, y + 38, FONT(700, 34), PALETTE.ally, 'center');
  text(String(G.score[1]), cx + off, y + 38, FONT(700, 34), PALETTE.enemy, 'center');
  text(`我方 · ${sideName(G.side[0])}`, cx - off, y + 54, FONT(600, 10), PALETTE.muted, 'center');
  text(`敌方 · ${sideName(G.side[1])}`, cx + off, y + 54, FONT(600, 10), PALETTE.muted, 'center');
  let label = '', col = PALETTE.fg;
  if (G.phase === 'buy') { label = `购买 ${fmtTime(G.timer)}`; col = PALETTE.ally; }
  else if (G.phase === 'live') { label = fmtTime(G.timer); col = G.timer < 10 ? PALETTE.warn : PALETTE.fg; }
  else if (G.phase === 'planted') { label = fmtTime(G.timer); col = Math.sin(G.time * 10) > 0 ? '#ff5a48' : PALETTE.spike; }
  else if (G.phase === 'end') label = '本局结束';
  else if (G.phase === 'half') label = '换边';
  else if (G.phase === 'over') label = '比赛结束';
  text(label, cx, y + 34, FONT(700, G.phase === 'buy' ? 22 : 28), col, 'center');
  const sub = G.phase === 'planted' ? '炸弹倒计时' : `第 ${G.round}/${CFG.MAX_ROUNDS} 局 · 先赢 ${CFG.WIN_TARGET} 局`;
  text(sub, cx, y + 54, FONT(600, 10), G.phase === 'planted' ? PALETTE.spike : PALETTE.muted, 'center');
  // 存活人数
  const py = y + h + 8;
  for (let t = 0; t < 2; t++) {
    const members = G.agents.filter(a => a.team === t);
    members.sort((a, b) => b.alive - a.alive);
    members.forEach((a, i) => {
      const x = t === 0 ? cx - 8 - (i + 1) * 9 : cx + 8 + i * 9;
      ctx.fillStyle = a.alive ? (t === 0 ? PALETTE.ally : PALETTE.enemy) : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, py, 6, 12);
    });
  }
  text(`${aliveCount(0)}`, cx - 8 - 13 * 9 - 4, py + 11, FONT(700, 12), PALETTE.ally, 'right');
  text(`${aliveCount(1)}`, cx + 8 + 12 * 9 + 6, py + 11, FONT(700, 12), PALETTE.enemy, 'left');
}

function drawFeed() {
  const x = CW - 16;
  let y = 16;
  for (const f of G.feed) {
    const age = G.time - f.t;
    if (age > 6) continue;
    ctx.globalAlpha = age > 5 ? 6 - age : 1;
    if (f.sys) {
      ctx.font = FONT(600, 12);
      const tw = ctx.measureText(f.sys).width + 20;
      panel(x - tw, y, tw, 24, 6);
      text(f.sys, x - 10, y + 16, FONT(600, 12), PALETTE.spike, 'right');
      y += 28; continue;
    }
    const kn = f.k || '', wn = f.w + (f.head ? ' · 爆头' : ''), vn = f.v;
    ctx.font = FONT(600, 12);
    const kw = ctx.measureText(kn).width, ww = ctx.measureText(wn).width, vw = ctx.measureText(vn).width;
    const tw = (kn ? kw + 12 : 0) + ww + vw + 32;
    panel(x - tw, y, tw, 24, 6);
    if (f.me) { notch(x - tw, y, tw, 24, 6); ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.stroke(); }
    let cxp = x - tw + 10;
    const col = t => (t === G.player.team ? PALETTE.ally : t === -1 ? PALETTE.spike : PALETTE.enemy);
    if (kn) { text(kn, cxp, y + 16, FONT(600, 12), col(f.kt)); cxp += kw + 12; }
    text(wn, cxp, y + 16, FONT(600, 12), f.head ? PALETTE.spike : PALETTE.muted); cxp += ww + 10;
    text(vn, cxp, y + 16, FONT(600, 12), col(f.vt));
    y += 28;
  }
  ctx.globalAlpha = 1;
}

function drawVitals() {
  const p = G.player, w = 280, h = 118, x = 16, y = CH - 16 - h;
  panel(x, y, w, h, 12);
  const hpCol = p.hp > 50 ? PALETTE.fg : p.hp > 25 ? PALETTE.warn : '#ff4b45';
  text(String(Math.max(0, Math.ceil(p.hp))), x + 16, y + 46, FONT(700, 40), hpCol);
  text('生命', x + 16, y + 62, FONT(600, 11), PALETTE.muted);
  const bx = x + 102, bw = w - 118;
  text('护甲', bx, y + 22, FONT(600, 11), PALETTE.muted);
  text(p.armorMax ? `${Math.ceil(p.armor)}/${p.armorMax}` : '无', bx + bw, y + 22, FONT(600, 11), p.armorMax ? STAGES[p.armorStage].color : PALETTE.muted, 'right');
  bar(bx, y + 27, bw, 5, p.armorMax ? p.armor / p.armorMax : 0, STAGES[p.armorStage].color);
  text('头盔', bx, y + 48, FONT(600, 11), PALETTE.muted);
  text(p.helmetMax ? `${Math.ceil(p.helmet)}/${p.helmetMax}` : '无', bx + bw, y + 48, FONT(600, 11), p.helmetMax ? STAGES[p.helmetStage].color : PALETTE.muted, 'right');
  bar(bx, y + 53, bw, 5, p.helmetMax ? p.helmet / p.helmetMax : 0, STAGES[p.helmetStage].color);
  ctx.fillStyle = 'rgba(80,110,160,0.35)'; ctx.fillRect(x + 12, y + 74, w - 24, 1);
  text('金钱', x + 16, y + 96, FONT(600, 11), PALETTE.muted);
  text(p.money.toLocaleString('zh-CN'), x + 48, y + 97, FONT(700, 17), PALETTE.spike);
  const st = stageOf(p.xp), next = STAGES[st + 1];
  text(STAGES[st].name, x + w - 16, y + 92, FONT(700, 12), STAGES[st].color, 'right');
  text(next ? `经验 ${p.xp} / ${next.xp}` : `经验 ${p.xp} · 全部解锁`, x + w - 16, y + 106, FONT(500, 10), PALETTE.muted, 'right');
  const frac = next ? (p.xp - STAGES[st].xp) / (next.xp - STAGES[st].xp) : 1;
  bar(x + 16, y + 106, 86, 3, frac, STAGES[st].color);
}

function drawWeaponPanel() {
  const p = G.player, w = curW(p), d = WEAPONS[w.id];
  const W = 300, H = 104, x = CW - 16 - W, y = CH - 16 - H;
  // 背包
  ctx.font = FONT(600, 11);
  let cx = CW - 16, cy = y - 30;
  for (let i = p.weapons.length - 1; i >= 0; i--) {
    const wd = WEAPONS[p.weapons[i].id];
    const label = `${i + 1}  ${wd.name}`;
    const tw = ctx.measureText(label).width + 18;
    if (cx - tw < CW - 16 - W - 80) { cx = CW - 16; cy -= 28; }
    notch(cx - tw, cy, tw, 22, 5);
    ctx.fillStyle = i === p.cur ? 'rgba(63,216,200,0.2)' : 'rgba(8,13,22,0.78)'; ctx.fill();
    ctx.strokeStyle = i === p.cur ? PALETTE.ally : 'rgba(70,98,145,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    text(label, cx - 9, cy + 15, FONT(600, 11), i === p.cur ? PALETTE.fg : PALETTE.muted, 'right');
    cx -= tw + 6;
  }
  panel(x, y, W, H, 12);
  text(d.name, x + 16, y + 30, FONT(700, 22), PALETTE.fg);
  ctx.font = FONT(700, 22);
  const nw = ctx.measureText(d.name).width;
  text(`${d.type} · ${AMMO[d.ammo].name}`, x + 24 + nw, y + 29, FONT(600, 11), STAGES[d.stage].color);
  text(String(w.mag), x + W - 70, y + 64, FONT(700, 38), w.mag === 0 ? '#ff4b45' : w.mag <= d.mag * 0.25 ? PALETTE.warn : PALETTE.fg, 'right');
  text(`/ ${w.reserve}`, x + W - 64, y + 64, FONT(600, 15), PALETTE.muted);
  let status = '', frac = 0;
  if (p.reloadT > 0) { status = '换弹中'; frac = 1 - p.reloadT / d.reload; }
  else if (p.switchT > 0) { status = '切枪'; frac = 1 - p.switchT / CFG.SWITCH_TIME; }
  else if (d.bolt && p.fireCD > 0) { status = '拉栓'; frac = 1 - p.fireCD / (60 / d.rpm + d.bolt); }
  else if (p.scoped) status = '开镜';
  if (status) { text(status, x + 16, y + 56, FONT(600, 12), PALETTE.warn); if (frac) bar(x + 16, y + 62, 110, 3, frac, PALETTE.warn); }
  text(`G 手雷 ×${p.nades.frag}`, x + 16, y + 90, FONT(600, 11), p.nades.frag ? PALETTE.fg : PALETTE.muted);
  text(`C 烟雾 ×${p.nades.smoke}`, x + 104, y + 90, FONT(600, 11), p.nades.smoke ? PALETTE.fg : PALETTE.muted);
  if (G.spike.state === 'carried' && G.spike.carrier === p) text('◆ 携带炸弹', x + W - 16, y + 90, FONT(700, 11), PALETTE.spike, 'right');
}

function drawCrosshair() {
  const p = G.player;
  let mx, my, gap;
  if (G.mode === '3d') {
    // 3D：准星固定在屏幕中心，张开程度 = 散布角换算到当前视野
    mx = CW / 2; my = CH / 2;
    gap = clamp(Math.tan(spreadOf(p) * Math.PI / 360) / Math.tan(T3.camera.fov * Math.PI / 360) * CH / 2, 3, 70);
  } else {
    mx = Input.mx; my = Input.my;
    const mw = screenToWorld(mx, my);
    gap = clamp(Math.tan(spreadOf(p) * Math.PI / 360) * Math.hypot(mw.x - p.x, mw.y - p.y) * CAM.s, 3, 70);
  }
  const len = 7;
  const lines = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? 'rgba(235,252,255,0.95)' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = pass ? 1.6 : 3.6;
    ctx.beginPath();
    for (const [lx, ly] of lines) { ctx.moveTo(mx + lx * gap, my + ly * gap); ctx.lineTo(mx + lx * (gap + len), my + ly * (gap + len)); }
    ctx.stroke();
  }
  if (G.mode !== '3d' && canHeadshot(p)) { ctx.fillStyle = PALETTE.spike; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3); }
  else { ctx.fillStyle = 'rgba(235,252,255,0.95)'; ctx.fillRect(mx - 1, my - 1, 2, 2); }
  const ht = G.time - G.hitT;
  if (ht < 0.18) {
    ctx.strokeStyle = G.hitHead ? PALETTE.spike : '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(mx + sx * 5, my + sy * 5); ctx.lineTo(mx + sx * 11, my + sy * 11); }
    ctx.stroke();
  }
}
function drawHurt() {
  const p = G.player, is3d = G.mode === '3d';
  const s = is3d ? { x: CW / 2, y: CH / 2 } : worldToScreen(p.x, p.y);
  for (const h of G.hurt) {
    // 3D 里以屏幕上方为正前方，所以要减去自己的朝向
    const k = (G.time - h.t), a = Math.atan2(h.y - p.y, h.x - p.x) - (is3d ? p.angle + Math.PI / 2 : 0);
    ctx.strokeStyle = `rgba(255,60,50,${0.8 * (1 - k)})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, is3d ? 110 : 60, a - 0.35, a + 0.35); ctx.stroke();
  }
  if (G.time - p.hurtT < 0.3) {
    const g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.3, CW / 2, CH / 2, Math.max(CW, CH) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(200,20,20,${0.28 * (1 - (G.time - p.hurtT) / 0.3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  }
}
function drawPrompt() {
  const p = G.player;
  let msg = null, prog = -1, col = PALETTE.spike;
  if (p.action === 'plant') { msg = '安放炸弹中 · 松开 E 会中断'; prog = p.plantProg / CFG.PLANT_TIME; }
  else if (p.action === 'defuse') { msg = '拆除炸弹中 · 松开 E 会中断'; prog = p.defuseProg / CFG.DEFUSE_TIME; col = PALETTE.ally; }
  else if (G.phase === 'live' && G.spike.carrier === p && inPlantZone(p)) msg = '按住 E 安放炸弹（5 秒，不能移动和射击）';
  else if (G.phase === 'planted' && G.side[p.team] === 'DEF' && dist(p, G.spike) <= CFG.DEFUSE_RANGE) { msg = '按住 E 拆除炸弹（5 秒）'; col = PALETTE.ally; }
  if (!msg) return;
  const y = CH * 0.62;
  ctx.font = FONT(600, 14);
  const w = Math.max(260, ctx.measureText(msg).width + 40);
  panel(CW / 2 - w / 2, y, w, prog >= 0 ? 48 : 34, 8);
  text(msg, CW / 2, y + 22, FONT(600, 14), col, 'center');
  if (prog >= 0) bar(CW / 2 - w / 2 + 16, y + 34, w - 32, 5, prog, col);
}
function drawBanner() {
  let b = G.banner;
  if (G.phase === 'end' && G.result) {
    const r = G.result;
    b = { text: r.win ? '本局胜利' : '本局失利', sub: `${sideName(r.side)}获胜 · ${r.reason}`, color: r.win ? PALETTE.ally : PALETTE.enemy, t: CFG.ROUND_END_TIME - G.timer, life: CFG.ROUND_END_TIME,
      foot: r.win ? `+${CFG.MONEY_WIN} 金钱 · +${CFG.XP_WIN} 经验` : `+${CFG.MONEY_LOSE} 金钱 · +${CFG.XP_LOSE} 经验` };
  }
  if (!b) return;
  const fadeIn = Math.min(1, b.t / 0.25), fadeOut = Math.min(1, (b.life - b.t) / 0.4);
  ctx.globalAlpha = clamp(Math.min(fadeIn, fadeOut), 0, 1);
  const y = CH * 0.28;
  const g = ctx.createLinearGradient(0, y - 50, 0, y + 50);
  g.addColorStop(0, 'rgba(5,8,13,0)'); g.addColorStop(0.5, 'rgba(5,8,13,0.7)'); g.addColorStop(1, 'rgba(5,8,13,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y - 60, CW, 130);
  text(b.text, CW / 2, y + 8, DFONT(Math.min(64, CW / 9)), b.color, 'center');
  if (b.sub) text(b.sub, CW / 2, y + 40, FONT(600, 15), PALETTE.fg, 'center');
  if (b.foot) text(b.foot, CW / 2, y + 62, FONT(600, 12), PALETTE.spike, 'center');
  ctx.globalAlpha = 1;
}
function drawDeath() {
  const di = G.deathInfo, v = viewer();
  const y = CH - 110;
  const w = Math.min(460, CW - 32);
  panel(CW / 2 - w / 2, y, w, 62, 10);
  if (di) text(`你被 ${di.by} 击杀 · ${di.w}${di.head ? ' · 爆头' : ''}`, CW / 2, y + 24, FONT(600, 14), PALETTE.enemy, 'center');
  text(v ? `观战：${v.name}（${Math.ceil(v.hp)} 血）· 空格 / 左键 切换队友` : '等待下一局', CW / 2, y + 46, FONT(600, 12), PALETTE.muted, 'center');
}
function drawNotice() {
  const n = G.notice;
  if (!n || G.time - n.t > 2.6) return;
  const age = G.time - n.t;
  ctx.globalAlpha = age > 2.1 ? (2.6 - age) / 0.5 : 1;
  ctx.font = FONT(600, 13);
  const w = ctx.measureText(n.text).width + 32, y = CH - 190;
  panel(CW / 2 - w / 2, y, w, 30, 7);
  text(n.text, CW / 2, y + 20, FONT(600, 13), PALETTE.fg, 'center');
  ctx.globalAlpha = 1;
}
function drawBuyHint() {
  if (shopOpen) return;
  const msg = `购买阶段 · 按 B 打开商店（${Math.ceil(G.timer)} 秒）`;
  ctx.font = FONT(600, 13);
  const w = ctx.measureText(msg).width + 32, y = 108;
  panel(CW / 2 - w / 2, y, w, 30, 7);
  text(msg, CW / 2, y + 20, FONT(600, 13), PALETTE.ally, 'center');
}
function drawScopeVignette() {
  const g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.35, CW / 2, CH / 2, Math.max(CW, CH) * 0.65);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
}

function drawHUD() {
  const p = G.player;
  if (p.alive && p.scoped) { if (G.mode === '3d') drawScope3d(); else drawScopeVignette(); }
  drawMinimap(20, 20);
  drawTopBar();
  drawFeed();
  if (p.alive) { drawHurt(); drawVitals(); drawWeaponPanel(); drawPrompt(); }
  else if (G.phase === 'live' || G.phase === 'planted') drawDeath();
  if (G.phase === 'buy') drawBuyHint();
  drawBanner();
  drawNotice();
  if (G.mode === '3d') drawLockHint();
  if (p.alive && !G.paused && !shopOpen && !(G.mode === '3d' && p.scoped)) drawCrosshair();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.mode === '3d' && T3) {
    // 3D：世界画在下面的 WebGL 画布上，这块画布只画 HUD
    render3d();
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (G.state !== 'game' || !G.player) return;
    computeVisible(viewer());
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawOverlays3d();
    drawHUD();
    return;
  }
  ctx.fillStyle = PALETTE.void; ctx.fillRect(0, 0, cv.width, cv.height);
  worldXf(ctx);
  const t = performance.now() / 1000;
  drawMapLayer(ctx, { labels: true, detail: true, t });
  if (G.state !== 'game' || !G.player) return;
  const v = viewer();
  computeVisible(v);
  drawDrops();
  drawSpikeWorld();
  drawCorpses();
  drawNadesWorld();
  drawAgentsWorld();
  drawTracers();
  drawFx();
  drawSmokes();
  drawScopeLine();
  drawFog(v);
  worldXf(ctx);
  drawOverheads();
  drawFloats();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawHUD();
}
