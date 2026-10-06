'use strict';
/* =========================================================
   航天基地爆破战 · 3D 第一人称画面（Three.js r128）
   规则、机器人、伤害判定都用同一套引擎，这里只负责把同一个世界画成 3D。
   坐标换算：引擎的 (x, y) 像素 → 3D 的 (X, Z) 米，Y 轴朝上。
   ========================================================= */

const S3 = VIEW3D.S;
const MAP_X = MW * TILE * S3, MAP_Z = MH * TILE * S3;
const CENTER3 = { x: MAP_X / 2, z: MAP_Z / 2 };
const ACCENT3 = [0x45d6ff, 0x9bb8ff, 0xc08bff, 0x4f9bff];   // 4 组墙的灯带颜色
let T3 = null;

/* ---------- 工具 ---------- */
function liftColor(hex, k) {
  const c = new THREE.Color(hex);
  return c.setRGB(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(8, T3.renderer.capabilities.getMaxAnisotropy());
  return t;
}
function repeatTex(t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}
/* 盒子六个面的贴图按真实尺寸重复，墙再长花纹也不拉伸 */
function boxUV(geo, w, h, d, unit) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / unit, uv.getY(k) * dims[f][1] / unit);
  }
  uv.needsUpdate = true;
}
function addBox(w, h, d, x, y, z, mat, shadow, parent) {
  const geo = new THREE.BoxGeometry(w, h, d);
  boxUV(geo, w, h, d, 2.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = !!shadow;
  (parent || T3.scene).add(mesh);
  return mesh;
}

/* ---------- 贴图（全部现场画） ---------- */
function panelTexture() {
  return repeatTex(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9cfd9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = (170 + Math.random() * 60) | 0;
      g.fillStyle = `rgba(${v},${v},${v + 10},0.3)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = 'rgba(28,36,50,0.85)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, 3, w, 2); g.fillRect(3, 0, 2, h);
    g.fillStyle = 'rgba(28,36,50,0.6)';
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
  }));
}
function wallTexture() {
  return repeatTex(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cdd3dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) {
      const v = (165 + Math.random() * 60) | 0;
      g.fillStyle = `rgba(${v},${v},${v + 8},0.28)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
    g.fillStyle = 'rgba(25,32,46,0.8)'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(0, h / 2 - 2, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 4, w, 2); g.fillRect(0, h / 2 + 1, w, 2);
    g.fillStyle = 'rgba(25,32,46,0.45)';
    for (let i = 0; i < 6; i++) g.fillRect(w * 0.62, h * 0.62 + i * 9, w * 0.26, 4);
  }));
}
function crateTexture() {
  return repeatTex(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d4d8df'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,38,52,0.75)'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.lineWidth = 9; g.beginPath(); g.moveTo(14, 14); g.lineTo(w - 14, h - 14); g.moveTo(w - 14, 14); g.lineTo(14, h - 14); g.stroke();
    g.fillStyle = 'rgba(255,190,60,0.55)';
    for (let x = -h; x < w; x += 36) { g.beginPath(); g.moveTo(x, h - 4); g.lineTo(x + 18, h - 4); g.lineTo(x + 30, h - 18); g.lineTo(x + 12, h - 18); g.fill(); }
  }));
}
function glowTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}
function smokeTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 14; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.4, y = h / 2 + (Math.random() - 0.5) * h * 0.4, r = w * (0.22 + Math.random() * 0.2);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.32)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
  });
}
function zoneTexture(rect, color, letter, sub) {
  const W = 512, H = Math.round(512 * rect[3] / rect[2]);
  return canvasTex(W, H, g => {
    g.strokeStyle = color; g.globalAlpha = 0.24; g.lineWidth = 20;
    g.beginPath();
    for (let x = -H; x < W; x += 64) { g.moveTo(x, H); g.lineTo(x + H, 0); }
    g.stroke();
    g.globalAlpha = 0.85; g.lineWidth = 9; g.setLineDash([40, 24]); g.strokeRect(10, 10, W - 20, H - 20); g.setLineDash([]);
    g.globalAlpha = 0.5; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(H * 0.5)}px "ZCOOL QingKe HuangYou", "PingFang SC", sans-serif`;
    g.fillText(letter, W / 2, H * 0.46);
    if (sub) { g.globalAlpha = 0.7; g.font = '600 34px "Chakra Petch", "PingFang SC", sans-serif'; g.fillText(sub, W / 2, H * 0.8); }
  });
}
function labelTexture(name, code) {
  return canvasTex(512, 168, (g, w) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(80,170,255,0.9)'; g.shadowBlur = 18;
    g.fillStyle = '#e4eeff'; g.font = '76px "ZCOOL QingKe HuangYou", "PingFang SC", sans-serif'; g.fillText(name, w / 2, 62);
    g.shadowBlur = 8; g.fillStyle = 'rgba(190,210,240,0.95)'; g.font = '600 32px "Chakra Petch", "PingFang SC", sans-serif'; g.fillText(code, w / 2, 134);
  });
}
function letterTexture(letter, color) {
  return canvasTex(256, 256, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 30;
    g.fillStyle = color; g.font = '210px "ZCOOL QingKe HuangYou", "PingFang SC", sans-serif';
    g.fillText(letter, w / 2, h / 2 + 8);
  });
}
function planetTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1b3a6b'); grd.addColorStop(0.45, '#2f74a8'); grd.addColorStop(0.6, '#3f9bb8'); grd.addColorStop(1, '#173257');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(230,240,255,${0.08 + Math.random() * 0.2})`;
      g.beginPath(); g.ellipse(Math.random() * w, h * (0.15 + Math.random() * 0.7), 20 + Math.random() * 70, 3 + Math.random() * 7, 0, 0, TAU); g.fill();
    }
  });
}

/* ---------- 初始化 ---------- */
function init3d() {
  if (T3) return T3;
  if (!window.THREE) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view3d'), antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  const camera = new THREE.PerspectiveCamera(VIEW3D.FOV, 1, 0.1, 1400);
  camera.rotation.order = 'YXZ';
  T3 = {
    renderer, camera, scene: new THREE.Scene(),
    vmScene: new THREE.Scene(), vmCam: new THREE.PerspectiveCamera(64, 1, 0.01, 10),
    soldiers: [], dropModels: new Map(), spinners: [], blinkers: [], labels: [],
    tmp: new THREE.Vector3(), lastT: 0,
  };
  T3.glowTex = glowTexture();
  T3.smokeTex = smokeTexture();
  buildWorld3d();
  buildViewmodel3d();
  buildPools3d();
  resize3d();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshLabels3d);
  return T3;
}
function resize3d() {
  if (!T3 || !CW || !CH) return;
  T3.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  T3.renderer.setSize(CW, CH, false);
  T3.camera.aspect = T3.vmCam.aspect = CW / CH;
  T3.camera.updateProjectionMatrix(); T3.vmCam.updateProjectionMatrix();
}

/* ---------- 地图 ---------- */
function floorPlane(rect, color, tex) {
  const [x, y, w, h] = rect, W = w * TILE * S3, H = h * TILE * S3;
  const geo = new THREE.PlaneGeometry(W, H);
  scaleUV(geo, W / 2.5, H / 2.5);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.85, metalness: 0.15 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x + w / 2) * TILE * S3, 0, (y + h / 2) * TILE * S3);
  mesh.receiveShadow = true;
  T3.scene.add(mesh);
  return mesh;
}
function decal(rect, map, opts = {}) {
  const [x, y, w, h] = rect;
  const mat = new THREE.MeshStandardMaterial({
    map, transparent: true, depthWrite: false, roughness: 0.9,
    emissive: opts.emissive || 0x000000, emissiveMap: opts.emissive ? map : null, emissiveIntensity: opts.glow || 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE * S3, h * TILE * S3), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x + w / 2) * TILE * S3, 0.01, (y + h / 2) * TILE * S3);
  mesh.receiveShadow = true;
  T3.scene.add(mesh);
  return mesh;
}
function buildWorld3d() {
  const { scene } = T3;
  scene.background = new THREE.Color(0x04070d);
  scene.fog = new THREE.Fog(0x0a1222, 26, 95);

  // 灯光：冷色月光 + 天空环境光，包点和发射台有暖色补光
  scene.add(new THREE.HemisphereLight(0x9ab6ff, 0x1a1f2b, 0.85));
  const moon = new THREE.DirectionalLight(0xd6e2ff, 0.9);
  moon.position.set(CENTER3.x - 30, 60, CENTER3.z - 40);
  moon.target.position.set(CENTER3.x, 0, CENTER3.z);
  moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 170 });
  moon.shadow.camera.updateProjectionMatrix();
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const pl = (color, intensity, dist, tx, ty, h) => { const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(tc(tx) * S3, h, tc(ty) * S3); scene.add(l); return l; };
  T3.siteLight = pl(0xffc93c, 1.3, 22, 42, 7, 4.2);
  pl(0xff9a50, 1.1, 22, 54, 17, 4);
  pl(0x7fb0ff, 0.7, 22, 23, 17.5, 3.4);
  pl(0x5f7dff, 0.6, 20, 42, 28, 3.6);

  // 地面：地图外是荒地，地图内按区域铺不同色调的金属地板
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(CENTER3.x, -0.03, CENTER3.z);
  scene.add(ground);
  const floorTex = panelTexture();
  floorPlane([0, 0, MW, MH], liftColor(PALETTE.floor, 2.4), floorTex).position.y = -0.005;
  for (const r of REGIONS) floorPlane(r.rect, liftColor(r.tint, 2.7), floorTex);

  // 包点地贴
  decal(PLANT_ZONE, zoneTexture(PLANT_ZONE, '#ffc93c', 'A', '炸弹安放区'), { emissive: 0xffc93c, glow: 0.35 });
  decal(B_ZONE, zoneTexture(B_ZONE, '#8f9bb5', 'B', '未开放'));

  // 装饰：水池、发射台光圈、离心机轨道
  for (const d of DECOR) {
    if (d.type === 'pool') {
      const [x, y, w, h] = d.rect;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE * S3 - 0.3, h * TILE * S3 - 0.3),
        new THREE.MeshStandardMaterial({ color: 0x1f6f9a, emissive: 0x0b3a55, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.position.set((x + w / 2) * TILE * S3, 0.04, (y + h / 2) * TILE * S3);
      scene.add(water); T3.water = (T3.water || []).concat(water);
    } else {
      const r = d.r * TILE * S3;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 64),
        new THREE.MeshBasicMaterial({ color: d.type === 'pad' ? 0xff9a40 : 0xa88cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(d.at[0] * TILE * S3, 0.03, d.at[1] * TILE * S3);
      scene.add(ring);
    }
  }

  // 4 组墙：高墙带一圈灯带，室内掩体是 2.2 米高的货箱
  const wallTex = wallTexture(), crateTex = crateTexture();
  WALL_GROUPS.forEach((g, gi) => {
    const wallMat = new THREE.MeshStandardMaterial({ color: liftColor(g.color, 1.7), map: wallTex, roughness: 0.75, metalness: 0.25 });
    const crateMat = new THREE.MeshStandardMaterial({ color: liftColor(g.color, 2.1), map: crateTex, roughness: 0.7, metalness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: ACCENT3[gi] });
    g.rects.forEach(r => {
      const [x, y, w, h] = rectOf(r);
      const W = w * TILE * S3, D = h * TILE * S3, X = (x + w / 2) * TILE * S3, Z = (y + h / 2) * TILE * S3;
      if (r.shape === 'rocket') return buildRocket(X, Z, W);
      if (r.shape === 'round') return buildCentrifuge(X, Z, W, wallMat, glowMat);
      const crate = r.shape === 'crate';
      const H = crate ? VIEW3D.CRATE_H : VIEW3D.WALL_H;
      addBox(W, H, D, X, H / 2, Z, crate ? crateMat : wallMat, true);
      if (!crate) addBox(W + 0.04, 0.09, D + 0.04, X, H - 0.45, Z, glowMat, false);
    });
  });
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, map: wallTex, roughness: 0.8, metalness: 0.2 });
  const bh = VIEW3D.WALL_H + 1.5, t = TILE * S3;
  addBox(MAP_X, bh, t, CENTER3.x, bh / 2, t / 2, borderMat, true);
  addBox(MAP_X, bh, t, CENTER3.x, bh / 2, MAP_Z - t / 2, borderMat, true);
  addBox(t, bh, MAP_Z, t / 2, bh / 2, CENTER3.z, borderMat, true);
  addBox(t, bh, MAP_Z, MAP_X - t / 2, bh / 2, CENTER3.z, borderMat, true);

  // 区域全息标牌 + A 点大字
  for (const r of REGIONS) {
    const [x, y, w, h] = r.rect;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(r.name, r.code), transparent: true, depthWrite: false, opacity: 0.6 }));
    sp.scale.set(5.2, 5.2 * 168 / 512, 1);
    sp.position.set((x + w / 2) * TILE * S3, 3.3, (y + Math.min(h / 2, 2.6)) * TILE * S3);
    scene.add(sp);
    T3.labels.push({ sprite: sp, make: () => labelTexture(r.name, r.code) });
  }
  const aHolo = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture('A', '#ffc93c'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  aHolo.scale.set(3.2, 3.2, 1);
  aHolo.position.set((PLANT_ZONE[0] + PLANT_ZONE[2] / 2) * TILE * S3, 6.2, (PLANT_ZONE[1] + PLANT_ZONE[3] / 2) * TILE * S3);
  scene.add(aHolo);
  T3.aHolo = aHolo;
  T3.labels.push({ sprite: aHolo, make: () => letterTexture('A', '#ffc93c') });

  buildSky3d();
}
function refreshLabels3d() {
  if (!T3) return;
  for (const l of T3.labels) { l.sprite.material.map.dispose(); l.sprite.material.map = l.make(); l.sprite.material.needsUpdate = true; }
}
function buildRocket(X, Z, size) {
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.6, metalness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.45, metalness: 0.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc94f3a, roughness: 0.5 });
  addBox(size, 2.6, size, 0, 1.3, 0, metal, true, g);
  addBox(size + 0.04, 0.09, size + 0.04, 0, 2.15, 0, new THREE.MeshBasicMaterial({ color: 0xffa04a }), false, g);
  const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  part(new THREE.CylinderGeometry(1.05, 1.15, 14, 28), white, 2.6 + 7);
  part(new THREE.CylinderGeometry(1.08, 1.08, 0.5, 28), red, 2.6 + 3);
  part(new THREE.CylinderGeometry(1.08, 1.08, 0.5, 28), red, 2.6 + 10.5);
  part(new THREE.ConeGeometry(1.05, 3.4, 28), white, 2.6 + 14 + 1.7);
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 1.2), red);
    const a = k * Math.PI / 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * 1.25, 2.6 + 1.3, Math.sin(a) * 1.25);
    fin.rotation.y = -a; fin.castShadow = true; g.add(fin);
  }
  // 发射塔 + 顶端闪烁的红灯
  addBox(0.5, 18, 0.5, size / 2 - 0.3, 2.6 + 9, size / 2 - 0.3, metal, true, g);
  const lamp = part(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 2.6 + 18.3);
  lamp.position.x = lamp.position.z = size / 2 - 0.3;
  T3.blinkers.push(lamp);
  T3.scene.add(g);
}
function buildCentrifuge(X, Z, size, mat, glowMat) {
  addBox(size, 2.6, size, X, 1.3, Z, mat, true);
  addBox(size + 0.04, 0.09, size + 0.04, X, 2.15, Z, glowMat, false);
  const drum = new THREE.Group();
  drum.position.set(X, 2.6, Z);
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b6f99, roughness: 0.4, metalness: 0.6 });
  const pod = new THREE.MeshStandardMaterial({ color: 0x8a7cff, emissive: 0x5a3fd0, emissiveIntensity: 0.8, roughness: 0.4 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 16), metal); hub.position.y = 0.6; drum.add(hub);
  for (let k = 0; k < 3; k++) {
    const arm = new THREE.Group(); arm.rotation.y = k * TAU / 3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.18), metal); bar.position.set(0.75, 0.8, 0); arm.add(bar);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), pod); p.position.set(1.55, 0.8, 0); p.castShadow = true; arm.add(p);
    drum.add(arm);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.05, 8, 48), glowMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.8; drum.add(ring);
  T3.scene.add(drum);
  T3.spinners.push(drum);
}
function buildSky3d() {
  const { scene } = T3;
  const N = 2200, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * TAU, el = Math.asin(0.03 + Math.random() * 0.95), r = 760;
    pos[i * 3] = CENTER3.x + Math.cos(u) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = CENTER3.z + Math.sin(u) * Math.cos(el) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false })));
  const planet = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32),
    new THREE.MeshStandardMaterial({ map: planetTexture(), emissive: 0x0d2244, emissiveIntensity: 0.6, roughness: 1, fog: false }));
  planet.position.set(CENTER3.x + 360, 70, CENTER3.z - 560);
  planet.rotation.z = 0.35;
  scene.add(planet);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T3.glowTex, color: 0x4f9bff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(420, 420, 1); halo.position.copy(planet.position);
  scene.add(halo);
}

/* ---------- 武器模型（机器人手里、地上、第一人称共用） ---------- */
const GUN_TPL = {};
let GUN_MAT = null;
function gunMaterials() {
  if (GUN_MAT) return GUN_MAT;
  GUN_MAT = {
    metal: new THREE.MeshStandardMaterial({ color: 0x2f3744, roughness: 0.45, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.8, metalness: 0.2 }),
    accent: STAGES.map(s => new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.15, roughness: 0.5 })),
  };
  return GUN_MAT;
}
function buildGun(id) {
  const d = WEAPONS[id], M = gunMaterials(), acc = M.accent[d.stage];
  const g = new THREE.Group();
  const box = (w, h, dz, x, y, mat, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), mat);
    m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = true; g.add(m); return m;
  };
  let muzzle = 0.2;
  if (d.type === '手枪') {
    box(0.2, 0.055, 0.035, 0.05, 0.02, M.metal); box(0.05, 0.12, 0.032, -0.02, -0.05, M.dark, 0.25); box(0.12, 0.012, 0.038, 0.06, 0.05, acc);
    muzzle = 0.15;
  } else if (d.type === '冲锋枪') {
    box(0.34, 0.08, 0.05, 0.05, 0, M.metal); box(0.12, 0.03, 0.03, 0.27, 0.01, M.dark); box(0.04, 0.16, 0.035, 0.1, -0.11, M.dark);
    box(0.04, 0.1, 0.035, -0.04, -0.07, M.dark, 0.2); box(0.13, 0.05, 0.03, -0.18, 0, M.dark); box(0.2, 0.012, 0.052, 0.05, 0.045, acc);
    muzzle = 0.33;
  } else if (d.type === '轻机枪') {
    box(0.5, 0.11, 0.07, 0.05, 0, M.metal); box(0.32, 0.035, 0.035, 0.45, 0.02, M.dark); box(0.13, 0.12, 0.1, 0.06, -0.11, M.dark);
    box(0.05, 0.11, 0.04, -0.12, -0.08, M.dark, 0.2); box(0.18, 0.08, 0.04, -0.28, -0.01, M.dark); box(0.3, 0.014, 0.072, 0.05, 0.06, acc);
    muzzle = 0.61;
  } else if (d.type === '突击步枪') {
    box(0.46, 0.08, 0.05, 0.05, 0, M.metal); box(0.22, 0.03, 0.03, 0.38, 0.01, M.dark); box(0.05, 0.17, 0.035, 0.1, -0.11, M.dark, -0.18);
    box(0.04, 0.1, 0.035, -0.06, -0.07, M.dark, 0.2); box(0.18, 0.07, 0.04, -0.26, -0.01, M.dark); box(0.1, 0.035, 0.03, 0.04, 0.06, M.dark);
    box(0.28, 0.012, 0.052, 0.08, 0.045, acc);
    muzzle = 0.49;
  } else {
    box(0.7, 0.07, 0.05, 0.08, 0, M.metal); box(0.36, 0.026, 0.026, 0.6, 0.01, M.dark); box(0.04, 0.1, 0.035, -0.06, -0.07, M.dark, 0.2);
    box(0.24, 0.09, 0.045, -0.36, -0.01, M.dark); box(0.4, 0.012, 0.052, 0.1, 0.04, acc);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.28, 12), M.dark);
    scope.rotation.z = Math.PI / 2; scope.position.set(0.08, 0.075, 0); g.add(scope);
    muzzle = 0.78;
  }
  g.userData.muzzle = muzzle;
  return g;
}
function gunModel(id) {
  if (!GUN_TPL[id]) GUN_TPL[id] = buildGun(id);
  return GUN_TPL[id].clone();
}

/* ---------- 人物 ---------- */
let SOLDIER_GEO = null;
function soldierGeo() {
  if (SOLDIER_GEO) return SOLDIER_GEO;
  const leg = new THREE.BoxGeometry(0.17, 0.84, 0.19);
  leg.translate(0, -0.42, 0);                       // 绕髋关节摆腿
  SOLDIER_GEO = {
    leg,
    torso: new THREE.BoxGeometry(0.3, 0.6, 0.5),
    vest: new THREE.BoxGeometry(0.36, 0.44, 0.55),
    head: new THREE.SphereGeometry(0.15, 18, 14),
    helm: new THREE.SphereGeometry(0.168, 18, 10, 0, TAU, 0, Math.PI / 2),
    visor: new THREE.BoxGeometry(0.05, 0.06, 0.2),
    arm: new THREE.BoxGeometry(0.42, 0.09, 0.09),
    pack: new THREE.BoxGeometry(0.16, 0.3, 0.28),
    stripe: new THREE.BoxGeometry(0.02, 0.06, 0.46),
  };
  return SOLDIER_GEO;
}
function makeSoldier(a) {
  const ge = soldierGeo();
  const ally = a.team === 0;                        // 0 号队伍永远是玩家这边
  const team = ally ? 0x3fd8c8 : 0xff5e5b;
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: ally ? 0x2d6b70 : 0x7a3236, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d232d, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x3b4352, roughness: 0.6 }),
    vest: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.55, metalness: 0.35 }),
    helm: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.45, metalness: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ color: team }),
    pack: new THREE.MeshBasicMaterial({ color: 0xffc93c }),
  };
  const root = new THREE.Group();
  root.rotation.order = 'YZX';
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, mat, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const hipL = new THREE.Group(); hipL.position.set(0, 0.86, 0.11); body.add(hipL); mk(ge.leg, mats.dark, 0, 0, 0, hipL);
  const hipR = new THREE.Group(); hipR.position.set(0, 0.86, -0.11); body.add(hipR); mk(ge.leg, mats.dark, 0, 0, 0, hipR);
  mk(ge.torso, mats.suit, 0, 1.16, 0);
  mk(ge.stripe, mats.glow, 0.16, 1.32, 0);
  const vest = mk(ge.vest, mats.vest, 0, 1.13, 0);
  mk(ge.head, mats.skin, 0, 1.6, 0);
  mk(ge.visor, mats.glow, 0.13, 1.62, 0);
  const helm = mk(ge.helm, mats.helm, 0, 1.61, 0);
  mk(ge.arm, mats.suit, 0.2, 1.3, 0.18).rotation.y = 0.35;
  mk(ge.arm, mats.suit, 0.26, 1.28, -0.06).rotation.y = -0.25;
  const gun = new THREE.Group(); gun.position.set(0.36, 1.31, 0.06); body.add(gun);
  const pack = mk(ge.pack, mats.pack, -0.22, 1.2, 0);
  return { root, body, hipL, hipR, vest, helm, gun, pack, mats, agent: a, gunId: null, phase: 0, fall: 0, armorStage: -1, helmetStage: -1 };
}
/* 每场比赛开局时按当前 24 个人重建模型 */
function setupMatch3d() {
  if (!T3) return;
  for (const s of T3.soldiers) T3.scene.remove(s.root);
  T3.soldiers = G.agents.map(makeSoldier);
  for (const s of T3.soldiers) T3.scene.add(s.root);
  for (const [, mdl] of T3.dropModels) T3.scene.remove(mdl);
  T3.dropModels.clear();
}
function syncSoldiers(dt, hide) {
  const S = G.spike, inGame = G.state === 'game';
  for (const s of T3.soldiers) {
    const a = s.agent;
    s.root.visible = inGame && a !== hide;
    if (!s.root.visible) continue;
    s.root.position.set(a.x * S3, 0, a.y * S3);
    s.root.rotation.y = -a.angle;
    if (a.alive) {
      s.fall = 0; s.root.rotation.z = 0; s.root.position.y = 0;
      const sp = a.speedNow * S3;
      s.phase += dt * sp * 2.6;
      const swing = sp > 0 ? Math.sin(s.phase) * Math.min(0.7, sp / 8) : 0;
      s.hipL.rotation.z = swing; s.hipR.rotation.z = -swing;
      s.body.scale.y = a.action ? 0.72 : 1;         // 安放 / 拆弹时蹲下
    } else {
      s.fall = Math.min(1, s.fall + dt * 3.5);       // 阵亡：向后倒地
      s.root.rotation.z = s.fall * Math.PI / 2; s.root.position.y = s.fall * 0.17;
      s.hipL.rotation.z = s.hipR.rotation.z = 0; s.body.scale.y = 1;
    }
    s.vest.visible = a.alive && a.armor > 0;
    if (s.vest.visible && s.armorStage !== a.armorStage) { s.mats.vest.color.set(STAGES[a.armorStage].color); s.armorStage = a.armorStage; }
    s.helm.visible = a.alive && a.helmet > 0;
    if (s.helm.visible && s.helmetStage !== a.helmetStage) { s.mats.helm.color.set(STAGES[a.helmetStage].color); s.helmetStage = a.helmetStage; }
    s.pack.visible = a.alive && !!S && S.state === 'carried' && S.carrier === a;
    const wid = a.alive ? curW(a).id : null;
    if (wid !== s.gunId) { s.gun.clear(); if (wid) s.gun.add(gunModel(wid)); s.gunId = wid; }
    s.gun.rotation.z = a.alive ? a.pitch : 0;
  }
}

/* ---------- 第一人称手里的枪 ---------- */
function buildViewmodel3d() {
  const { vmScene } = T3;
  vmScene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202430, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(-1, 2, 1.5);
  vmScene.add(key);
  const root = new THREE.Group(), holder = new THREE.Group();
  root.add(holder);
  vmScene.add(root);
  const glove = new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.8 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2d6b70, roughness: 0.8 });
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), glove); hand.position.set(0.0, -0.07, 0.04); root.add(hand);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), sleeve); arm.position.set(0.04, -0.12, 0.22); arm.rotation.x = 0.35; root.add(arm);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: T3.glowTex, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.set(0.24, 0.24, 1);
  T3.vm = { root, holder, flash, gunId: null, kick: 0, lastShot: -9, bob: 0 };
}
function syncViewmodel(dt) {
  const p = G.player, vm = T3.vm;
  const show = G.state === 'game' && !!p && p.alive && !p.scoped;
  vm.root.visible = show;
  if (!show) return false;
  const w = curW(p), d = WEAPONS[w.id];
  if (vm.gunId !== w.id) {
    vm.holder.clear();
    const gm = gunModel(w.id);
    gm.rotation.y = Math.PI / 2;                    // 枪管朝向 -Z（镜头正前方）
    vm.flash.position.set(gm.userData.muzzle + 0.05, 0.01, 0);
    gm.add(vm.flash);
    vm.holder.add(gm);
    vm.gunId = w.id;
  }
  if (p.shotT !== vm.lastShot) { vm.lastShot = p.shotT; vm.kick = Math.min(1.4, vm.kick + (d.sniper ? 1.4 : 0.55)); }
  vm.kick = Math.max(0, vm.kick - dt * 7);
  const moving = p.speedNow > 0;
  vm.bob += dt * (moving ? (p.walking ? 6 : 10) : 2);
  const amp = moving ? (p.walking ? 0.006 : 0.014) : 0.003;
  let y = -0.19 + Math.abs(Math.sin(vm.bob)) * amp, rx = vm.kick * 0.09, rz = 0;
  if (p.reloadT > 0) { const s = Math.sin((1 - p.reloadT / d.reload) * Math.PI); y -= s * 0.12; rx -= s * 0.7; rz = s * 0.4; }
  if (p.switchT > 0) y -= (p.switchT / CFG.SWITCH_TIME) * 0.25;
  if (p.action) y -= 0.3;
  vm.root.position.set(0.17 + Math.cos(vm.bob) * amp, y, -0.5 + vm.kick * 0.05);
  vm.root.rotation.set(rx, 0, rz);
  vm.flash.visible = G.time - p.shotT < 0.05;
  vm.flash.material.rotation = Math.random() * TAU;
  return true;
}

/* ---------- 特效对象池 ---------- */
function buildPools3d() {
  const { scene } = T3;
  T3.tracers = [];
  const trGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 90; i++) {
    const mesh = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false; scene.add(mesh); T3.tracers.push(mesh);
  }
  T3.glows = [];
  for (let i = 0; i < 160; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T3.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.visible = false; scene.add(sp); T3.glows.push(sp);
  }
  T3.puffs = [];
  for (let i = 0; i < 90; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T3.smokeTex, color: 0xaab4c4, transparent: true, depthWrite: false }));
    sp.visible = false; scene.add(sp); T3.puffs.push(sp);
  }
  const fragMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3a, roughness: 0.6 });
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0xb8c2d0, roughness: 0.6 });
  const nadeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  T3.nades = [];
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(nadeGeo, fragMat);
    mesh.visible = false; mesh.castShadow = true; scene.add(mesh); T3.nades.push(mesh);
  }
  T3.nadeMats = { frag: fragMat, smoke: smokeMat };
  // 炸弹：六边形装置 + 地上的脉冲圈 + 闪烁红灯
  const spike = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.26, 6), new THREE.MeshStandardMaterial({ color: 0x2a2316, roughness: 0.5, metalness: 0.4 }));
  shell.position.y = 0.13; shell.castShadow = true; spike.add(shell);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  rim.position.y = 0.27; spike.add(rim);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
  lamp.position.y = 0.31; spike.add(lamp);
  spike.visible = false; scene.add(spike);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48), new THREE.MeshBasicMaterial({ color: 0xff5a40, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  T3.spike = spike; T3.spikeLamp = lamp; T3.spikeRing = ring;
  T3.spikeLight = new THREE.PointLight(0xff4030, 0, 9, 2); scene.add(T3.spikeLight);
  T3.boomLight = new THREE.PointLight(0xffa050, 0, 22, 2); scene.add(T3.boomLight);
  // 地上武器下面的光圈（按阶段颜色）
  T3.dropRingGeo = new THREE.RingGeometry(0.3, 0.38, 32);
  T3.dropRingMats = STAGES.map(s => new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
}

function syncEffects() {
  const cam = T3.camera, fp = T3.firstPerson;
  // 弹道：自己开的枪从第一人称枪口出发
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  cam.getWorldDirection(fwd);
  right.crossVectors(fwd, cam.up).normalize();
  up.crossVectors(right, fwd);
  let i = 0;
  for (const t of G.tracers) {
    if (i >= T3.tracers.length) break;
    const mesh = T3.tracers[i++];
    let sx = t.x1 * S3, sy = t.h1 * S3, sz = t.y1 * S3;
    if (t.own && fp) {
      sx = cam.position.x + fwd.x * 0.7 + right.x * 0.16 - up.x * 0.14;
      sy = cam.position.y + fwd.y * 0.7 + right.y * 0.16 - up.y * 0.14;
      sz = cam.position.z + fwd.z * 0.7 + right.z * 0.16 - up.z * 0.14;
    }
    const ex = t.x2 * S3, ey = t.h2 * S3, ez = t.y2 * S3;
    const len = Math.hypot(ex - sx, ey - sy, ez - sz);
    mesh.position.set((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2);
    mesh.lookAt(ex, ey, ez);
    const w = t.w * 0.012;
    mesh.scale.set(w, w, Math.max(0.01, len));
    mesh.material.color.set(t.team === G.player.team ? 0xfff2c8 : 0xffc0b0);
    mesh.material.opacity = 0.9 * (1 - t.t / t.life);
    mesh.visible = true;
  }
  for (; i < T3.tracers.length; i++) T3.tracers[i].visible = false;

  // 发光点：枪口火光、火花、命中、爆炸
  let g = 0, boom = null;
  const glow = (x, y, z, size, color, opacity) => {
    if (g >= T3.glows.length) return;
    const s = T3.glows[g++];
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    s.material.color.set(color); s.material.opacity = clamp(opacity, 0, 1); s.visible = true;
  };
  for (const f of G.fx) {
    const k = f.t / f.life, X = f.x * S3, Y = (f.h ?? 32) * S3, Z = f.y * S3;
    if (f.type === 'flash') { if (!(f.own && fp)) glow(X, Y, Z, 0.5, 0xffd27a, 1 - k); }
    else if (f.type === 'spark') glow(X, Y, Z, 0.22 + k * 0.3, 0xffc890, 0.9 * (1 - k));
    else if (f.type === 'blood') glow(X, Y, Z, 0.3 + k * 0.45, f.head ? 0xffe066 : 0xff4a3a, 0.95 * (1 - k));
    else if (f.type === 'boom') {
      const r = f.r * S3 * (0.35 + 0.65 * Math.min(1, k * 2.5));
      glow(X, 1.2, Z, r * 2.2, 0xffa050, 0.9 * (1 - k));
      glow(X, 1.0, Z, r, 0xfff0c0, 1 - k);
      if (!boom || f.t < boom.t) boom = f;
    }
  }
  const S = G.spike;
  if (G.state === 'game' && S && S.state === 'dropped') glow(S.x * S3, 0.3, S.y * S3, 0.9, 0xffc93c, 0.5 + 0.3 * Math.sin(G.time * 5));
  for (; g < T3.glows.length; g++) T3.glows[g].visible = false;
  if (boom) { T3.boomLight.position.set(boom.x * S3, 2, boom.y * S3); T3.boomLight.intensity = 4 * (1 - boom.t / boom.life); }
  else T3.boomLight.intensity = 0;

  // 烟雾：每颗烟 10 团半透明烟
  let p = 0;
  for (const s of G.smokes) {
    const r = smokeRadius(s) * S3, D = CFG.SMOKE.duration;
    const alpha = s.t > D - 1 ? Math.max(0, D - s.t) : 1;
    for (let j = 0; j < 10 && p < T3.puffs.length; j++) {
      const sp = T3.puffs[p++];
      const a = s.seed + j * 2.4, rr = r * (0.15 + 0.5 * ((j * 37) % 10) / 10);
      sp.position.set(s.x * S3 + Math.cos(a) * rr, 0.6 + (j % 4) * 0.55, s.y * S3 + Math.sin(a) * rr);
      const size = r * (1.15 + 0.25 * Math.sin(s.seed + j));
      sp.scale.set(size, size, 1);
      sp.material.opacity = 0.9 * alpha;
      sp.material.rotation = s.seed + j + s.t * 0.05;
      sp.visible = true;
    }
  }
  for (; p < T3.puffs.length; p++) T3.puffs[p].visible = false;

  // 飞行中的投掷物：引擎只算平面位置，这里补一条抛物线高度
  T3.nades.forEach((mesh, k) => {
    const n = G.nades[k];
    mesh.visible = !!n;
    if (!n) return;
    mesh.material = T3.nadeMats[n.type];
    mesh.position.set(n.x * S3, Math.max(0.075, 1.35 + 4.2 * n.t - 7.5 * n.t * n.t), n.y * S3);
  });

  // 地上的武器
  const seen = new Set();
  for (const d of G.drops) {
    let mdl = T3.dropModels.get(d);
    if (!mdl) {
      mdl = new THREE.Group();
      const gm = gunModel(d.id); gm.position.y = 0.14; mdl.add(gm);
      const ring = new THREE.Mesh(T3.dropRingGeo, T3.dropRingMats[WEAPONS[d.id].stage]);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; mdl.add(ring);
      T3.scene.add(mdl); T3.dropModels.set(d, mdl);
    }
    mdl.position.set(d.x * S3, 0, d.y * S3);
    mdl.children[0].rotation.y = G.time * 1.5 + d.x;
    seen.add(d);
  }
  for (const [d, mdl] of T3.dropModels) if (!seen.has(d)) { T3.scene.remove(mdl); T3.dropModels.delete(d); }

  // 炸弹
  const showSpike = G.state === 'game' && !!S && (S.state === 'dropped' || S.state === 'planted');
  T3.spike.visible = showSpike;
  const planted = showSpike && S.state === 'planted';
  T3.spikeRing.visible = planted;
  if (showSpike) T3.spike.position.set(S.x * S3, 0, S.y * S3);
  if (planted) {
    const prog = G.phase === 'planted' ? G.timer / CFG.SPIKE_TIME : 0;
    const blink = Math.sin(G.time * (6 + (1 - prog) * 18)) > 0;
    T3.spikeLamp.material.color.set(blink ? 0xff4a3a : 0x5a1610);
    T3.spikeLight.position.set(S.x * S3, 0.8, S.y * S3);
    T3.spikeLight.intensity = blink ? 1.6 : 0.3;
    const pulse = (G.time * 1.6) % 1;
    T3.spikeRing.position.set(S.x * S3, 0.03, S.y * S3);
    T3.spikeRing.scale.setScalar(1 + pulse * 3);
    T3.spikeRing.material.opacity = 0.8 * (1 - pulse);
  } else T3.spikeLight.intensity = 0;
}

function animateWorld(dt) {
  const t = performance.now() / 1000;
  for (const s of T3.spinners) s.rotation.y += dt * 2.2;
  for (const b of T3.blinkers) b.visible = Math.sin(t * 3) > -0.2;
  T3.aHolo.position.y = 6.2 + Math.sin(t * 1.4) * 0.18;
  T3.aHolo.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.3);
  if (T3.water) for (const w of T3.water) w.material.emissiveIntensity = 0.75 + 0.2 * Math.sin(t * 1.7 + w.position.x);
}

/* ---------- 镜头 ---------- */
function updateCamera3d(dt) {
  const cam = T3.camera, p = G.player;
  let fov = VIEW3D.FOV;
  if (G.state !== 'game' || !p) {
    // 菜单背景：绕着基地慢慢转
    const t = performance.now() / 1000 * 0.045;
    cam.position.set(CENTER3.x + Math.cos(t) * 44, 26, CENTER3.z + Math.sin(t) * 32);
    cam.lookAt(CENTER3.x, 0, CENTER3.z);
  } else if (p.alive) {
    if (p.scoped) fov = VIEW3D.SCOPE_FOV[curW(p).id] || 30;
    const bob = p.speedNow > 0 && !p.walking ? Math.sin(G.time * 11) * 0.03 : 0;
    cam.position.set(p.x * S3, VIEW3D.EYE + bob - (p.action ? 0.5 : 0), p.y * S3);
    cam.rotation.set(p.pitch, -p.angle - Math.PI / 2, 0);
  } else {
    // 阵亡后：跟在存活队友身后的第三人称镜头，碰到墙就拉近
    const v = viewer();
    if (v) {
      const back = 3.2 / S3, bx = -Math.cos(v.angle), by = -Math.sin(v.angle);
      const room = Math.max(0.6 / S3, Math.min(back, rayWall(v.x, v.y, bx, by, back) - 12));
      const k = 1 - Math.exp(-dt * 8);
      cam.position.x += ((v.x + bx * room) * S3 - cam.position.x) * k;
      cam.position.z += ((v.y + by * room) * S3 - cam.position.z) * k;
      cam.position.y += (2.9 - cam.position.y) * k;
      cam.lookAt((v.x + Math.cos(v.angle) * 80) * S3, 1.2, (v.y + Math.sin(v.angle) * 80) * S3);
    }
  }
  if (Math.abs(cam.fov - fov) > 0.05) {
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 14);
    cam.updateProjectionMatrix();
  }
}

function render3d() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - (T3.lastT || now)) / 1000);
  T3.lastT = now;
  const p = G.player, inGame = G.state === 'game' && !!p;
  T3.firstPerson = inGame && p.alive;
  syncSoldiers(dt, T3.firstPerson ? p : null);
  if (inGame) syncEffects();
  else { for (const o of [...T3.tracers, ...T3.glows, ...T3.puffs, ...T3.nades]) o.visible = false; T3.spike.visible = T3.spikeRing.visible = false; T3.spikeLight.intensity = T3.boomLight.intensity = 0; }
  animateWorld(dt);
  const vmOn = inGame && syncViewmodel(dt);
  const r = T3.renderer;
  r.clear();
  r.render(T3.scene, T3.camera);
  if (vmOn) { r.clearDepth(); r.render(T3.vmScene, T3.vmCam); }
}

/* ---------- 3D 专用 HUD（画在上层的 2D 画布上） ---------- */
function project3(x, hMeters, y) {
  const v = T3.tmp.set(x * S3, hMeters, y * S3).project(T3.camera);
  if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) return null;
  return { x: (v.x + 1) / 2 * CW, y: (1 - v.y) / 2 * CH };
}
function drawOverlays3d() {
  const p = G.player, v = viewer();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 队友头顶名字；被你打过的敌人短暂显示血条
  for (const a of G.agents) {
    if (!a.alive || a === v || a.isPlayer && p.alive) continue;
    const ally = a.team === p.team;
    if (!ally && G.time - a.markT > 1.5) continue;
    if (v && !canSee(v, a)) continue;
    const s = project3(a.x, 2.05, a.y);
    if (!s) continue;
    if (ally) {
      ctx.font = FONT(600, 11);
      ctx.fillStyle = 'rgba(160,240,230,0.9)';
      const carrier = G.spike.state === 'carried' && G.spike.carrier === a;
      ctx.fillText(carrier ? '◆ ' + a.name : a.name, s.x, s.y - 6);
    }
    const bw = 34;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(s.x - bw / 2, s.y - 2, bw, 4);
    ctx.fillStyle = ally ? PALETTE.ally : PALETTE.enemy;
    ctx.fillRect(s.x - bw / 2, s.y - 2, bw * clamp(a.hp / 100, 0, 1), 4);
  }
  // 炸弹位置提示：安放后所有人可见，掉在地上时进攻方可见
  const S = G.spike;
  if (S && (S.state === 'planted' || (S.state === 'dropped' && G.side[p.team] === 'ATT'))) {
    const s = project3(S.x, 0.6, S.y), vv = v || p;
    if (s) {
      s.x = clamp(s.x, 28, CW - 28); s.y = clamp(s.y, 28, CH - 40);   // 在屏幕外时贴边显示方向
      ctx.fillStyle = S.state === 'planted' && Math.sin(G.time * 10) > 0 ? '#ff5a48' : PALETTE.spike;
      ctx.beginPath(); ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x + 9, s.y); ctx.lineTo(s.x, s.y + 9); ctx.lineTo(s.x - 9, s.y); ctx.fill();
      ctx.font = FONT(700, 11); ctx.fillStyle = PALETTE.spike;
      ctx.fillText(`${Math.round(dist(vv, S) * S3)} 米`, s.x, s.y + 24);
    }
  }
  // 伤害数字
  for (const f of G.floats) {
    if (f.wx == null) continue;
    const k = f.t / f.life;
    const s = project3(f.wx, f.h * S3 + k * 0.6, f.wy);
    if (!s) continue;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = FONT(700, f.head ? 18 : 15);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    const label = f.head ? `${f.text} 爆头` : f.text;
    ctx.strokeText(label, s.x, s.y); ctx.fillStyle = f.head ? PALETTE.spike : '#ffffff'; ctx.fillText(label, s.x, s.y);
  }
  ctx.globalAlpha = 1;
}
function drawScope3d() {
  const r = Math.min(CW, CH) * 0.45, cx = CW / 2, cy = CH / 2;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.arc(cx, cy, r, 0, TAU, true); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,60,90,0.9)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, TAU); ctx.fill();
}
function drawLockHint() {
  if (G.state !== 'game' || G.paused || shopOpen || Input.locked || Input.lockFallback || G.phase === 'over') return;
  const msg = '点击画面锁定鼠标，移动鼠标转视角';
  ctx.font = FONT(600, 14);
  const w = ctx.measureText(msg).width + 40, y = CH / 2 + 46;
  panel(CW / 2 - w / 2, y, w, 36, 8);
  text(msg, CW / 2, y + 23, FONT(600, 14), PALETTE.spike, 'center');
}
