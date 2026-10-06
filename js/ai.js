'use strict';
/* =========================================================
   航天基地爆破战 · 机器人 AI
   进攻方：按路线推进 → 携弹者安放 → 其余人守包
   防守方：分散站位守 A → 炸弹安放后回防拆弹
   ========================================================= */

function makeAI() { return { sniper: false }; }

function resetAI(b) {
  Object.assign(b.ai, {
    target: null, reactT: 0, err: { x: 0, y: 0, h: 0 }, lastSeen: null, aimLat: undefined, aimH: 1.2, aimT: 0,
    path: [], pi: 0, pathGoal: null, repathT: 0,
    goal: null, mode: 'move', look: null, lookAt: null, lookAtT: 0,
    route: weightedRoute(), routeIdx: 0,
    siteSpot: randomZoneSpot(PLANT_ZONE), plantSpot: randomZoneSpot(PLANT_ZONE), siteLook: toW(pick(A_WATCH)),
    postSpot: null, postLook: null, hold: null,
    strafeDir: 0, strafeT: 0, strafeWalk: true, tapT: 0, nadeCD: rand(1, 3),
    stuckT: 0, lastPos: { x: b.x, y: b.y }, percT: Math.random() * 0.12, goalT: 0, entryUtil: false,
  });
}
function assignHolds() {
  for (let team = 0; team < 2; team++) {
    if (G.side[team] !== 'DEF') continue;
    const holds = shuffle(DEF_HOLDS.slice());
    G.agents.filter(a => a.team === team && a.ai).forEach((b, i) => { b.ai.hold = holds[i % holds.length]; });
  }
}
function weightedRoute() {
  let x = Math.random() * ATT_ROUTES.reduce((s, r) => s + r.w, 0);
  for (const r of ATT_ROUTES) { x -= r.w; if (x <= 0) return r; }
  return ATT_ROUTES[0];
}
function randomZoneSpot([x, y, w, h]) {
  for (let k = 0; k < 40; k++) {
    const i = randi(x, x + w - 1), j = randi(y, y + h - 1);
    if (!solidAt(i, j) && !nearWall[j * MW + i]) return { x: tc(i) + rand(-6, 6), y: tc(j) + rand(-6, 6) };
  }
  return { x: tc(x + (w >> 1)), y: tc(y + (h >> 1)) };
}
function randomFreeNear(x, y, rt) {
  const cx = tileOf(x), cy = tileOf(y);
  for (let k = 0; k < 40; k++) {
    const i = cx + randi(-rt, rt), j = cy + randi(-rt, rt);
    if (solidAt(i, j) || nearWall[j * MW + i]) continue;
    const p = { x: tc(i), y: tc(j) };
    if (wallLOS(p, { x, y })) return { x: p.x + rand(-6, 6), y: p.y + rand(-6, 6) };
  }
  return { x, y };
}
function nearestBots(p, team, n) {
  return G.agents.filter(a => a.ai && a.alive && a.team === team).sort((a, c) => dist(a, p) - dist(c, p)).slice(0, n);
}
function bestWeaponIdx(b) {
  let bi = 0, bs = -1;
  b.weapons.forEach((w, i) => {
    if (w.mag + w.reserve <= 0) return;
    let s = BOT_TIER[w.id] ?? 0;
    if (WEAPONS[w.id].sniper) s += b.ai.sniper ? 3 : -4;   // 狙击位优先用狙，其他人把狙当备用
    if (s > bs) { bs = s; bi = i; }
  });
  return bi;
}

/* 购买：先买自己想要的那套，钱还够就再补一套护甲最好的（拿更高级的头甲） */
function botBuy(b) {
  const prefs = b.ai.sniper ? ['k5', 'k3', 'k4', 'k2', 'k1'] : ['k4', 'k2', 'k1', 'k5', 'k3'];
  for (const id of prefs) if (buy(b, 'kit', id)) break;
  const st = stageOf(b.xp);
  if (st > 0 && b.money >= 1600) buy(b, 'kit', KITS[st - 1].id);
  if (Math.random() < 0.55) buy(b, 'frag');
  if (Math.random() < 0.35) buy(b, 'smoke');
  b.cur = bestWeaponIdx(b); b.switchT = 0;
}

/* ---------- 每帧 ---------- */
function botUpdate(b, dt) {
  const ai = b.ai;
  b.walking = false; b.scoped = false;
  if (G.phase === 'buy' || G.phase === 'end') { b.speedNow = 0; return; }
  ai.percT -= dt; ai.tapT -= dt; ai.nadeCD -= dt; ai.repathT -= dt;
  if (ai.percT <= 0) { ai.percT = 0.09 + Math.random() * 0.06; perceive(b); }
  if (b.action && botAction(b, dt)) return;
  if (ai.target && ai.target.alive) { combat(b, dt); return; }
  ai.target = null;
  b.pitch *= Math.exp(-dt * 6);
  if (b.reloadT <= 0 && b.switchT <= 0) {
    const bi = bestWeaponIdx(b);
    if (bi !== b.cur) switchWeapon(b, bi);
    else { const w = curW(b); if (w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0) startReload(b); }
  }
  ai.goalT -= dt;
  if (ai.goalT <= 0) { ai.goalT = 0.3 + Math.random() * 0.2; decideGoal(b); }
  followGoal(b, dt);
}

/* 视野：距离 + 视角 + 墙/烟遮挡；近身 220 像素内无视角限制 */
function perceive(b) {
  const ai = b.ai, D = G.diffCfg, fovHalf = D.fov * Math.PI / 360;
  let best = null, bestScore = Infinity;
  for (const e of G.agents) {
    if (!e.alive || e.team === b.team) continue;
    const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
    if (d > D.vision) continue;
    if (d > 220 && Math.abs(wrapA(Math.atan2(dy, dx) - b.angle)) > fovHalf) continue;
    if (!canSee(b, e)) continue;
    e.spotted[b.team] = G.time + 0.6;
    let s = d;
    if (e === ai.target) s *= 0.6;
    if (e.action) s *= 0.7;
    if (s < bestScore) { bestScore = s; best = e; }
  }
  if (best) {
    if (best !== ai.target) {
      const behind = Math.abs(wrapA(Math.atan2(best.y - b.y, best.x - b.x) - b.angle)) > 1.2;
      // 站定架点的人有预瞄优势：反应更快、首发更准。3D 的命中框更小，这个加成会被放大，所以只在 2D 里给
      const holding = G.mode !== '3d' && ai.mode === 'hold' && b.speedNow === 0 && !behind;
      ai.target = best;
      ai.reactT = D.reaction * rand(0.8, 1.3) * (holding ? 0.9 : 1) + (behind ? 0.12 : 0);
      const a = Math.random() * TAU, m = D.errStart * rand(0.7, 1.2) * (holding ? 0.75 : 1);
      ai.err = { x: Math.cos(a) * m, y: Math.sin(a) * m, h: gauss() * m * 0.7 };
      rollAimSpot(ai);
    }
    ai.lastSeen = { x: best.x, y: best.y, t: G.time };
  } else if (ai.target) {
    ai.lookAt = { x: ai.target.x, y: ai.target.y }; ai.lookAtT = G.time + 2;
    ai.target = null;
  }
}

/* 瞄哪儿：按难度概率瞄头，否则瞄身体（2D 瞄身体侧边，3D 瞄胸口高度） */
function rollAimSpot(ai) {
  const head = Math.random() < G.diffCfg.headAim;
  if (G.mode === '3d') {
    ai.aimLat = head ? 0 : rand(-0.5, 0.5) * VIEW3D.BODY_R / VIEW3D.S;
    ai.aimH = head ? VIEW3D.HEAD_Y : rand(0.95, 1.3);
  } else {
    ai.aimLat = head ? 0 : (Math.random() < 0.5 ? -1 : 1) * R * rand(0.6, 0.9);
  }
  ai.aimT = rand(0.5, 1.1);
}

/* 读条中：被打或看到敌人就中断（时间不够了则硬读） */
function botAction(b, dt) {
  const ai = b.ai, threat = (ai.target && ai.target.alive) || G.time - b.hurtT < 0.3;
  b.speedNow = 0;
  if (b.action === 'plant') {
    if (G.phase !== 'live' || G.spike.carrier !== b) { b.action = null; b.plantProg = 0; return false; }
    if (threat && G.timer > CFG.PLANT_TIME - b.plantProg + 1.5) { b.action = null; b.plantProg = 0; return false; }
    b.plantProg += dt;
    if (b.plantProg >= CFG.PLANT_TIME) plantSpike(b);
    return true;
  }
  if (b.action === 'defuse') {
    const need = CFG.DEFUSE_TIME - b.defuseProg;
    if (G.phase !== 'planted') { b.action = null; b.defuseProg = 0; return false; }
    if (threat && need > 1.2 && G.timer > need + 0.6) { b.action = null; b.defuseProg = 0; return false; }
    b.defuseProg += dt;
    if (b.defuseProg >= CFG.DEFUSE_TIME) defuseSpike(b);
    return true;
  }
  return false;
}

function combat(b, dt) {
  const ai = b.ai, t = ai.target, D = G.diffCfg;
  const w = curW(b), d = WEAPONS[w.id];
  if (w.mag === 0 && b.reloadT <= 0 && b.switchT <= 0) {
    if (w.reserve > 0) startReload(b);
    else { const bi = bestWeaponIdx(b); if (bi !== b.cur) switchWeapon(b, bi); }
  }
  const k = Math.exp(-D.errDecay * dt);
  ai.err.x *= k; ai.err.y *= k; ai.err.h = (ai.err.h || 0) * k;
  ai.aimT -= dt;
  if (ai.aimLat === undefined || ai.aimT <= 0) rollAimSpot(ai);
  // 瞄点相对射线横向偏移（沿射线方向的偏移不改变弹道）
  const la = Math.atan2(t.y - b.y, t.x - b.x) + Math.PI / 2;
  const want = Math.atan2(t.y + ai.err.y + Math.sin(la) * ai.aimLat - b.y, t.x + ai.err.x + Math.cos(la) * ai.aimLat - b.x);
  b.angle = turnToward(b.angle, want, D.turn * dt);
  ai.reactT -= dt;
  const dd = Math.hypot(t.x - b.x, t.y - b.y);
  if (G.mode === '3d') b.pitch = Math.atan2(ai.aimH - VIEW3D.EYE + ai.err.h * VIEW3D.S, Math.max(dd, 1) * VIEW3D.S);

  if (d.sniper) { b.scoped = true; b.speedNow = 0; }
  else {
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(0.3, 0.85); ai.strafeDir = pick([-1, 0, 1, 1, -1]); ai.strafeWalk = Math.random() < 0.8; }
    let mx = 0, my = 0;
    const ta = Math.atan2(t.y - b.y, t.x - b.x);
    if (ai.strafeDir) { mx = Math.cos(ta + ai.strafeDir * Math.PI / 2); my = Math.sin(ta + ai.strafeDir * Math.PI / 2); }
    if (dd > d.range * 0.8) { mx += Math.cos(ta); my += Math.sin(ta); }
    const ml = Math.hypot(mx, my);
    if (ml > 0) { b.walking = ai.strafeWalk; const sp = moveSpeed(b); moveAgent(b, mx / ml * sp * dt, my / ml * sp * dt); b.speedNow = sp; }
    else b.speedNow = 0;
  }

  const aimed = Math.abs(wrapA(b.angle - want)) < 0.09;
  const steady = !d.sniper || Math.hypot(ai.err.x, ai.err.y, ai.err.h) < R * 0.8;
  if (ai.reactT <= 0 && aimed && steady && dd <= d.range && w.mag > 0 && (d.auto || ai.tapT <= 0)) {
    const save = b.angle, saveP = b.pitch;
    b.angle += gauss() * D.errFloor / Math.max(dd, 60);
    b.pitch += gauss() * D.errFloor / Math.max(dd, 60);
    if (fire(b) && !d.auto) ai.tapT = 60 / d.rpm + rand(0.04, 0.16) * (d.sniper ? 2.5 : 1);
    b.angle = save; b.pitch = saveP;
  }

  if (ai.nadeCD <= 0) {
    ai.nadeCD = 1.2;
    if (b.nades.frag > 0 && dd > 200 && dd < 520 && Math.random() < D.nadeRate) throwNade(b, 'frag', t.x + rand(-30, 30), t.y + rand(-30, 30));
    else if (b.nades.smoke > 0 && dd > 480 && Math.random() < D.nadeRate * 0.6) throwNade(b, 'smoke', (b.x + t.x) / 2, (b.y + t.y) / 2);
  }
}

/* 决定当前目标点 */
function decideGoal(b) {
  const ai = b.ai, S = G.spike, side = G.side[b.team];
  ai.look = null;
  if (side === 'ATT') {
    if (S.state === 'planted') {
      if (!ai.postSpot) { ai.postSpot = randomFreeNear(S.x, S.y, 5); ai.postLook = toW(pick(A_WATCH)); }
      ai.goal = ai.postSpot; ai.mode = 'hold'; ai.look = ai.postLook; return;
    }
    if (S.state === 'dropped' && nearestBots(S, b.team, 2).includes(b)) { ai.goal = { x: S.x, y: S.y }; ai.mode = 'move'; return; }
    const via = ai.route.via;
    if (inPlantZone(b)) ai.routeIdx = via.length;
    while (ai.routeIdx < via.length && Math.hypot(tc(via[ai.routeIdx][0]) - b.x, tc(via[ai.routeIdx][1]) - b.y) < 70) ai.routeIdx++;
    if (ai.routeIdx < via.length) {
      ai.goal = toW(via[ai.routeIdx]); ai.mode = 'move';
      // 冲点前往包点里丢烟或雷
      if (ai.routeIdx === via.length - 1 && !ai.entryUtil && dist(b, ai.goal) < 220 && G.phase === 'live') {
        ai.entryUtil = true;
        const c = toW([PLANT_ZONE[0] + PLANT_ZONE[2] / 2, PLANT_ZONE[1] + PLANT_ZONE[3] / 2]);
        if (b.nades.smoke > 0) throwNade(b, 'smoke', (ai.goal.x + c.x) / 2, (ai.goal.y + c.y) / 2);
        else if (b.nades.frag > 0 && Math.random() < 0.6) { const h = toW(pick(DEF_HOLDS.slice(0, 6)).at); throwNade(b, 'frag', h.x, h.y); }
      }
      return;
    }
    if (S.state === 'carried' && S.carrier === b) { ai.goal = ai.plantSpot; ai.mode = 'plant'; return; }
    ai.goal = ai.siteSpot; ai.mode = 'hold'; ai.look = ai.siteLook; return;
  }
  if (S.state === 'planted') {
    const busy = G.agents.some(a => a !== b && a.alive && a.team === b.team && a.action === 'defuse');
    if (busy) {
      if (!ai.postSpot) { ai.postSpot = randomFreeNear(S.x, S.y, 4); ai.postLook = toW(pick(A_WATCH)); }
      ai.goal = ai.postSpot; ai.mode = 'hold'; ai.look = ai.postLook; return;
    }
    ai.goal = { x: S.x, y: S.y }; ai.mode = 'defuse'; return;
  }
  const h = ai.hold || DEF_HOLDS[0];
  ai.goal = toW(h.at); ai.mode = 'hold'; ai.look = toW(h.look);
}

function followGoal(b, dt) {
  const ai = b.ai, g = ai.goal;
  if (!g) { b.speedNow = 0; return; }
  const dg = Math.hypot(g.x - b.x, g.y - b.y);
  if (ai.mode === 'plant' && dg < 26 && inPlantZone(b) && G.phase === 'live' && G.spike.carrier === b) {
    b.action = 'plant'; b.plantProg = 0; b.speedNow = 0; return;
  }
  if (ai.mode === 'defuse' && G.phase === 'planted' && dist(b, G.spike) < CFG.DEFUSE_RANGE - 14) {
    b.action = 'defuse'; b.defuseProg = 0; b.speedNow = 0; return;
  }
  if (ai.mode === 'hold' && dg < 20) { b.speedNow = 0; faceHold(b, dt); return; }
  if (ai.mode === 'move' && dg < 24) { ai.goalT = 0; b.speedNow = 0; return; }

  if (!ai.pathGoal || Math.hypot(ai.pathGoal.x - g.x, ai.pathGoal.y - g.y) > 30 || ai.repathT <= 0) computePath(b, g);
  while (ai.pi < ai.path.length && Math.hypot(ai.path[ai.pi].x - b.x, ai.path[ai.pi].y - b.y) < 16) ai.pi++;
  const tgt = ai.pi < ai.path.length ? ai.path[ai.pi] : g;
  const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy) || 1;
  const sp = moveSpeed(b);
  const step = Math.min(sp * dt, d);
  moveAgent(b, dx / d * step, dy / d * step);
  b.speedNow = sp;
  const face = ai.lookAt && ai.lookAtT > G.time ? Math.atan2(ai.lookAt.y - b.y, ai.lookAt.x - b.x) : Math.atan2(dy, dx);
  b.angle = turnToward(b.angle, face, 8 * dt);

  ai.stuckT += dt;
  if (ai.stuckT > 0.7) {
    if (Math.hypot(b.x - ai.lastPos.x, b.y - ai.lastPos.y) < 12) { ai.repathT = 0; moveAgent(b, rand(-10, 10), rand(-10, 10)); }
    ai.stuckT = 0; ai.lastPos = { x: b.x, y: b.y };
  }
}

function computePath(b, g) {
  const ai = b.ai;
  const pts = findPath(tileOf(b.x), tileOf(b.y), tileOf(g.x), tileOf(g.y)).map(([i, j]) => ({ x: tc(i), y: tc(j) }));
  if (pts.length && !solidPx(g.x, g.y)) pts[pts.length - 1] = { x: g.x, y: g.y };
  ai.path = smoothPath(b.x, b.y, pts); ai.pi = 0;
  ai.pathGoal = { x: g.x, y: g.y };
  ai.repathT = 1.8 + Math.random() * 1.2;
}

function faceHold(b, dt) {
  const ai = b.ai;
  let ang;
  if (ai.lookAt && ai.lookAtT > G.time) ang = Math.atan2(ai.lookAt.y - b.y, ai.lookAt.x - b.x);
  else if (ai.look) ang = Math.atan2(ai.look.y - b.y, ai.look.x - b.x) + Math.sin(G.time * 0.8 + b.id * 1.7) * 0.45;
  else return;
  b.angle = turnToward(b.angle, ang, 5 * dt);
}
