'use strict';
/* =========================================================
   航天基地爆破战 · 规则引擎
   回合流程 / 经济经验 / 射击与伤害 / 炸弹 / 投掷物
   ========================================================= */

/* ---------- 工具 ---------- */
const TILE = CFG.TILE, MW = CFG.MAP_W, MH = CFG.MAP_H, R = CFG.RADIUS;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapA = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const turnToward = (a, target, step) => a + clamp(wrapA(target - a), -step, step);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const tileOf = v => Math.floor(v / TILE);
const tc = t => t * TILE + TILE / 2;
const toW = t => ({ x: tc(t[0]), y: tc(t[1]) });
const inRect = (tx, ty, r) => tx >= r[0] && tx < r[0] + r[2] && ty >= r[1] && ty < r[1] + r[3];
const rectOf = r => (Array.isArray(r) ? r : r.rect);
const sideName = s => (s === 'ATT' ? '进攻方' : '防守方');
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/* ---------- 地图网格 ---------- */
const grid = new Uint8Array(MW * MH);       // 0 地面，1-4 墙组，9 边界
const nearWall = new Uint8Array(MW * MH);
const wallH = new Float32Array(MW * MH);    // 3D：每格墙的高度（像素）
function solidAt(tx, ty) { return tx < 0 || ty < 0 || tx >= MW || ty >= MH || grid[ty * MW + tx] !== 0; }
function solidPx(x, y) { return solidAt(tileOf(x), tileOf(y)); }
function buildGrid() {
  grid.fill(0);
  wallH.fill(VIEW3D.WALL_H / VIEW3D.S);
  for (let x = 0; x < MW; x++) { grid[x] = 9; grid[(MH - 1) * MW + x] = 9; }
  for (let y = 0; y < MH; y++) { grid[y * MW] = 9; grid[y * MW + MW - 1] = 9; }
  const heightOf = { crate: VIEW3D.CRATE_H, round: 3.8, rocket: 22 };
  WALL_GROUPS.forEach((g, gi) => g.rects.forEach(r => {
    const [x, y, w, h] = rectOf(r);
    const hh = (heightOf[r.shape] || VIEW3D.WALL_H) / VIEW3D.S;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { grid[j * MW + i] = gi + 1; wallH[j * MW + i] = hh; }
  }));
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    nearWall[y * MW + x] = solidAt(x + 1, y) || solidAt(x - 1, y) || solidAt(x, y + 1) || solidAt(x, y - 1) ? 1 : 0;
  }
}
function regionAt(x, y) {
  const tx = tileOf(x), ty = tileOf(y);
  for (const r of REGIONS) if (inRect(tx, ty, r.rect)) return r;
  return null;
}
const inPlantZone = a => inRect(tileOf(a.x), tileOf(a.y), PLANT_ZONE);

/* 射线打墙（DDA）：返回碰到墙的距离 */
function rayWall(x0, y0, dx, dy, maxD) {
  let tx = tileOf(x0), ty = tileOf(y0);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const ddy = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let mx = dx > 0 ? ((tx + 1) * TILE - x0) / dx : dx < 0 ? (tx * TILE - x0) / dx : Infinity;
  let my = dy > 0 ? ((ty + 1) * TILE - y0) / dy : dy < 0 ? (ty * TILE - y0) / dy : Infinity;
  for (let i = 0; i < 400; i++) {
    let t;
    if (mx < my) { t = mx; mx += ddx; tx += sx; } else { t = my; my += ddy; ty += sy; }
    if (t >= maxD) return maxD;
    if (solidAt(tx, ty)) return t;
  }
  return maxD;
}
function segCircleDist(x1, y1, x2, y2, cx, cy) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1) : 0;
  return Math.hypot(x1 + dx * t - cx, y1 + dy * t - cy);
}
function smokeRadius(s) {
  const D = CFG.SMOKE.duration;
  const grow = Math.min(1, s.t / 0.6);
  const fade = s.t > D - 1 ? Math.max(0, D - s.t) : 1;
  return CFG.SMOKE.radius * grow * (0.4 + 0.6 * fade);
}
function smokeBlocks(x1, y1, x2, y2) {
  for (const s of G.smokes) {
    const r = smokeRadius(s);
    if (r > 20 && segCircleDist(x1, y1, x2, y2, s.x, s.y) < r * 0.88) return true;
  }
  return false;
}
function wallLOS(a, b) {
  const d = dist(a, b);
  if (d < 1) return true;
  return rayWall(a.x, a.y, (b.x - a.x) / d, (b.y - a.y) / d, d) >= d - 0.5;
}
const canSee = (a, b) => wallLOS(a, b) && !smokeBlocks(a.x, a.y, b.x, b.y);

/* ---------- 碰撞 ---------- */
function resolveWalls(e, r) {
  for (let iter = 0; iter < 2; iter++) {
    const x0 = tileOf(e.x - r), x1 = tileOf(e.x + r), y0 = tileOf(e.y - r), y1 = tileOf(e.y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidAt(tx, ty)) continue;
      const rx = tx * TILE, ry = ty * TILE;
      const cx = clamp(e.x, rx, rx + TILE), cy = clamp(e.y, ry, ry + TILE);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2), push = r - d;
        e.x += (dx / d) * push; e.y += (dy / d) * push;
      } else {
        const l = e.x - rx, rr = rx + TILE - e.x, t = e.y - ry, b = ry + TILE - e.y, m = Math.min(l, rr, t, b);
        if (m === l) e.x = rx - r; else if (m === rr) e.x = rx + TILE + r; else if (m === t) e.y = ry - r; else e.y = ry + TILE + r;
      }
    }
  }
}
function moveAgent(a, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  for (let i = 0; i < steps; i++) {
    a.x += dx / steps; resolveWalls(a, R);
    a.y += dy / steps; resolveWalls(a, R);
  }
}

/* ---------- 寻路（A*） ---------- */
const NAV = { g: new Float32Array(MW * MH), came: new Int32Array(MW * MH), seen: new Uint32Array(MW * MH), closed: new Uint32Array(MW * MH), gen: 0 };
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
function nearestFree(tx, ty) {
  tx = clamp(tx, 0, MW - 1); ty = clamp(ty, 0, MH - 1);
  if (!solidAt(tx, ty)) return [tx, ty];
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !solidAt(tx + dx, ty + dy)) return [tx + dx, ty + dy];
  }
  return [tx, ty];
}
function findPath(sx, sy, gx, gy) {
  [sx, sy] = nearestFree(sx, sy); [gx, gy] = nearestFree(gx, gy);
  const gen = ++NAV.gen, start = sy * MW + sx, goal = gy * MW + gx;
  if (start === goal) return [[gx, gy]];
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
      }
    }
    return top;
  };
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  NAV.g[start] = 0; NAV.seen[start] = gen; NAV.came[start] = -1; push(h(sx, sy), start);
  while (heap.length) {
    const cur = pop()[1];
    if (NAV.closed[cur] === gen) continue;
    NAV.closed[cur] = gen;
    if (cur === goal) break;
    const cx = cur % MW, cy = (cur / MW) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (solidAt(nx, ny)) continue;
      if (dx && dy && (solidAt(cx + dx, cy) || solidAt(cx, cy + dy))) continue;
      const ni = ny * MW + nx;
      if (NAV.closed[ni] === gen) continue;
      const ng = NAV.g[cur] + c + (nearWall[ni] ? 0.35 : 0);
      if (NAV.seen[ni] !== gen || ng < NAV.g[ni]) { NAV.seen[ni] = gen; NAV.g[ni] = ng; NAV.came[ni] = cur; push(ng + h(nx, ny), ni); }
    }
  }
  if (NAV.closed[goal] !== gen) return [];
  const out = [];
  for (let i = goal; i !== start && i !== -1; i = NAV.came[i]) out.push([i % MW, (i / MW) | 0]);
  return out.reverse();
}
function clearThick(ax, ay, bx, by, r = R + 1) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  const dx = (bx - ax) / d, dy = (by - ay) / d, nx = -dy, ny = dx;
  for (const o of [-r, 0, r]) if (rayWall(ax + nx * o, ay + ny * o, dx, dy, d) < d - 0.5) return false;
  return true;
}
function smoothPath(sx, sy, pts) {
  const out = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && clearThick(ax, ay, pts[j + 1].x, pts[j + 1].y)) j++;
    out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
  }
  return out;
}

/* ---------- 经验存档 ---------- */
const XP_KEY = 'htjd_xp_v1';
function loadXP() { try { return Math.max(0, parseInt(localStorage.getItem(XP_KEY) || '0', 10) || 0); } catch (e) { return 0; } }
function saveXP(v) { try { localStorage.setItem(XP_KEY, String(Math.round(v))); } catch (e) { /* 存不了就只在本局有效 */ } }
function stageOf(xp) { let s = 0; STAGES.forEach((st, i) => { if (xp >= st.xp) s = i; }); return s; }
function gainXP(a, n) { a.xp += n; if (a.isPlayer) saveXP(a.xp); }
function addMoney(a, n) { a.money = Math.min(CFG.MONEY_CAP, a.money + n); }

/* ---------- 游戏状态 ---------- */
const G = {
  state: 'menu', phase: 'idle', paused: false, mode: '2d',
  time: 0, timer: 0, round: 0, score: [0, 0], side: ['ATT', 'DEF'],
  agents: [], player: null, spike: null,
  drops: [], nades: [], smokes: [], tracers: [], fx: [], floats: [], feed: [], hurt: [],
  banner: null, notice: null, result: null, deathInfo: null,
  diff: 'normal', diffCfg: DIFF.normal, spec: 0, beepT: 0,
  startXP: 0, hitT: -9, hitHead: false, vis: new Set(),
};
let nextId = 1;

function newWeapon(id) { const d = WEAPONS[id]; return { id, mag: d.mag, reserve: d.reserve }; }
function makeAgent(team, name, isPlayer) {
  return {
    id: nextId++, team, name, isPlayer,
    x: 0, y: 0, angle: 0, pitch: 0, speedNow: 0, walking: false, scoped: false, shotT: -9, markT: -9,
    hp: CFG.HP, alive: true, armor: 0, armorMax: 0, armorStage: 0, helmet: 0, helmetMax: 0, helmetStage: 0,
    weapons: [newWeapon('classic')], cur: 0, last: 0,
    reloadT: 0, fireCD: 0, switchT: 0, bloom: 0,
    nades: { frag: 0, smoke: 0 },
    money: CFG.START_MONEY, xp: 0, kills: 0, deaths: 0, roundKills: 0,
    action: null, plantProg: 0, defuseProg: 0, hurtT: -9, deathT: 0, spotted: [0, 0],
    ai: isPlayer ? null : makeAI(),
  };
}
const curW = a => a.weapons[a.cur] || a.weapons[0];
function moveSpeed(a) {
  let s = CFG.BASE_SPEED * WEAPONS[curW(a).id].move;
  if (a.walking) s *= CFG.WALK_MULT;
  if (a.scoped) s *= CFG.SCOPE_MOVE_MULT;
  return s;
}
/* 当前散布（度）：基础 + 跑动 + 连射扩散；狙击不开镜很不准 */
function spreadOf(a) {
  const d = WEAPONS[curW(a).id];
  let s = d.sniper ? (a.scoped ? d.scopeSpread : d.spread) : d.spread;
  const sf = a.speedNow / CFG.BASE_SPEED;
  if (sf > CFG.WALK_MULT + 0.05) s += d.moveSpread * sf;
  else if (sf > 0) s += d.moveSpread * sf * 0.3;
  return s + a.bloom;
}
/* 准星收拢时才能爆头：站着或静步、没有连射扩散（狙击要开镜） */
function canHeadshot(a) {
  const d = WEAPONS[curW(a).id];
  return spreadOf(a) <= (d.sniper ? d.scopeSpread : d.spread) * 1.5 + 0.6;
}
function notify(text) { G.notice = { text, t: G.time }; }
function teamOf(side) { return G.side[0] === side ? 0 : 1; }
function aliveCount(team) { let n = 0; for (const a of G.agents) if (a.alive && a.team === team) n++; return n; }

/* ---------- 比赛流程 ---------- */
function startMatch(opts) {
  G.state = 'game'; G.paused = false;
  G.diff = opts.diff; G.diffCfg = DIFF[opts.diff];
  G.side = [opts.side, opts.side === 'ATT' ? 'DEF' : 'ATT'];
  G.score = [0, 0]; G.round = 0; G.feed = []; G.time = 0; G.spec = 0;
  G.agents = []; nextId = 1;
  const names = shuffle(NAMES.slice());
  const px = loadXP();
  const p = makeAgent(0, '你', true);
  p.xp = px; G.player = p; G.startXP = px; G.agents.push(p);
  for (let i = 1; i < CFG.TEAM_SIZE; i++) G.agents.push(makeAgent(0, names.pop(), false));
  for (let i = 0; i < CFG.TEAM_SIZE; i++) G.agents.push(makeAgent(1, names.pop(), false));
  for (const b of G.agents) if (b.ai) b.xp = Math.max(0, Math.round(px * rand(0.8, 1.15) + rand(-250, 250)));
  for (let t = 0; t < 2; t++) shuffle(G.agents.filter(a => a.ai && a.team === t)).slice(0, 2).forEach(b => { b.ai.sniper = true; });
  startRound(true);
}

function startRound(resetAll) {
  G.round++;
  G.phase = 'buy'; G.timer = CFG.BUY_TIME;
  G.drops = []; G.nades = []; G.smokes = []; G.tracers = []; G.fx = []; G.floats = []; G.hurt = [];
  G.result = null; G.deathInfo = null; G.spec = 0;
  for (const a of G.agents) {
    if (resetAll || !a.alive) { a.weapons = [newWeapon('classic')]; a.cur = 0; a.last = 0; a.nades = { frag: 0, smoke: 0 }; }
    else for (const w of a.weapons) { w.mag = WEAPONS[w.id].mag; w.reserve = WEAPONS[w.id].reserve; }
    Object.assign(a, {
      alive: true, hp: CFG.HP, armor: 0, armorMax: 0, armorStage: 0, helmet: 0, helmetMax: 0, helmetStage: 0,
      reloadT: 0, fireCD: 0, switchT: 0, bloom: 0, action: null, plantProg: 0, defuseProg: 0,
      scoped: false, walking: false, speedNow: 0, hurtT: -9, spotted: [0, 0], roundKills: 0, pitch: 0, markT: -9,
    });
  }
  placeSpawns();
  for (const a of G.agents) if (a.ai) resetAI(a);
  assignHolds();
  const carrier = pick(G.agents.filter(a => G.side[a.team] === 'ATT'));
  G.spike = { state: 'carried', carrier, x: carrier.x, y: carrier.y, noPick: null, noPickT: 0, planter: null };
  for (const a of G.agents) if (a.ai) botBuy(a);
  G.banner = {
    text: `第 ${G.round} 局`,
    sub: G.side[0] === 'ATT' ? '进攻方 · 把炸弹送进 H4 黑室（A 包点）' : '防守方 · 守住 H4 黑室（A 包点）',
    color: PALETTE.fg, t: 0, life: 3,
  };
  if (carrier.isPlayer) notify('炸弹在你身上 · 去 A 包点按住 E 安放');
  openShop(true);
}

function placeSpawns() {
  for (const side of ['ATT', 'DEF']) {
    const team = teamOf(side);
    const [x, y, w, h] = SPAWNS[side];
    const tiles = [];
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!solidAt(i, j)) tiles.push([i, j]);
    shuffle(tiles);
    G.agents.filter(a => a.team === team).forEach((a, k) => {
      const [i, j] = tiles[k % tiles.length];
      a.x = tc(i) + rand(-6, 6); a.y = tc(j) + rand(-6, 6);
      a.angle = side === 'ATT' ? 0 : Math.PI;
    });
  }
}
function clampToSpawn(a) {
  const [x, y, w, h] = SPAWNS[G.side[a.team]];
  a.x = clamp(a.x, x * TILE + R, (x + w) * TILE - R);
  a.y = clamp(a.y, y * TILE + R, (y + h) * TILE - R);
}

function beginLive() {
  G.phase = 'live'; G.timer = CFG.ROUND_TIME;
  closeShop();
  G.banner = { text: '战斗开始', sub: `${CFG.ROUND_TIME} 秒内决出本局`, color: PALETTE.fg, t: 0, life: 1.6 };
  SFX.tone(0.12, 660, 0.12); SFX.tone(0.12, 990, 0.16, 'square', 0.12);
}

function checkRound() {
  const att = teamOf('ATT'), def = teamOf('DEF');
  const attAlive = aliveCount(att), defAlive = aliveCount(def);
  if (G.phase === 'live') {
    if (defAlive === 0) return endRound('ATT', '全歼防守方');
    if (attAlive === 0) return endRound('DEF', '全歼进攻方');
    if (G.timer <= 0) return endRound('DEF', '时间耗尽，炸弹没有安放');
  } else if (G.phase === 'planted') {
    if (defAlive === 0) return endRound('ATT', '炸弹已安放，防守方全灭');
    if (G.timer <= 0) { explodeSpike(); return endRound('ATT', '炸弹引爆'); }
  }
}

function endRound(winSide, reason) {
  G.phase = 'end'; G.timer = CFG.ROUND_END_TIME;
  const wt = teamOf(winSide);
  G.score[wt]++;
  for (const a of G.agents) {
    a.action = null; a.plantProg = 0; a.defuseProg = 0;
    if (a.team === wt) { addMoney(a, CFG.MONEY_WIN); gainXP(a, CFG.XP_WIN); }
    else { addMoney(a, CFG.MONEY_LOSE); gainXP(a, CFG.XP_LOSE); }
  }
  G.result = { win: wt === 0, side: winSide, reason };
  closeShop();
  if (wt === 0) { SFX.tone(0.14, 523, 0.14); SFX.tone(0.14, 784, 0.22, 'triangle', 0.14); }
  else { SFX.tone(0.14, 392, 0.18); SFX.tone(0.14, 262, 0.3, 'triangle', 0.16); }
}

function afterRound() {
  if (G.score[0] >= CFG.WIN_TARGET || G.score[1] >= CFG.WIN_TARGET || G.round >= CFG.MAX_ROUNDS) return matchOver();
  if (G.round === CFG.HALFTIME_AFTER) {
    G.phase = 'half'; G.timer = CFG.HALFTIME_TIME;
    G.side = [G.side[1], G.side[0]];
    for (const a of G.agents) a.money = CFG.START_MONEY;
    G.banner = { text: '半场换边', sub: `你现在是${sideName(G.side[0])} · 金钱重置为 ${CFG.START_MONEY} · 武器清空`, color: PALETTE.spike, t: 0, life: CFG.HALFTIME_TIME };
    return;
  }
  startRound(false);
}

function matchOver() {
  G.phase = 'over';
  saveXP(G.player.xp);
  showOver(G.score[0] > G.score[1]);
}

/* ---------- 商店：经验达标后按套装购买（枪 + 头盔 + 护甲），投掷物单买 ---------- */
function itemDef(kind, id) {
  if (kind === 'kit') return KITS.find(k => k.id === id);
  if (kind === 'frag') return { name: '手雷', price: CFG.FRAG.price, stage: 0 };
  if (kind === 'smoke') return { name: '烟雾弹', price: CFG.SMOKE.price, stage: 0 };
  return null;
}
function buyCheck(a, kind, id) {
  const it = itemDef(kind, id);
  if (!it) return { ok: false, why: '没有这件装备' };
  if (stageOf(a.xp) < it.stage) return { ok: false, why: `需要 ${STAGES[it.stage].xp} 经验`, locked: true };
  if (kind === 'kit' && it.weapons.every(w => a.weapons.some(x => x.id === w))
    && a.armorMax >= kitArmor(it).value && a.helmetMax >= kitHelmet(it).value) return { ok: false, why: '已装备', owned: true };
  if ((kind === 'frag' || kind === 'smoke') && a.nades[kind] >= CFG[kind === 'frag' ? 'FRAG' : 'SMOKE'].max) return { ok: false, why: '已带满', owned: true };
  if (G.phase !== 'buy') return { ok: false, why: '只能在购买阶段买' };
  if (a.money < it.price) return { ok: false, why: '金钱不足' };
  return { ok: true };
}
function buy(a, kind, id) {
  if (!buyCheck(a, kind, id).ok) return false;
  const it = itemDef(kind, id);
  a.money -= it.price;
  if (kind === 'kit') {
    // 套装里的枪：没有就放进背包，已经有了就补满弹药；头盔护甲只会往高级换
    for (const wid of it.weapons) {
      const own = a.weapons.find(w => w.id === wid);
      if (own) { own.mag = WEAPONS[wid].mag; own.reserve = WEAPONS[wid].reserve; }
      else a.weapons.push(newWeapon(wid));
    }
    switchWeapon(a, a.weapons.findIndex(w => w.id === it.main), true);
    if (kitArmor(it).value > a.armorMax) { a.armor = a.armorMax = kitArmor(it).value; a.armorStage = it.stage; }
    if (kitHelmet(it).value > a.helmetMax) { a.helmet = a.helmetMax = kitHelmet(it).value; a.helmetStage = it.stage; }
  } else a.nades[kind]++;
  return true;
}

/* ---------- 武器 ---------- */
function switchWeapon(a, idx, instant) {
  if (idx < 0 || idx >= a.weapons.length || idx === a.cur) return;
  a.last = a.cur; a.cur = idx; a.reloadT = 0; a.bloom = 0; a.scoped = false;
  a.switchT = instant ? 0 : CFG.SWITCH_TIME;
}
function startReload(a) {
  const w = curW(a), d = WEAPONS[w.id];
  if (a.reloadT > 0 || a.switchT > 0 || w.mag >= d.mag || w.reserve <= 0) return;
  a.reloadT = d.reload; a.scoped = false;
  if (a.isPlayer) SFX.reload();
}
function finishReload(a) {
  const w = curW(a), d = WEAPONS[w.id];
  const take = Math.min(d.mag - w.mag, w.reserve);
  w.mag += take; w.reserve -= take; a.reloadT = 0;
}
function tickAgent(a, dt) {
  a.fireCD = Math.max(0, a.fireCD - dt);
  a.switchT = Math.max(0, a.switchT - dt);
  if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) finishReload(a); }
  a.bloom = Math.max(0, a.bloom - (WEAPONS[curW(a).id].recover || 9) * dt);
}

/* 开枪：射速冷却 → 扣子弹 → 按散布偏转 → 射线判定（墙挡子弹） */
function fire(a) {
  const w = curW(a), d = WEAPONS[w.id];
  if (a.fireCD > 0 || a.switchT > 0 || a.reloadT > 0 || a.action) return false;
  if (w.mag <= 0) { if (w.reserve > 0) startReload(a); else if (a.isPlayer) SFX.dry(); return false; }
  w.mag--;
  a.fireCD = 60 / d.rpm + (d.bolt || 0);
  a.shotT = G.time;
  const sp = spreadOf(a) * Math.PI / 180;
  let res;
  if (G.mode === '3d') {
    // 3D：子弹落在一个散布圆锥里，打头还是打身体由瞄的位置决定
    res = hitscan3(a, a.angle + gauss() * sp * 0.5, a.pitch + gauss() * sp * 0.5, d.range);
  } else {
    const precise = canHeadshot(a);
    res = hitscan(a, a.angle + gauss() * sp * 0.5, d.range);
    if (!precise) res.head = false;
  }
  a.bloom = Math.min(d.bloomMax, a.bloom + d.bloom);
  const gunH = VIEW3D.GUN_H / VIEW3D.S;
  const mx = a.x + Math.cos(a.angle) * (R + d.len - 4), my = a.y + Math.sin(a.angle) * (R + d.len - 4);
  G.tracers.push({ x1: mx, y1: my, h1: gunH, x2: res.x, y2: res.y, h2: res.h ?? gunH, t: 0, life: d.sniper ? 0.32 : 0.08, w: d.sniper ? 2.4 : 1.3, team: a.team, own: a.isPlayer });
  G.fx.push({ type: 'flash', x: mx, y: my, h: gunH, a: a.angle, t: 0, life: 0.05, own: a.isPlayer });
  if (!res.hit) G.fx.push({ type: 'spark', x: res.x, y: res.y, h: res.h ?? gunH, t: 0, life: 0.18 });
  SFX.shot(a, d);
  alertHearing(a);
  if (res.hit) applyHit(a, res.hit, res.head, w.id, res);
  if (w.mag === 0 && w.reserve > 0) startReload(a);
  return true;
}
function hitscan(a, ang, range) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const ox = a.x + dx * (R * 0.5), oy = a.y + dy * (R * 0.5);
  const wallD = rayWall(ox, oy, dx, dy, range);
  let best = null, bestT = wallD, bestPerp = 0;
  for (const b of G.agents) {
    if (!b.alive || b.team === a.team) continue;
    const px = b.x - ox, py = b.y - oy, t = px * dx + py * dy;
    if (t < 0) continue;
    const perp = Math.abs(px * dy - py * dx);
    if (perp > R) continue;
    const entry = t - Math.sqrt(R * R - perp * perp);
    if (entry < bestT) { best = b; bestT = Math.max(0, entry); bestPerp = perp; }
  }
  return { hit: best, head: !!best && bestPerp < R * CFG.HEAD_RATIO, x: ox + dx * bestT, y: oy + dy * bestT };
}

/* 3D 命中：头是球，身体是圆柱；墙按各自高度挡子弹（掩体矮，墙高），地面也会挡 */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - r * r, disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  return -b - sq >= 0 ? -b - sq : -b + sq >= 0 ? 0 : -1;
}
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, r, top) {
  const ax = ox - cx, ay = oy - cy, A = dx * dx + dy * dy;
  if (A < 1e-9) return -1;
  const B = 2 * (ax * dx + ay * dy), C = ax * ax + ay * ay - r * r, disc = B * B - 4 * A * C;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let lo = -Infinity, hi = Infinity;
  if (Math.abs(dz) < 1e-9) { if (oz < 0 || oz > top) return -1; }
  else { const t0 = -oz / dz, t1 = (top - oz) / dz; lo = Math.min(t0, t1); hi = Math.max(t0, t1); }
  const enter = Math.max((-B - sq) / (2 * A), lo, 0), exit = Math.min((-B + sq) / (2 * A), hi);
  return enter <= exit ? enter : -1;
}
function hitscan3(a, yaw, pitch, range) {
  const S = VIEW3D.S, cp = Math.cos(pitch);
  const hx = Math.cos(yaw), hy = Math.sin(yaw);
  const dx = hx * cp, dy = hy * cp, dz = Math.sin(pitch);
  const ox = a.x, oy = a.y, oz = VIEW3D.EYE / S;
  let tEnd = range;
  // 墙：沿水平投影逐格走，进入实心格时看子弹高度是否低于墙顶
  let tx = tileOf(ox), ty = tileOf(oy);
  const sx = hx > 0 ? 1 : -1, sy = hy > 0 ? 1 : -1;
  const ddx = hx !== 0 ? Math.abs(TILE / hx) : Infinity, ddy = hy !== 0 ? Math.abs(TILE / hy) : Infinity;
  let mx = hx > 0 ? ((tx + 1) * TILE - ox) / hx : hx < 0 ? (tx * TILE - ox) / hx : Infinity;
  let my = hy > 0 ? ((ty + 1) * TILE - oy) / hy : hy < 0 ? (ty * TILE - oy) / hy : Infinity;
  for (let i = 0; i < 400; i++) {
    let hd;
    if (mx < my) { hd = mx; mx += ddx; tx += sx; } else { hd = my; my += ddy; ty += sy; }
    const t = hd / cp;
    if (t >= tEnd) break;
    if (!solidAt(tx, ty)) continue;
    const top = tx < 0 || ty < 0 || tx >= MW || ty >= MH ? Infinity : wallH[ty * MW + tx];
    const z = oz + dz * t;
    if (z <= top) { tEnd = t; break; }
    if (dz < 0) {
      const tTop = (top - oz) / dz, tExit = Math.min(mx, my) / cp;
      if (tTop < tExit && tTop < tEnd) { tEnd = tTop; break; }
    }
  }
  if (dz < 0) tEnd = Math.min(tEnd, -oz / dz);
  // 人：先粗筛水平距离，再分别算头和身体
  const br = VIEW3D.BODY_R / S, bt = VIEW3D.BODY_TOP / S, hc = VIEW3D.HEAD_Y / S, hr = VIEW3D.HEAD_R / S;
  let best = null, bestT = tEnd, head = false;
  for (const b of G.agents) {
    if (!b.alive || b.team === a.team) continue;
    const px = b.x - ox, py = b.y - oy;
    if (px * hx + py * hy < -br || Math.abs(px * hy - py * hx) > br) continue;
    const th = raySphere(ox, oy, oz, dx, dy, dz, b.x, b.y, hc, hr);
    if (th >= 0 && th < bestT) { best = b; bestT = th; head = true; }
    const tb = rayCylinder(ox, oy, oz, dx, dy, dz, b.x, b.y, br, bt);
    if (tb >= 0 && tb < bestT) { best = b; bestT = tb; head = false; }
  }
  return { hit: best, head, x: ox + dx * bestT, y: oy + dy * bestT, h: oz + dz * bestT };
}

/* 伤害：爆头打头盔，其他打护甲；子弹等级决定对护甲的破甲倍率；护甲打光后剩余伤害扣血 */
function applyDamage(v, raw, head, mult) {
  const pool = head ? 'helmet' : 'armor';
  let hpLoss = raw;
  if (v[pool] > 0) {
    const ad = raw * mult;
    if (ad <= v[pool]) { v[pool] -= ad; hpLoss = 0; }
    else { hpLoss = (ad - v[pool]) / mult; v[pool] = 0; }
  }
  v.hp -= hpLoss;
  return hpLoss;
}
function applyHit(a, v, head, wid, pt) {
  const d = WEAPONS[wid];
  let shown;
  if (d.oneShot) { shown = Math.round(v.hp + v.armor + v.helmet); v.hp = 0; }
  else { shown = d.dmg * (head ? CFG.HEADSHOT_MULT : 1); applyDamage(v, shown, head, AMMO[d.ammo].armorMult); }
  onHurt(v, a);
  const hitH = pt && pt.h != null ? pt.h : (head ? VIEW3D.HEAD_Y : 1.1) / VIEW3D.S;
  G.fx.push({ type: 'blood', x: pt ? pt.x : v.x, y: pt ? pt.y : v.y, h: hitH, a: Math.atan2(v.y - a.y, v.x - a.x), t: 0, life: 0.3, head });
  if (a.isPlayer) {
    G.hitT = G.time; G.hitHead = head; v.markT = G.time;
    G.floats.push({ x: v.x + rand(-8, 8), y: v.y - R - 8, wx: v.x, wy: v.y, h: hitH + 8, text: String(Math.round(shown)), head, t: 0, life: 0.85 });
    SFX.hit(head);
  }
  if (v.hp <= 0) kill(v, a, wid, head);
}
function onHurt(v, a) {
  v.hurtT = G.time;
  if (v.isPlayer && a) G.hurt.push({ x: a.x, y: a.y, t: G.time });
  if (v.ai && a && !(v.ai.target && v.ai.target.alive)) {
    v.ai.lookAt = { x: a.x, y: a.y }; v.ai.lookAtT = G.time + 1.6; v.ai.percT = 0;
  }
}
function weaponLabel(wid) { return WEAPONS[wid] ? WEAPONS[wid].name : wid === 'frag' ? '手雷' : '炸弹'; }

/* 阵亡：掉落背包里的武器，炸弹掉在原地，击杀者 +金钱 +经验 */
function kill(v, k, wid, head) {
  if (!v.alive) return;
  v.alive = false; v.hp = 0; v.deaths++; v.deathT = G.time; v.action = null; v.scoped = false;
  const base = Math.random() * TAU;
  v.weapons.forEach((w, i) => {
    if (w.id === 'classic') return;
    const ang = base + i * 1.4;
    G.drops.push({ id: w.id, mag: w.mag, reserve: w.reserve, x: v.x + Math.cos(ang) * 16, y: v.y + Math.sin(ang) * 16, t: G.time });
  });
  v.weapons = [newWeapon('classic')]; v.cur = 0; v.last = 0; v.nades = { frag: 0, smoke: 0 };
  if (G.spike && G.spike.state === 'carried' && G.spike.carrier === v) dropSpike(v);
  if (k && k !== v) {
    k.kills++; k.roundKills++;
    if (G.phase === 'live' || G.phase === 'planted') { addMoney(k, CFG.MONEY_KILL); gainXP(k, CFG.XP_KILL); }
  }
  G.feed.push({ k: k ? k.name : null, kt: k ? k.team : -1, v: v.name, vt: v.team, w: weaponLabel(wid), head, t: G.time, me: !!((k && k.isPlayer) || v.isPlayer) });
  if (G.feed.length > 8) G.feed.shift();
  if (v.isPlayer) G.deathInfo = { by: k ? k.name : '炸弹', w: weaponLabel(wid), head, t: G.time };
  if (k && k.isPlayer) SFX.killConfirm(head);
}
function alertHearing(a) {
  for (const b of G.agents) {
    if (!b.ai || !b.alive || b.team === a.team) continue;
    if (b.ai.target && b.ai.target.alive) continue;
    if (Math.abs(b.x - a.x) > 800 || Math.abs(b.y - a.y) > 800) continue;
    if (Math.random() < 0.5) { b.ai.lookAt = { x: a.x, y: a.y }; b.ai.lookAtT = G.time + 1.4; }
  }
}

/* ---------- 投掷物 ---------- */
function throwNade(a, type, tx, ty) {
  if (!a.alive || a.nades[type] <= 0 || a.action) return false;
  if (G.phase !== 'live' && G.phase !== 'planted') return false;
  a.nades[type]--;
  const ang = Math.atan2(ty - a.y, tx - a.x);
  const d = clamp(Math.hypot(tx - a.x, ty - a.y), 60, 520);
  const v = d * 2.4;
  G.nades.push({
    type, team: a.team, owner: a, t: 0,
    x: a.x + Math.cos(ang) * (R + 4), y: a.y + Math.sin(ang) * (R + 4),
    vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
    fuse: type === 'frag' ? CFG.FRAG.fuse : CFG.SMOKE.fuse,
  });
  SFX.tone(0.08, 500, 0.06, 'triangle');
  return true;
}
function updateNades(dt) {
  for (let i = G.nades.length - 1; i >= 0; i--) {
    const n = G.nades[i];
    n.t += dt;
    const f = Math.exp(-2.4 * dt); n.vx *= f; n.vy *= f;
    const nx = n.x + n.vx * dt; if (solidPx(nx, n.y)) n.vx *= -0.5; else n.x = nx;
    const ny = n.y + n.vy * dt; if (solidPx(n.x, ny)) n.vy *= -0.5; else n.y = ny;
    if (n.t >= n.fuse) {
      G.nades.splice(i, 1);
      if (n.type === 'frag') explodeFrag(n);
      else { G.smokes.push({ x: n.x, y: n.y, t: 0, seed: Math.random() * 100 }); SFX.burst(SFX.vol(n.x, n.y) * 0.5, 500, 0.8, 0.4); }
    }
  }
}
function updateSmokes(dt) {
  for (let i = G.smokes.length - 1; i >= 0; i--) { G.smokes[i].t += dt; if (G.smokes[i].t > CFG.SMOKE.duration) G.smokes.splice(i, 1); }
}
function explodeFrag(n) {
  const F = CFG.FRAG;
  G.fx.push({ type: 'boom', x: n.x, y: n.y, h: 10, r: F.radius, t: 0, life: 0.6 });
  SFX.boom(n.x, n.y);
  for (const v of G.agents) {
    if (!v.alive || v.team === n.team) continue;
    const d = dist(v, n);
    if (d > F.radius || !wallLOS(n, v)) continue;
    const raw = F.damage * (1 - d / F.radius);
    applyDamage(v, raw, false, 1);
    onHurt(v, n.owner);
    if (n.owner.isPlayer) {
      G.hitT = G.time; G.hitHead = false; v.markT = G.time;
      G.floats.push({ x: v.x, y: v.y - R - 8, wx: v.x, wy: v.y, h: 1.9 / VIEW3D.S, text: String(Math.round(raw)), head: false, t: 0, life: 0.85 });
    }
    if (v.hp <= 0) kill(v, n.owner, 'frag', false);
  }
}

/* ---------- 炸弹 ---------- */
function dropSpike(a) {
  const S = G.spike;
  S.state = 'dropped'; S.carrier = null; S.x = a.x; S.y = a.y; S.noPick = a; S.noPickT = G.time + 1.5;
}
function updateSpike() {
  const S = G.spike;
  if (!S) return;
  if (S.state === 'carried') {
    if (S.carrier.alive) { S.x = S.carrier.x; S.y = S.carrier.y; } else dropSpike(S.carrier);
  } else if (S.state === 'dropped') {
    for (const a of G.agents) {
      if (!a.alive || G.side[a.team] !== 'ATT') continue;
      if (a === S.noPick && G.time < S.noPickT) continue;
      if (dist(a, S) < 26) {
        S.state = 'carried'; S.carrier = a;
        if (a.isPlayer) notify('捡到炸弹 · 去 A 包点按住 E 安放');
        break;
      }
    }
  }
}
function plantSpike(a) {
  const S = G.spike;
  S.state = 'planted'; S.carrier = null; S.x = a.x; S.y = a.y; S.planter = a;
  a.action = null; a.plantProg = 0;
  G.phase = 'planted'; G.timer = CFG.SPIKE_TIME; G.beepT = 0;
  addMoney(a, CFG.MONEY_OBJECTIVE); gainXP(a, CFG.XP_OBJECTIVE);
  G.banner = { text: '炸弹已安放', sub: `${CFG.SPIKE_TIME} 秒后引爆 · 防守方必须拆除`, color: PALETTE.spike, t: 0, life: 2.6 };
  G.feed.push({ sys: `${a.name} 安放了炸弹`, t: G.time });
  SFX.tone(0.16, 880, 0.1); SFX.tone(0.16, 880, 0.1, 'square', 0.15);
}
function defuseSpike(a) {
  const S = G.spike;
  S.state = 'defused';
  a.action = null; a.defuseProg = 0;
  addMoney(a, CFG.MONEY_OBJECTIVE); gainXP(a, CFG.XP_OBJECTIVE);
  G.feed.push({ sys: `${a.name} 拆除了炸弹`, t: G.time });
  endRound('DEF', '炸弹已拆除');
}
function explodeSpike() {
  const S = G.spike;
  S.state = 'exploded';
  G.fx.push({ type: 'boom', x: S.x, y: S.y, h: 10, r: CFG.SPIKE_BLAST, t: 0, life: 1.4, big: true });
  SFX.boom(S.x, S.y, true);
  for (const a of G.agents) if (a.alive && dist(a, S) < CFG.SPIKE_BLAST) kill(a, null, 'spike', false);
}

/* ---------- 地上的武器 ---------- */
function updateDrops() {
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i];
    for (const a of G.agents) {
      if (!a.alive || Math.abs(a.x - d.x) > 26 || Math.abs(a.y - d.y) > 26 || dist(a, d) > 26) continue;
      const own = a.weapons.find(w => w.id === d.id);
      if (own) {
        const cap = WEAPONS[d.id].reserve + WEAPONS[d.id].mag;
        if (own.reserve >= cap) continue;
        own.reserve = Math.min(cap, own.reserve + d.mag + d.reserve);
        if (a.isPlayer) notify(`补充 ${WEAPONS[d.id].name} 弹药`);
      } else {
        a.weapons.push({ id: d.id, mag: d.mag, reserve: d.reserve });
        if (a.isPlayer) notify(`缴获 ${WEAPONS[d.id].name} · 按 ${a.weapons.length} 切换`);
      }
      G.drops.splice(i, 1);
      break;
    }
  }
}

/* 人与人之间轻微推开，避免叠在一起 */
function separate() {
  const A = G.agents, m = R * 2 - 3;
  for (let i = 0; i < A.length; i++) {
    const a = A[i]; if (!a.alive) continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j]; if (!b.alive) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= m * m) continue;
      if (d2 < 1e-4) { dx = rand(-1, 1); dy = rand(-1, 1); }
      const d = Math.hypot(dx, dy) || 1, push = (m - d) / 2, ux = dx / d, uy = dy / d;
      if (!a.action) { a.x -= ux * push; a.y -= uy * push; resolveWalls(a, R); }
      if (!b.action) { b.x += ux * push; b.y += uy * push; resolveWalls(b, R); }
    }
  }
}

function updateEffects(dt) {
  for (const arr of [G.tracers, G.fx, G.floats]) {
    for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t > arr[i].life) arr.splice(i, 1); }
  }
  G.hurt = G.hurt.filter(h => G.time - h.t < 1);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
}

/* 观战：玩家阵亡后跟随存活队友 */
function viewer() {
  const p = G.player;
  if (!p) return null;
  if (p.alive) return p;
  const mates = G.agents.filter(a => a.alive && a.team === p.team);
  if (!mates.length) return null;
  return mates[((G.spec % mates.length) + mates.length) % mates.length];
}

/* ---------- 主更新 ---------- */
function update(dt) {
  G.time += dt;
  if (G.phase !== 'over') G.timer -= dt;
  switch (G.phase) {
    case 'buy': if (G.timer <= 0) beginLive(); break;
    case 'end': if (G.timer <= 0) afterRound(); break;
    case 'half': if (G.timer <= 0) startRound(true); break;
    case 'planted':
      G.beepT -= dt;
      if (G.beepT <= 0) { G.beepT = clamp(G.timer / CFG.SPIKE_TIME, 0.12, 1) * 0.9; SFX.beep(G.spike.x, G.spike.y); }
      break;
  }
  if (G.phase === 'over' || G.phase === 'half') { updateEffects(dt); return; }
  updatePlayer(dt);
  for (const a of G.agents) if (a.ai && a.alive) botUpdate(a, dt);
  for (const a of G.agents) if (a.alive) tickAgent(a, dt);
  separate();
  updateSpike();
  updateDrops();
  updateNades(dt);
  updateSmokes(dt);
  updateEffects(dt);
  if (G.phase === 'live' || G.phase === 'planted') checkRound();
}

buildGrid();
