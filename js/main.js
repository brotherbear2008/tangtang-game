'use strict';
/* =========================================================
   航天基地爆破战 · 输入 / 音效 / 菜单与商店 / 主循环
   ========================================================= */

const $ = s => document.querySelector(s);
const Input = {
  keys: {}, mx: 0, my: 0, lmb: false, rmb: false, clickT: 0, clickUsed: true,
  locked: false, lockFallback: false, lockFails: 0, unlockExpected: false, unlockT: -1e9,   // 3D 鼠标锁定状态
};
const SETTINGS_KEY = 'htjd_settings_v1';

/* ---------- 音效（全部用 WebAudio 现场合成，带左右声道） ---------- */
const SFX = {
  ctx: null, master: null, noise: null, muted: false, live: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      this.master = this.ctx.createGain(); this.master.gain.value = 0.45; this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  vol(x, y) {
    const v = viewer() || G.player;
    if (!v) return 0.3;
    return Math.pow(clamp(1 - Math.hypot(x - v.x, y - v.y) / 1700, 0, 1), 1.6);
  },
  /* 声音在左还是右：3D 按自己的朝向算，2D 按屏幕左右算 */
  pan(x, y) {
    const v = viewer() || G.player;
    if (!v) return 0;
    if (G.mode === '3d') return clamp(Math.sin(Math.atan2(y - v.y, x - v.x) - v.angle), -1, 1) * 0.8;
    return clamp((x - v.x) / 700, -1, 1) * 0.7;
  },
  out(node, pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      node.connect(p); p.connect(this.master);
    } else node.connect(this.master);
  },
  burst(vol, freq, dur, q = 0.8, type = 'lowpass', pan = 0) {
    if (!this.ctx || this.muted || vol < 0.02 || this.live > 18) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); this.out(g, pan);
    this.live++; src.onended = () => { this.live--; };
    src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.02);
  },
  tone(vol, freq, dur, type = 'square', delay = 0, pan = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); this.out(g, pan); o.start(t); o.stop(t + dur + 0.02);
  },
  shot(a, d) {
    const v = this.vol(a.x, a.y) * (a.isPlayer ? 1 : 0.6), pn = a.isPlayer ? 0 : this.pan(a.x, a.y);
    if (d.sniper) this.burst(v * 0.95, 700, 0.45, 0.5, 'lowpass', pn);
    else if (d.type === '手枪') this.burst(v * 0.5, 2600, 0.08, 0.8, 'lowpass', pn);
    else if (d.type === '轻机枪') this.burst(v * 0.6, 1100, 0.13, 0.8, 'lowpass', pn);
    else this.burst(v * 0.55, 1700, 0.1, 0.8, 'lowpass', pn);
  },
  boom(x, y, big) { this.burst(this.vol(x, y) * (big ? 1.6 : 1.1), big ? 180 : 320, big ? 1.8 : 0.9, 0.4, 'lowpass', this.pan(x, y)); },
  hit(head) { this.tone(head ? 0.3 : 0.14, head ? 1500 : 950, 0.05, 'triangle'); },
  killConfirm(head) { this.tone(0.22, 1320, 0.07, 'triangle'); this.tone(0.22, head ? 1980 : 1660, 0.1, 'triangle', 0.06); },
  beep(x, y) { this.tone(0.2 * Math.max(0.25, this.vol(x, y)), 1250, 0.06, 'square', 0, this.pan(x, y)); },
  dry() { this.tone(0.12, 260, 0.04); },
  reload() { this.burst(0.18, 3000, 0.05, 2, 'bandpass'); },
};

/* ---------- 玩家操作 ---------- */
function updatePlayer(dt) {
  const p = G.player;
  if (!p || !p.alive) return;
  const K = Input.keys, is3d = G.mode === '3d';
  if (!is3d) {
    const mw = screenToWorld(Input.mx, Input.my);
    p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);
  }
  const combat = G.phase === 'live' || G.phase === 'planted';

  let acting = false;
  if (K.KeyE && combat) {
    if (G.phase === 'live' && G.spike.carrier === p && inPlantZone(p)) {
      acting = true; p.action = 'plant'; p.plantProg += dt;
      if (p.plantProg >= CFG.PLANT_TIME) plantSpike(p);
    } else if (G.phase === 'planted' && G.side[p.team] === 'DEF' && dist(p, G.spike) <= CFG.DEFUSE_RANGE) {
      acting = true; p.action = 'defuse'; p.defuseProg += dt;
      if (p.defuseProg >= CFG.DEFUSE_TIME) defuseSpike(p);
    }
  }
  if (!acting) { p.action = null; p.plantProg = 0; p.defuseProg = 0; }

  const d = WEAPONS[curW(p).id];
  p.walking = !!(K.ShiftLeft || K.ShiftRight);
  p.scoped = !acting && Input.rmb && !!d.sniper && p.switchT <= 0 && p.reloadT <= 0;
  let f = 0, s = 0;
  if (!acting) {
    if (K.KeyW || K.ArrowUp) f += 1;
    if (K.KeyS || K.ArrowDown) f -= 1;
    if (K.KeyD || K.ArrowRight) s += 1;
    if (K.KeyA || K.ArrowLeft) s -= 1;
  }
  // 2D：W 永远朝地图上方；3D：W 朝自己面对的方向
  const c = Math.cos(p.angle), sn = Math.sin(p.angle);
  const mx = is3d ? c * f - sn * s : s, my = is3d ? sn * f + c * s : -f;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const sp = moveSpeed(p);
    moveAgent(p, (mx / len) * sp * dt, (my / len) * sp * dt);
    p.speedNow = sp;
  } else p.speedNow = 0;
  if (G.phase === 'buy') clampToSpawn(p);
  if (is3d && Input.lockFallback && !shopOpen) {
    // 不能锁定鼠标时：鼠标靠近屏幕左右边缘就持续转身
    const edge = CW * 0.08, turn = dt * 2.2 * opts.sens;
    if (Input.mx < edge) p.angle = wrapA(p.angle - turn);
    else if (Input.mx > CW - edge) p.angle = wrapA(p.angle + turn);
  }

  if (!acting && combat && Input.lmb && !shopOpen) {
    const fresh = !Input.clickUsed && performance.now() - Input.clickT < 160;
    if ((d.auto || fresh) && fire(p)) Input.clickUsed = true;
  }
}
/* 投掷落点：2D 是鼠标位置；3D 朝准星方向，抬头扔得远，低头落在脚前 */
function throwTarget(p) {
  if (G.mode !== '3d') return screenToWorld(Input.mx, Input.my);
  let reach = clamp(260 + p.pitch * 520, 90, 520);
  if (p.pitch < -0.05) reach = Math.min(reach, VIEW3D.EYE / VIEW3D.S / Math.tan(-p.pitch));
  return { x: p.x + Math.cos(p.angle) * reach, y: p.y + Math.sin(p.angle) * reach };
}

function onKey(code) {
  const p = G.player;
  if (code === 'Escape') {
    if (shopOpen) closeShopByUser();
    else if (G.mode === '3d') pauseGame();            // 3D 里 Esc 只负责暂停，继续要点按钮重新锁定鼠标
    else togglePause();
    return;
  }
  if (G.paused || G.phase === 'over') return;
  if (code === 'Tab') { showBoard(true); return; }
  if (code === 'KeyM') { SFX.muted = !SFX.muted; notify(SFX.muted ? '已静音（M 恢复）' : '声音已打开'); return; }
  if (code === 'KeyB') {
    if (G.phase === 'buy' && p.alive) { if (shopOpen) closeShopByUser(); else openShop(); }
    else notify('只能在每局开头的购买阶段打开商店');
    return;
  }
  if (!p.alive) { if (code === 'Space') G.spec++; return; }
  if (/^Digit[1-9]$/.test(code)) { switchWeapon(p, Number(code.slice(5)) - 1); return; }
  if (code === 'KeyQ') { switchWeapon(p, p.last); return; }
  if (code === 'KeyR') { startReload(p); return; }
  if (code === 'KeyG' || code === 'KeyC') {
    const type = code === 'KeyG' ? 'frag' : 'smoke';
    if (p.nades[type] <= 0) { notify(type === 'frag' ? '没有手雷' : '没有烟雾弹'); return; }
    const t = throwTarget(p);
    if (!throwNade(p, type, t.x, t.y)) notify('战斗开始后才能投掷');
    return;
  }
  if (code === 'KeyX' && G.spike.state === 'carried' && G.spike.carrier === p) { dropSpike(p); notify('丢下了炸弹，队友踩上去就能捡'); }
}

/* ---------- 3D 鼠标锁定 ---------- */
function lockPointer() {
  if (G.mode !== '3d' || G.state !== 'game' || Input.lockFallback || document.pointerLockElement === cv) return;
  if (!cv.requestPointerLock) return lockFailed(true);
  try {
    const r = cv.requestPointerLock();
    if (r && r.catch) r.catch(() => lockFailed());
  } catch (e) { lockFailed(); }
}
function unlockPointer() {
  if (document.pointerLockElement) { Input.unlockExpected = true; document.exitPointerLock(); }
}
/* 浏览器刚退出锁定的 1 秒多内会拒绝再次锁定，这种失败不算；其他失败说明这里不允许锁定，改用「不锁定也能转视角」 */
function lockFailed(permanent) {
  if (Input.lockFallback) return;
  Input.lockFails++;
  if (permanent || performance.now() - Input.unlockT > 1500 || Input.lockFails >= 3) {
    Input.lockFallback = true;
    document.body.classList.add('lockfree');
    notify('这里无法锁定鼠标：移动鼠标转视角，鼠标靠近屏幕左右边缘会持续转身');
  }
}
document.addEventListener('pointerlockchange', () => {
  Input.locked = document.pointerLockElement === cv;
  if (Input.locked) Input.lockFails = 0;
  else {
    Input.unlockT = performance.now();
    Input.lmb = false; Input.rmb = false;
    // 按 Esc 解锁 = 暂停；自己打开商店、暂停、结算时解锁不算
    if (!Input.unlockExpected && G.state === 'game' && G.mode === '3d' && !shopOpen && G.phase !== 'over') pauseGame();
  }
  Input.unlockExpected = false;
});
document.addEventListener('pointerlockerror', () => lockFailed());

window.addEventListener('keydown', e => {
  if (G.state !== 'game') return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  const was = Input.keys[e.code];
  Input.keys[e.code] = true;
  if (!was) onKey(e.code);
});
window.addEventListener('keyup', e => {
  Input.keys[e.code] = false;
  if (e.code === 'Tab') showBoard(false);
});
window.addEventListener('blur', () => { Input.keys = {}; Input.lmb = false; Input.rmb = false; showBoard(false); });
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  Input.mx = e.clientX - r.left; Input.my = e.clientY - r.top;
  const p = G.player;
  if (G.mode !== '3d' || G.state !== 'game' || G.paused || shopOpen || !p || !p.alive) return;
  if (!Input.locked && !Input.lockFallback) return;
  const k = 0.0022 * opts.sens * (T3 ? T3.camera.fov / VIEW3D.FOV : 1);   // 开镜时灵敏度跟着视野变小
  p.angle = wrapA(p.angle + e.movementX * k);
  p.pitch = clamp(p.pitch - e.movementY * k, -1.45, 1.45);
});
cv.addEventListener('mousedown', e => {
  if (G.state !== 'game') return;
  SFX.init();
  if (G.mode === '3d') {
    if (shopOpen) { closeShopByUser(); return; }
    if (!Input.locked && !Input.lockFallback) { lockPointer(); return; }   // 这一下只用来锁定鼠标，不开枪
  }
  if (e.button === 0) {
    Input.lmb = true; Input.clickT = performance.now(); Input.clickUsed = false;
    if (G.player && !G.player.alive) G.spec++;
  } else if (e.button === 2) Input.rmb = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) Input.lmb = false; else if (e.button === 2) Input.rmb = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  if (G.state !== 'game' || !G.player || !G.player.alive || G.paused) return;
  e.preventDefault();
  const p = G.player, n = p.weapons.length;
  if (n > 1) switchWeapon(p, (p.cur + (e.deltaY > 0 ? 1 : -1) + n) % n);
}, { passive: false });

/* ---------- 商店 ---------- */
let shopOpen = false;
const shopEl = $('#shop');
function openShop(auto) {
  if (!G.player || !G.player.alive || G.phase !== 'buy') return;
  if (auto && G.mode === '3d') return;               // 3D 里不自动弹出，按 B 打开
  shopOpen = true; shopEl.hidden = false; renderShop();
  if (G.mode === '3d') unlockPointer();
}
function closeShop() { shopOpen = false; shopEl.hidden = true; }
function closeShopByUser() { closeShop(); lockPointer(); }
function itemCard(kind, id, it, meta) {
  const p = G.player, c = buyCheck(p, kind, id), st = STAGES[it.stage];
  const state = c.ok ? `<span class="price">${it.price ? it.price.toLocaleString('zh-CN') : '免费'}</span>` : `<span class="why${c.locked ? ' lock' : ''}">${c.why}</span>`;
  return `<button type="button" class="item${c.owned ? ' owned' : ''}${c.locked ? ' locked' : ''}" data-kind="${kind}" data-id="${id || ''}" ${c.ok ? '' : 'disabled'} style="--tier:${st.color}">
    <span class="item-top"><span class="item-name">${it.name}</span>${state}</span>
    <span class="item-meta">${meta}</span>
    <span class="item-tier">${st.name}${it.price && !c.ok && !c.locked ? ' · ' + it.price.toLocaleString('zh-CN') : ''}</span>
  </button>`;
}
function renderShop() {
  const p = G.player;
  $('#shopMoney').textContent = p.money.toLocaleString('zh-CN');
  $('#shopXP').textContent = `${p.xp} · ${STAGES[stageOf(p.xp)].name}`;
  $('#shopKits').innerHTML = KITS.map(k => {
    const guns = k.weapons.map(id => {
      const d = WEAPONS[id];
      return d.oneShot ? `<b>${d.name}</b> ${d.type} · 命中秒杀` : `<b>${d.name}</b> ${d.type} · 伤害 ${d.dmg} · ${d.rpm} 发/分`;
    }).join('<br>');
    return itemCard('kit', k.id, k, `${guns}<br>${kitArmor(k).name} ${kitArmor(k).value} · ${kitHelmet(k).name} ${kitHelmet(k).value}`);
  }).join('');
  $('#shopUtil').innerHTML = itemCard('frag', '', itemDef('frag'), `半径 ${CFG.FRAG.radius} · 最高 ${CFG.FRAG.damage} 伤害 · G 投掷`)
    + itemCard('smoke', '', itemDef('smoke'), `${CFG.SMOKE.duration} 秒 · 挡视线不挡子弹 · C 投掷`);
}
shopEl.addEventListener('click', e => {
  const btn = e.target.closest('.item');
  if (btn && !btn.disabled) {
    SFX.init();
    if (buy(G.player, btn.dataset.kind, btn.dataset.id || undefined)) { SFX.tone(0.12, 880, 0.06, 'triangle'); renderShop(); }
  }
  if (e.target.closest('#shopClose')) closeShopByUser();
});

/* ---------- 计分板 / 暂停 / 结算 ---------- */
let boardOpen = false;
function showBoard(on) {
  boardOpen = on && G.state === 'game';
  $('#board').hidden = !boardOpen;
  if (boardOpen) renderBoard();
}
function renderBoard() {
  const rows = team => G.agents.filter(a => a.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map(a => {
    const st = STAGES[stageOf(a.xp)];
    return `<tr class="${a.isPlayer ? 'me' : ''}${a.alive ? '' : ' dead'}">
      <td>${a.name}</td><td>${a.kills}</td><td>${a.deaths}</td>
      <td>${team === 0 ? a.money.toLocaleString('zh-CN') : '—'}</td>
      <td><span class="dot" style="--tier:${st.color}"></span>${st.name}</td>
      <td>${a.alive ? WEAPONS[curW(a).id].name : '阵亡'}</td></tr>`;
  }).join('');
  const head = '<tr><th>队员</th><th>击杀</th><th>阵亡</th><th>金钱</th><th>阶段</th><th>武器</th></tr>';
  $('#boardBody').innerHTML = `
    <div class="board-team ally"><h3>我方 · ${sideName(G.side[0])} <b>${G.score[0]}</b></h3><div class="tablewrap"><table>${head}${rows(0)}</table></div></div>
    <div class="board-team enemy"><h3>敌方 · ${sideName(G.side[1])} <b>${G.score[1]}</b></h3><div class="tablewrap"><table>${head}${rows(1)}</table></div></div>`;
}
function pauseGame() {
  if (G.state !== 'game' || G.phase === 'over' || G.paused) return;
  G.paused = true;
  $('#pause').hidden = false;
  Input.lmb = false; Input.rmb = false;
  unlockPointer();
}
function resumeGame() {
  if (!G.paused) return;
  G.paused = false;
  $('#pause').hidden = true;
  lockPointer();
}
function togglePause() { if (G.paused) resumeGame(); else pauseGame(); }
function showOver(win) {
  const p = G.player;
  $('#overTitle').textContent = win ? '比赛胜利' : '比赛失利';
  $('#overTitle').style.color = win ? 'var(--ally)' : 'var(--enemy)';
  $('#overScore').textContent = `${G.score[0]} : ${G.score[1]}`;
  const gained = p.xp - G.startXP, st = stageOf(p.xp), next = STAGES[st + 1];
  $('#overStats').innerHTML = `
    <div><dt>击杀</dt><dd>${p.kills}</dd></div>
    <div><dt>阵亡</dt><dd>${p.deaths}</dd></div>
    <div><dt>本场经验</dt><dd>+${gained}</dd></div>
    <div><dt>当前阶段</dt><dd style="color:${STAGES[st].color}">${STAGES[st].name}</dd></div>`;
  $('#overNext').textContent = next ? `再拿 ${next.xp - p.xp} 经验解锁「${next.name}」` : '所有装备已解锁';
  $('#over').hidden = false;
  closeShop(); showBoard(false); unlockPointer();
  document.body.classList.remove('playing');
}

/* ---------- 菜单 ---------- */
const opts = { side: 'ATT', diff: 'normal', mode: '3d', sens: 1 };
try { Object.assign(opts, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* 读不到就用默认设置 */ }
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(opts)); } catch (e) { /* 存不了就只在本次有效 */ }
}
function segInit(id, key, onChange) {
  const el = $(id);
  const mark = () => el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === opts[key] ? 'true' : 'false'));
  mark();
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    opts[key] = b.dataset.v;
    if (onChange) onChange();
    mark(); saveSettings();
  });
}
/* 切换 2D / 3D：3D 需要 WebGL 和从 CDN 加载的 Three.js，不可用时退回 2D */
function applyMode() {
  if (opts.mode === '3d' && !init3d()) {
    opts.mode = '2d';
    $('#mode3dNote').hidden = false;
    $('#optMode button[data-v="3d"]').disabled = true;
  }
  G.mode = opts.mode;
  document.body.classList.toggle('mode3d', opts.mode === '3d');
  $('#sensRow').hidden = opts.mode !== '3d';
}
function renderXPCard() {
  const xp = loadXP(), st = stageOf(xp), next = STAGES[st + 1];
  $('#menuXP').textContent = xp.toLocaleString('zh-CN');
  $('#menuStage').textContent = STAGES[st].name;
  $('#menuStage').style.color = STAGES[st].color;
  $('#menuNext').textContent = next ? `距「${next.name}」还差 ${next.xp - xp}` : '全部解锁';
  $('#stageTrack').innerHTML = STAGES.map((s, i) => `<li class="${i <= st ? 'on' : ''}" style="--tier:${s.color}"><b>${s.name}</b><span>${s.xp}</span></li>`).join('');
}
function renderWeaponTable() {
  $('#kitTable').innerHTML = `<thead><tr><th>套装</th><th>解锁经验</th><th>价格</th><th>武器</th><th>护甲</th><th>头盔</th></tr></thead><tbody>${KITS.map(k => `
    <tr><td><b style="color:${STAGES[k.stage].color}">${k.name}</b></td><td>${STAGES[k.stage].xp}</td><td>${k.price}</td>
      <td>${k.weapons.map(id => WEAPONS[id].name).join(' + ')}</td><td>${kitArmor(k).name} ${kitArmor(k).value}</td><td>${kitHelmet(k).name} ${kitHelmet(k).value}</td></tr>`).join('')}</tbody>`;
  const rows = WEAPON_ORDER.map(id => {
    const d = WEAPONS[id], dps = d.oneShot ? '秒杀' : Math.round(d.dmg * d.rpm / 60);
    const kit = KITS.find(k => k.weapons.includes(id));
    return `<tr><td><b>${d.name}</b><small>${d.type}</small></td><td style="color:${STAGES[d.stage].color}">${kit ? kit.name : '自带'}</td>
      <td>${AMMO[d.ammo].name}</td><td>${d.oneShot ? '—' : d.dmg}</td><td>${d.rpm}${d.bolt ? '+拉栓' : ''}</td>
      <td>${d.mag}/${d.reserve}</td><td>${d.reload}s</td><td>${Math.round(d.move * 100)}%</td><td>${dps}</td>
      <td class="note">${d.note || ''}</td></tr>`;
  }).join('');
  $('#weaponTable').innerHTML = `<thead><tr><th>武器</th><th>来自</th><th>弹种</th><th>伤害</th><th>射速</th><th>弹匣/备弹</th><th>换弹</th><th>移速</th><th>每秒伤害</th><th>改动</th></tr></thead><tbody>${rows}</tbody>`;
}
function startGame() {
  SFX.init();
  $('#menu').hidden = true; $('#over').hidden = true; $('#pause').hidden = true;
  document.body.classList.add('playing');
  Input.keys = {}; Input.lmb = false; Input.rmb = false;
  G.mode = opts.mode;
  startMatch(opts);
  if (G.mode === '3d') { setupMatch3d(); lockPointer(); }
}
function toMenu() {
  G.state = 'menu'; G.phase = 'idle'; G.paused = false; G.player = null;
  closeShop(); showBoard(false); unlockPointer();
  $('#pause').hidden = true; $('#over').hidden = true; $('#menu').hidden = false;
  document.body.classList.remove('playing');
  renderXPCard();
}

segInit('#optMode', 'mode', applyMode);
segInit('#optSide', 'side');
segInit('#optDiff', 'diff');
const sensEl = $('#optSens');
sensEl.value = opts.sens;
$('#sensVal').textContent = Number(opts.sens).toFixed(1);
sensEl.addEventListener('input', () => { opts.sens = Number(sensEl.value); $('#sensVal').textContent = opts.sens.toFixed(1); saveSettings(); });
$('#btnStart').addEventListener('click', startGame);
$('#btnAgain').addEventListener('click', startGame);
$('#btnOverMenu').addEventListener('click', toMenu);
$('#btnResume').addEventListener('click', resumeGame);
$('#btnQuit').addEventListener('click', toMenu);
let resetArmed = 0;
$('#btnResetXP').addEventListener('click', e => {
  const b = e.currentTarget;
  if (Date.now() - resetArmed < 3000) { saveXP(0); renderXPCard(); b.textContent = '经验已清零'; resetArmed = 0; return; }
  resetArmed = Date.now(); b.textContent = '再点一次确认清零';
  setTimeout(() => { if (Date.now() - resetArmed >= 3000) b.textContent = '清空经验'; }, 3100);
});
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
  document.querySelectorAll('.tab').forEach(t => { t.hidden = t.dataset.tab !== b.dataset.tab; });
}));
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) $('#touchNote').hidden = false;

/* ---------- 主循环 ---------- */
let lastT = performance.now(), boardT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (G.state === 'game' && !G.paused) update(dt);
  updateCamera(dt);
  render();
  if (shopOpen) { const t = $('#shopTimer'); const s = `剩 ${Math.ceil(G.timer)} 秒`; if (t.textContent !== s) t.textContent = s; }
  if (boardOpen && (boardT += dt) > 0.3) { boardT = 0; renderBoard(); }
  requestAnimationFrame(frame);
}

resize();
buildMinimap();
renderXPCard();
renderWeaponTable();
applyMode();
const schem = $('#mapSchematic');
const drawSchem = () => { schem.width = 1200; schem.height = 720; drawSchematic(schem); };
drawSchem();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSchem);
requestAnimationFrame(frame);

/* 调试入口：控制台里可以用 __game 查看状态 */
window.__game = G;
