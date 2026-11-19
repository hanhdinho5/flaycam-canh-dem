import * as THREE from 'three';
import { U } from './core/env';
import { TerrainLayer, createTerrainMaterial, TERRAIN_LOOK } from './world/terrain';
import { MIST_LOOK } from './world/mist';
import { loadAssets } from './core/assets';
import { createSky } from './world/sky';
import { createWater, createMirrorWater } from './world/water';
import { GrassField } from './world/grass';
import { TreeManager, TREE_FADE, TREE_LOOK } from './world/trees';
import { VillageManager } from './world/villages';
import { Fireflies } from './world/particles';
import { heightAt, setWorld } from './world/world';
import { SCENES, type SceneDef } from './scenes';
import { FlyCam } from './core/flycam';
import { Post } from './core/post';
import { connectServer } from './core/net';
import { ACTIONS, GIFTS_1, DEFAULT_MAP, type Cmd, type GiftMap } from '../shared/giftmap';

const params = new URLSearchParams(location.search);
const Q = ({ low: 0, med: 1, high: 2 } as Record<string, number>)[params.get('q') ?? 'med'] ?? 1;
const PR_CAP = [1, 1.5, 2][Q];

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const stage = document.getElementById('stage')!;
stage.appendChild(renderer.domElement);

await loadAssets(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const fogColor = new THREE.Color('#0e3a50');
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor, U.uFogDensity.value);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);
camera.layers.enable(1); // layer 1 = cỏ + đom đóm (không vẽ trong ảnh phản chiếu mặt hồ)

// ánh trăng + ánh trời
const moon = new THREE.DirectionalLight(0x8fe6ff, 2.0);
scene.add(moon, moon.target);
const hemi = new THREE.HemisphereLight(0x3a86b8, 0x0d4a3a, 0.85); scene.add(hemi);
// đèn phụ lạnh từ phía sau để sườn đồi quay lưng với trăng vẫn có hình khối (giống màu ảnh tham khảo)
const fill = new THREE.DirectionalLight(0x5fb4e0, 1.0); fill.position.set(0.5, 0.55, 0.7); scene.add(fill);

const nl = params.get('nolight') ?? '';   // debug: tắt thử từng đèn (moon,fill,hemi)
if (nl.includes('moon')) moon.intensity = 0; if (nl.includes('fill')) fill.intensity = 0;
if (nl.includes('hemi')) scene.traverse(o => { if ((o as THREE.HemisphereLight).isHemisphereLight) (o as THREE.HemisphereLight).intensity = 0; });
const sky = createSky(); scene.add(sky);
const water = createWater(); scene.add(water);
let mirror: ReturnType<typeof createMirrorWater> | null = null;   // tạo khi cần (không gian có hồ gương)

const terrainMat = createTerrainMaterial();
const near = new TerrainLayer(128, 64, 5, 0, false, terrainMat);
const far = new TerrainLayer(512, 64, 3, -3.5, true, terrainMat, 620); // sương ở lớp xa chỉ vẽ ngoài vùng lớp gần
const grass = new GrassField(); grass.density = [9, 14, 20][Q]; grass.setRange(26, [42, 54, 68][Q]);
const trees = new TreeManager(); trees.attempts = [170, 280, 400][Q]; trees.radius = [3, 3, 4][Q];
TREE_FADE.value.set(...(Q === 2 ? [380, 500] : [270, 370]) as [number, number]);
const village = new VillageManager();
const fireflies = new Fireflies([350, 700, 1000][Q]);
scene.add(far.group, near.group, far.mistGroup, near.mistGroup, grass.group, trees.group, village.group, fireflies.points);

const hideSet = new Set((params.get('hide') ?? '').split(','));
const parts: Record<string, THREE.Object3D> = { far: far.group, near: near.group, grass: grass.group, trees: trees.group, village: village.group, fire: fireflies.points, water, sky };
hideSet.forEach(k => { if (parts[k]) parts[k].visible = false; });
if (hideSet.has('grass')) grass.enabled = false;
const fly = new FlyCam(camera);
const post = new Post(renderer, scene, camera, 100, 100);

// ───────── kích thước (hợp cả dọc 9:16 cho TikTok lẫn ngang) ─────────
let resScale = 1; // tự giảm độ phân giải khi máy yếu (xem frame())
function applyUPx() {
  const h = renderer.domElement.height;
  U.uPx.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
function resize() {
  // luôn là khung dọc 9:16
  let w = window.innerWidth, h = Math.round(w * 16 / 9);
  if (h > window.innerHeight) { h = window.innerHeight; w = Math.round(h * 9 / 16); }
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  const pr = Math.min(window.devicePixelRatio, PR_CAP) * resScale;
  renderer.setPixelRatio(pr); renderer.setSize(w, h);
  post.setSize(w, h, pr);
  mirror?.getRenderTarget().setSize(Math.max(64, Math.round(w * pr * 0.5)), Math.max(64, Math.round(h * pr * 0.5)));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  applyUPx();
}
window.addEventListener('resize', resize); resize();

// ───────── HUD ─────────
const hud = document.getElementById('hud')!, toast = document.getElementById('toast')!;
let giftMap: GiftMap = { ...DEFAULT_MAP };
let sceneIdx = Math.max(0, Math.min(SCENES.length - 1, Number(params.get('scene') ?? 0) || 0));
function renderHud() {
  const rows = Object.entries(giftMap).map(([name, cmd]) => {
    const g = GIFTS_1.find(x => x.name === name);
    return `<div class="row">${g ? `<img src="${g.imageUrl}">` : ''}<span>${name}</span> → ${ACTIONS[cmd].emoji} ${ACTIONS[cmd].label}</div>`;
  }).join('');
  hud.innerHTML = '<b>🛸 Tặng quà để lái flycam</b>' + rows +
    `<div class="row" style="margin-top:5px;color:#ffe9a8">🎁 Quà từ 30 xu → ${ACTIONS.scene.emoji} ${ACTIONS.scene.label}</div>` +
    `<div style="opacity:.75;margin-top:3px">${SCENES[sceneIdx].emoji} ${SCENES[sceneIdx].name}</div><div id="st" style="opacity:.6;margin-top:2px"></div>`;
}
renderHud();
let net: ReturnType<typeof connectServer>;
const stEl = { get textContent() { return ''; }, set textContent(v: string) { const e = document.getElementById('st'); if (e) e.textContent = v; } };
let toastTimer = 0;
function showToast(msg: string) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}
fly.onEvent = showToast;
if (params.has('nohud')) hud.style.display = 'none';

function runCmd(cmd: Cmd, user?: string, count = 1, gift?: string, index?: number) {
  if (cmd === 'scene') { changeScene(index ?? (sceneIdx + 1) % SCENES.length); }
  else fly.command(cmd, count);
  showToast(`${user ? '@' + user + ' ' : ''}${gift ? '🎁 ' + gift + ' → ' : ''}${ACTIONS[cmd].emoji} ${ACTIONS[cmd].label}${count > 1 ? ' ×' + count : ''}`);
}
net = connectServer('game', m => {
  if (m.type === 'command') runCmd(m.cmd, m.user, m.count ?? 1, m.gift, m.index);
  else if (m.type === 'state') { giftMap = m.map; renderHud(); }
}, ok => { stEl.textContent = ok ? '' : '○ Chưa nối server'; if (ok) net?.send({ type: 'sceneChanged', index: sceneIdx }); });

// bàn phím để test: A/D rẽ, W tăng tốc, Q/E lên/xuống, R quay đầu, T warp, H ẩn HUD
const KEYS: Record<string, Cmd> = {
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'forward', arrowup: 'forward',
  q: 'up', ' ': 'up', e: 'down', arrowdown: 'down', r: 'turn180', t: 'warp', n: 'scene',
};
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'h') { hud.style.display = hud.style.display === 'none' ? '' : 'none'; return; }
  if (k >= '1' && k <= '9' && Number(k) <= SCENES.length) { changeScene(Number(k) - 1); return; }
  if (KEYS[k]) { e.preventDefault(); runCmd(KEYS[k], 'bạn'); }
});

// ───────── không gian (scene): áp dụng thế giới + ánh sáng + bầu trời ─────────
function applyLook(def: SceneDef) {
  const L = def.look;
  fogColor.set(L.fogColor); U.uFogColor.value.copy(fogColor);
  U.uFogDensity.value = L.fogDensity; (scene.fog as THREE.FogExp2).density = L.fogDensity;
  U.uSkyTop.value.set(...L.skyTop); U.uSkyMid.value.set(...L.skyMid);
  U.uMoonDir.value.set(...L.moonDir).normalize(); U.uMoonCol.value.set(L.moonColor);
  U.uMoonOn.value = L.moonOn; U.uMoonSize.value = L.moonSize;
  U.uStars.value.set(...L.stars); U.uMW.value = L.milkyWay; U.uCloud.value.set(...L.cloud);
  U.uCloudLit.value.set(...L.cloudLit); U.uCloudDark.value.set(...L.cloudDark);
  moon.color.set(L.moonLight.color); moon.intensity = L.moonLight.intensity;
  hemi.color.set(L.hemi.sky); hemi.groundColor.set(L.hemi.ground); hemi.intensity = L.hemi.intensity;
  fill.color.set(L.fill.color); fill.intensity = L.fill.intensity; fill.position.set(...L.fill.pos);
  renderer.toneMappingExposure = L.exposure;
  post.bloom.strength = [0.45, 0.6, 0.7][Q] * L.bloom;
  post.grade.uniforms.uShadow.value.set(...L.gradeShadow); post.grade.uniforms.uSat.value = L.gradeSat;
  TERRAIN_LOOK.grassTint = [...L.grassTint]; TERRAIN_LOOK.rockMul.value.set(...L.rockMul); TERRAIN_LOOK.snowCol.value.set(...L.snowCol);
  grass.densityMul = L.grass; grass.tint = [...L.grassTint];
  Object.assign(TREE_LOOK, { density: L.trees.density, pine: L.trees.pine, slim: L.trees.slim, scale: L.trees.scale,
    clear: { x: def.start.x, z: def.start.z, r: def.start.clearR ?? 34 } });
  const mist = L.mist;
  near.mist = far.mist = mist ? { y: mist.y, layers: mist.layers } : null;
  if (mist) { MIST_LOOK.color.value.set(...mist.color); MIST_LOOK.alpha.value = mist.alpha; }
  fireflies.points.visible = L.fireflies > 0.1;
  // mặt nước: thường hoặc hồ gương (phản chiếu thật)
  if (L.water === 'mirror') {
    if (!mirror) {
      mirror = createMirrorWater(Math.round(stage.clientWidth * 0.5) || 256, Math.round(stage.clientHeight * 0.5) || 456);
      scene.add(mirror);
    }
    mirror.visible = true; water.visible = false;
  } else { if (mirror) mirror.visible = false; water.visible = true; }
}

function preload() {
  fly.update(0.016);
  U.uCam.value.copy(camera.position);
  for (let i = 0; i < 400; i++) {
    const c = near.update(fly.x, fly.z, 40) + far.update(fly.x, fly.z, 40) + trees.update(fly.x, fly.z, 0, 40);
    village.update(0, fly.x, fly.z, 40);
    grass.update(fly.x, fly.z, fly.agl, 40);
    if (!c) break;
  }
}

function loadScene(i: number) {
  const def = SCENES[i];
  sceneIdx = i;
  setWorld(def.world);
  applyLook(def);
  near.clear(); far.clear(); trees.clear(); village.clear(); grass.clear();
  fly.teleport(def.start.x, def.start.z, def.start.lookAt.x, def.start.lookAt.z, def.start.agl);
  preload();
  fireflies.seedAround(camera.position);
  renderHud();
  net?.send({ type: 'sceneChanged', index: i });
}

const fadeEl = document.getElementById('fade');
let changing = false;
function changeScene(i: number) {
  i = ((i % SCENES.length) + SCENES.length) % SCENES.length;
  if (changing) return;
  changing = true;
  if (fadeEl) fadeEl.style.opacity = '1';
  window.setTimeout(() => {
    loadScene(i);
    window.setTimeout(() => {
      if (fadeEl) fadeEl.style.opacity = '0';
      showToast(`${SCENES[i].emoji} ${SCENES[i].name}`);
      changing = false;
    }, 250);
  }, 1100);
}

loadScene(sceneIdx);
if (params.has('debug')) { (window as any).__preload = preload; (window as any).__h = heightAt; (window as any).__scene = loadScene; }

// ───────── vòng lặp ─────────
let last = performance.now();
let acc = 0, frames = 0, fps = 0;
const dbg = params.has('fps');
if (params.has('debug')) { (window as any).__trees = trees; (window as any).__fly = fly; (window as any).__ready = true; (window as any).__near = near; }

// WebGL bị mất (driver/GPU treo): tải lại trang để live không đứng hình
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setTimeout(() => location.reload(), 1500); });
let adaptT = 0, lakeT = 0;
function lakeNear(x: number, z: number) {
  for (const r of [30, 90, 180, 300]) for (let a = 0; a < 12; a++)
    if (heightAt(x + Math.cos(a * 0.5236) * r, z + Math.sin(a * 0.5236) * r) < 0.2) return true;
  return false;
}

function frame() {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now;
  U.uTime.value += dt;
  fly.update(dt);
  const cp = camera.position;
  U.uCam.value.copy(cp);
  const agl = cp.y - fly.ground;

  sky.position.copy(cp);
  water.position.set(Math.round(cp.x / 20) * 20, 0, Math.round(cp.z / 20) * 20);
  if (mirror?.visible || (mirror && SCENES[sceneIdx].look.water === 'mirror')) {
    mirror.position.set(Math.round(cp.x / 20) * 20, 0, Math.round(cp.z / 20) * 20);
    lakeT -= dt;
    if (lakeT <= 0) { lakeT = 0.6; mirror.visible = lakeNear(cp.x, cp.z); }  // không có hồ gần thì khỏi vẽ phản chiếu
  }
  moon.position.copy(cp).addScaledVector(U.uMoonDir.value, 400);
  moon.target.position.copy(cp);

  near.update(cp.x, cp.z, 1); far.update(cp.x, cp.z, 1);
  trees.update(cp.x, cp.z, agl, 1);
  village.update(dt, cp.x, cp.z, 1);
  grass.update(cp.x, cp.z, agl, 2);
  fireflies.update(dt, cp, agl);

  post.render(dt, U.uTime.value);

  // góc nhìn (FOV) thay đổi theo từng cảnh quay
  if (Math.abs(camera.fov - fly.fov) > 0.05) { camera.fov = fly.fov; camera.updateProjectionMatrix(); applyUPx(); }

  frames++; acc += dt;
  if (acc >= 2) {
    fps = frames / acc; frames = 0; acc = 0; adaptT += 2;
    // tự chỉnh độ phân giải: giật thì giảm, dư sức thì tăng lại (bỏ qua 8 giây đầu lúc đang nạp cảnh)
    if (adaptT > 8 && !params.has('fixres')) {
      const prev = resScale;
      if (fps < 27) resScale = Math.max(0.5, resScale - 0.1);
      else if (fps > 54 && resScale < 1) resScale = Math.min(1, resScale + 0.05);
      if (resScale !== prev) resize();
    }
    if (dbg) stEl.textContent = `${fps.toFixed(0)} fps · res ${(resScale * 100).toFixed(0)}% · ${fly.kind} · alt ${agl.toFixed(0)}m`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
