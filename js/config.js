/* =========================================================
   航天基地爆破战 · 规则与数值配置
   所有可调数值都集中在这里，改完刷新页面即可生效。
   注释里的「原」= 最初版规则里的数值。
   ========================================================= */

const CFG = {
  TILE: 40,                 // 一格 = 40 像素
  MAP_W: 60, MAP_H: 36,     // 地图 60×36 格

  TEAM_SIZE: 12,            // 12V12
  MAX_ROUNDS: 9,            // 9 局 5 胜（原 7 局 5 胜：可能打满 7 局还是 4:3，没人到 5 分）
  WIN_TARGET: 5,
  HALFTIME_AFTER: 4,        // 第 4 局结束后换边（新增）

  BUY_TIME: 10,             // 购买阶段（新增）
  ROUND_TIME: 45,           // 单局时长
  SPIKE_TIME: 20,           // 炸弹安放后的独立倒计时（原：跟着 45 秒走，最后 5 秒内种下就拆不掉）
  ROUND_END_TIME: 4.5,
  HALFTIME_TIME: 4,

  PLANT_TIME: 5,            // 安放读条
  DEFUSE_TIME: 5,           // 拆除读条
  DEFUSE_RANGE: 60,         // 离炸弹多近才能拆
  SPIKE_BLAST: 340,         // 炸弹引爆的杀伤半径

  START_MONEY: 800,         // 首局和换边后的金钱
  MONEY_CAP: 9000,
  MONEY_WIN: 3000,          // 金钱跨局累积（原：每局重置 800，连最便宜的护甲都买不起）
  MONEY_LOSE: 1900,
  MONEY_KILL: 200,
  MONEY_OBJECTIVE: 300,     // 安放 / 拆除

  XP_WIN: 800,              // 原 4000：两局就全解锁，阶段门槛形同虚设
  XP_LOSE: 380,             // 原 1900
  XP_KILL: 100,             // 原 250
  XP_OBJECTIVE: 100,        // 安放 / 拆除（新增）

  HP: 100,
  RADIUS: 14,               // 人物半径（像素）
  HEAD_RATIO: 0.38,         // 头部判定圆 = 身体半径 × 0.38；子弹穿过中心小圆、且开枪时准星收拢 = 爆头
  HEADSHOT_MULT: 2,         // 爆头伤害倍率

  BASE_SPEED: 215,          // 基础移速 像素/秒，再乘武器的移速系数
  WALK_MULT: 0.5,           // Shift 静步
  SCOPE_MOVE_MULT: 0.6,     // 狙击开镜移动
  SWITCH_TIME: 0.35,        // 切枪时间

  FRAG:  { price: 300, max: 1, fuse: 1.6, radius: 170, damage: 110 },
  SMOKE: { price: 200, max: 1, fuse: 1.1, radius: 115, duration: 10 },
};

/* 经验阶段：经验永久保存，达到门槛才能买对应装备 */
const STAGES = [
  { xp: 0,    name: '新兵',    color: '#9aa6b8' },
  { xp: 2000, name: '阶段1 绿', color: '#4fd27a' },
  { xp: 2500, name: '阶段2 蓝', color: '#4f9bff' },
  { xp: 3000, name: '阶段3 紫', color: '#b06cff' },
  { xp: 4000, name: '阶段4',   color: '#ff7a45' },
  { xp: 6000, name: '阶段5 金', color: '#ffc83d' },
];

/* 子弹等级 = 破甲系数：打在护甲/头盔上时，对护甲造成的伤害倍率 */
const AMMO = {
  1: { name: '普通弹', armorMult: 0.75 },
  3: { name: '三级弹', armorMult: 1.0 },
  4: { name: '四级弹', armorMult: 1.5 },
  5: { name: '秒杀弹', armorMult: 1.0 },
};

/* 武器表
   dmg 基础伤害 · rpm 射速(发/分) · mag 弹匣 · reserve 备弹（弹匣+备弹 = 原规则的弹药总数）
   reload 换弹秒数 · move 移速系数 · spread 基础散布(度) · moveSpread 跑动散布 · bloom 每发扩散 */
const WEAPONS = {
  classic: { name: 'Classic', type: '手枪', stage: 0, price: 0, ammo: 1, dmg: 12, rpm: 240, mag: 12, reserve: 36, reload: 1.2, move: 1.0,
    spread: 1.4, moveSpread: 3.5, bloom: 1.2, bloomMax: 6, recover: 10, auto: false, range: 950, len: 12, note: '弹药 12 → 弹匣 12 + 备弹 36' },
  uzi: { name: 'UZI', type: '冲锋枪', stage: 1, price: 900, ammo: 3, dmg: 18, rpm: 450, mag: 30, reserve: 270, reload: 1.7, move: 0.97,
    spread: 2.4, moveSpread: 3, bloom: 0.55, bloomMax: 6, recover: 9, auto: true, range: 900, len: 17, note: '射速 200 → 450' },
  m249: { name: 'M249', type: '轻机枪', stage: 2, price: 2600, ammo: 3, dmg: 31, rpm: 521, mag: 100, reserve: 200, reload: 4.5, move: 0.78,
    spread: 2.2, moveSpread: 6, bloom: 0.32, bloomMax: 7, recover: 7, auto: true, range: 1200, len: 26 },
  ump45: { name: 'UMP45', type: '冲锋枪', stage: 3, price: 1600, ammo: 3, dmg: 45, rpm: 400, mag: 25, reserve: 275, reload: 2.0, move: 0.95,
    spread: 1.9, moveSpread: 3, bloom: 0.6, bloomMax: 6, recover: 9, auto: true, range: 1000, len: 19, note: '射速 211 → 400' },
  bison: { name: '野牛', type: '冲锋枪', stage: 3, price: 1800, ammo: 3, dmg: 51, rpm: 380, mag: 50, reserve: 150, reload: 2.4, move: 0.94,
    spread: 2.1, moveSpread: 3.2, bloom: 0.55, bloomMax: 6, recover: 9, auto: true, range: 1000, len: 20, note: '射速 211 → 380' },
  svd: { name: 'SVD', type: '狙击枪', stage: 3, price: 2700, ammo: 4, dmg: 96, rpm: 100, mag: 10, reserve: 10, reload: 2.6, move: 0.85,
    spread: 7, scopeSpread: 0.25, moveSpread: 6, bloom: 1.5, bloomMax: 4, recover: 6, auto: false, sniper: true, range: 1700, len: 30 },
  g18: { name: 'G18', type: '手枪', stage: 3, price: 1100, ammo: 3, dmg: 26, rpm: 600, mag: 20, reserve: 280, reload: 1.5, move: 1.0,
    spread: 2.6, moveSpread: 2.5, bloom: 0.7, bloomMax: 7, recover: 10, auto: true, range: 850, len: 13, note: '射速 1182 → 600' },
  m7: { name: 'M7', type: '突击步枪', stage: 4, price: 2900, ammo: 4, dmg: 71, rpm: 400, mag: 30, reserve: 270, reload: 2.3, move: 0.9,
    spread: 0.9, moveSpread: 5, bloom: 0.75, bloomMax: 6, recover: 9, auto: true, range: 1400, len: 24 },
  awm: { name: 'AWM', type: '狙击枪', stage: 5, price: 4700, ammo: 5, dmg: 999, rpm: 100, bolt: 1.0, mag: 5, reserve: 15, reload: 3.0, move: 0.8,
    spread: 9, scopeSpread: 0.1, moveSpread: 7, bloom: 0, bloomMax: 0, recover: 6, auto: false, sniper: true, oneShot: true, range: 1900, len: 34,
    note: '命中即秒杀，无视护甲；开枪后额外 1 秒拉栓' },
};
const WEAPON_ORDER = ['classic', 'uzi', 'm249', 'ump45', 'bison', 'svd', 'g18', 'm7', 'awm'];

/* 护甲只挡身体伤害，头盔只挡爆头伤害；每局开局清零，需要重新购买 */
const ARMORS = [
  { id: 'a1', name: '绿色护甲', stage: 1, value: 30, price: 1500 },
  { id: 'a2', name: '蓝色护甲', stage: 2, value: 40, price: 2000 },
  { id: 'a3', name: '紫色护甲', stage: 3, value: 50, price: 2500 },
  { id: 'a5', name: '金色护甲', stage: 5, value: 60, price: 3500 },
];
const HELMETS = [
  { id: 'h1', name: '绿色头盔', stage: 1, value: 10, price: 500 },
  { id: 'h2', name: '蓝色头盔', stage: 2, value: 15, price: 800 },
  { id: 'h3', name: '紫色头盔', stage: 3, value: 20, price: 1200 },
  { id: 'h5', name: '金色头盔', stage: 5, value: 25, price: 1800 },
];

/* 机器人难度（headAim = 每次交火瞄头的概率，其余时候瞄身体） */
const DIFF = {
  easy:   { label: '简单', reaction: 0.55, errStart: 46, errDecay: 1.3, errFloor: 9,   turn: 6.5, fov: 190, vision: 850,  nadeRate: 0.15, headAim: 0.08 },
  normal: { label: '普通', reaction: 0.38, errStart: 34, errDecay: 1.9, errFloor: 5.5, turn: 9,   fov: 210, vision: 950,  nadeRate: 0.3,  headAim: 0.15 },
  hard:   { label: '困难', reaction: 0.25, errStart: 24, errDecay: 2.7, errFloor: 3,   turn: 13,  fov: 230, vision: 1050, nadeRate: 0.45, headAim: 0.25 },
};
const BOT_TIER = { classic: 0, uzi: 1, g18: 2.4, m249: 2.8, ump45: 3, svd: 3.1, bison: 3.4, m7: 5, awm: 6 };

const PALETTE = {
  void: '#05080d', floor: '#0f1620', border: '#0b111b',
  fg: '#e7eef8', muted: '#8b98ae', line: '#253350',
  ally: '#3fd8c8', allyDark: '#14544f', enemy: '#ff5e5b', enemyDark: '#5e1e20',
  spike: '#ffc93c', warn: '#ffb03b',
};

const NAMES = ['雷鸣', '夜枭', '北斗', '银河', '天狼', '星火', '极光', '疾风', '磐石', '猎户', '流星', '霜刃',
  '赤焰', '苍穹', '墨影', '白鲸', '惊蛰', '青锋', '玄武', '朱雀', '长庚', '启明', '织女'];

/* =========================================================
   地图：航天基地（坐标单位 = 格，[x, y, 宽, 高]）
   左边宿舍区是进攻方出生点，右边发射区是防守方出生点
   ========================================================= */
const REGIONS = [
  { name: '宿舍区',    code: '进攻方出生点',     rect: [1, 1, 9, 34],   tint: '#121b2b' },
  { name: '外围野区',  code: '北侧绕道',         rect: [11, 1, 25, 6],  tint: '#101a15' },
  { name: 'H2 浮力室', code: '通往 A 小道',      rect: [11, 8, 25, 7],  tint: '#0c1b27' },
  { name: '中控桥',    code: '中路',             rect: [11, 16, 25, 4], tint: '#161a25' },
  { name: 'H3 离心机', code: '通往 B',           rect: [11, 21, 25, 7], tint: '#181528' },
  { name: '外围野区',  code: '南侧绕道',         rect: [11, 29, 25, 6], tint: '#101a15' },
  { name: 'H4 黑室',   code: 'A 包点',           rect: [37, 1, 10, 13], tint: '#0a0b10' },
  { name: '总裁室',    code: '中转',             rect: [37, 15, 10, 6], tint: '#1c1713' },
  { name: 'H1 蓝室',   code: 'B 包点 · 未开放',  rect: [37, 22, 10, 13], tint: '#0b1630' },
  { name: '发射区',    code: '防守方出生点',     rect: [48, 1, 11, 34], tint: '#18140e' },
];

/* 4 组固定墙体：子弹打不穿，人走不过 */
const WALL_GROUPS = [
  { name: '墙组① 宿舍区与外围隔墙', color: '#2f405a', rects: [
    [10, 1, 1, 2], [10, 6, 1, 4], [10, 12, 1, 4], [10, 20, 1, 4], [10, 26, 1, 4], [10, 33, 1, 2],
    [11, 7, 6, 1], [20, 7, 9, 1], [32, 7, 4, 1],
    [11, 28, 6, 1], [20, 28, 9, 1], [32, 28, 4, 1],
    [2, 3, 3, 1], [6, 3, 3, 1], [2, 32, 3, 1], [6, 32, 3, 1],
    [16, 10, 2, 2], [26, 11, 3, 2],
  ] },
  { name: '墙组② 中控桥护栏与总裁室', color: '#38445e', rects: [
    [11, 15, 3, 1], [16, 15, 8, 1], [27, 15, 9, 1],
    [11, 20, 3, 1], [16, 20, 8, 1], [27, 20, 9, 1],
    [36, 15, 1, 2], [36, 19, 1, 2], [47, 15, 1, 2], [47, 19, 1, 2],
    [44, 19, 2, 1],
    [51, 6, 2, 1], [51, 29, 2, 1],
    { rect: [53, 16, 3, 3], shape: 'rocket' },
  ] },
  { name: '墙组③ H4 黑室（A 包点）围墙', color: '#45395a', rects: [
    [36, 1, 1, 2], [36, 6, 1, 4], [36, 13, 1, 2],
    [37, 14, 3, 1], [43, 14, 4, 1],
    [47, 1, 1, 5], [47, 9, 1, 6],
    [40, 5, 2, 2], [44, 10, 2, 2], [38, 9, 1, 1],
  ] },
  { name: '墙组④ H1 蓝室（B 包点）与 H3 离心机', color: '#2f4a63', rects: [
    [36, 21, 4, 1], [43, 21, 5, 1],
    [36, 22, 1, 2], [36, 27, 1, 3], [36, 33, 1, 2],
    [47, 22, 1, 4], [47, 29, 1, 6],
    [40, 25, 2, 2], [43, 30, 2, 2],
    { rect: [22, 23, 3, 3], shape: 'round' },
    [30, 22, 2, 1],
  ] },
];

const PLANT_ZONE = [38, 3, 8, 9];   // A 包点：只有这里能安放炸弹
const B_ZONE = [38, 24, 8, 8];      // B 包点：地图上保留，暂不开放
const SPAWNS = { ATT: [2, 11, 7, 14], DEF: [50, 9, 8, 18] };

const DECOR = [
  { type: 'pool', rect: [12, 9, 3, 4] },
  { type: 'pool', rect: [20, 12, 4, 2] },
  { type: 'pad', at: [54.5, 17.5], r: 3.3 },
  { type: 'track', at: [23.5, 24.5], r: 2.7 },
];

/* 进攻方机器人的进攻路线（w = 选这条路的权重） */
const ATT_ROUTES = [
  { name: '北路 · A 大门',   w: 3, via: [[22, 4], [34, 4]] },
  { name: 'H2 · A 小道',     w: 3, via: [[21, 9], [34, 11]] },
  { name: '中路 · 总裁室',   w: 4, via: [[24, 18], [39, 18], [41, 15]] },
  { name: '南路 · 绕 B',     w: 1, via: [[22, 31], [37, 31], [42, 23], [41, 19]] },
];

/* 防守方机器人的站位（at 站点，look 盯的方向） */
const DEF_HOLDS = [
  { at: [39, 4],  look: [36, 4] },
  { at: [44, 3],  look: [36, 4] },
  { at: [42, 8],  look: [41, 14] },
  { at: [39, 11], look: [36, 11] },
  { at: [45, 9],  look: [41, 14] },
  { at: [43, 12], look: [36, 11] },
  { at: [45, 17], look: [36, 17] },
  { at: [39, 19], look: [41, 21] },
  { at: [33, 4],  look: [20, 3] },
  { at: [33, 12], look: [20, 11] },
  { at: [34, 18], look: [20, 17] },
  { at: [44, 28], look: [37, 31] },
];

/* A 包点的几个入口：守包时盯这些方向 */
const A_WATCH = [[48, 7], [41, 15], [36, 4], [36, 11]];
