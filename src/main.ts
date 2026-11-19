import * as THREE from 'three';
import { U, MOON_DIR, FOG_COLOR } from './core/env';
import { TerrainLayer, createTerrainMaterial } from './world/terrain';
import { loadAssets } from './core/assets';
import { createSky } from './world/sky';
import { createWater } from './world/water';
import { GrassField } from './world/grass';
import { TreeManager } from './world/trees';
import { VillageManager } from './world/villages';
import { Fireflies } from './world/particles';
import { heightAt } from './world/world';
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
scene.background = FOG_COLOR;
scene.fog = new THREE.FogExp2(FOG_COLOR, U.uFogDensity.value);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);

// ánh trăng + ánh trời
const moon = new THREE.DirectionalLight(0x8fe6ff, 2.0);
scene.add(moon, moon.target);
scene.add(new THREE.HemisphereLight(0x3a86b8, 0x0d4a3a, 0.85));
// đèn phụ lạnh từ phía sau để sườn đồi quay lưng với trăng vẫn có hình khối (giống màu ảnh tham khảo)
const fill = new THREE.DirectionalLight(0x5fb4e0, 1.0); fill.position.set(0.5, 0.55, 0.7); scene.add(fill);

const sky = createSky(); scene.add(sky);
const water = createWater(); scene.add(water);

const terrainMat = createTerrainMaterial();
const near = new TerrainLayer(128, 64, 5, 0, false, terrainMat);
const far = new TerrainLayer(512, 64, 3, -3.5, true, terrainMat);
const grass = new GrassField(); grass.density = [9, 14, 20][Q]; grass.setRange(26, [42, 54, 68][Q]);
const trees = new TreeManager(); trees.attempts = [110, 170, 230][Q];
const village = new VillageManager();
const fireflies = new Fireflies([350, 700, 1000][Q]);
scene.add(far.group, near.group, grass.group, trees.group, village.group, fireflies.points);

const hideSet = new Set((params.get('hide') ?? '').split(','));
const parts: Record<string, THREE.Object3D> = { far: far.group, near: near.group, grass: grass.group, trees: trees.group, village: village.group, fire: fireflies.points, water, sky };
hideSet.forEach(k => { if (parts[k]) parts[k].visible = false; });
if (hideSet.has('grass')) grass.enabled = false;
const fly = new FlyCam(camera);
const post = new Post(renderer, scene, camera, 100, 100);

// ───────── kích thước (hợp cả dọc 9:16 cho TikTok lẫn ngang) ─────────
function resize() {
  // luôn là khung dọc 9:16
  let w = window.innerWidth, h = Math.round(w * 16 / 9);
  if (h > window.innerHeight) { h = window.innerHeight; w = Math.round(h * 9 / 16); }
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  const pr = Math.min(window.devicePixelRatio, PR_CAP);
  renderer.setPixelRatio(pr); renderer.setSize(w, h);
  post.setSize(w, h, pr);
  camera.aspect = w / h;
  camera.fov = 68;
  camera.updateProjectionMatrix();
  U.uPx.value = (h * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
window.addEventListener('resize', resize); resize();
post.bloom.strength = [0.45, 0.6, 0.7][Q];

// ───────── HUD ─────────
const hud = document.getElementById('hud')!, toast = document.getElementById('toast')!;
let giftMap: GiftMap = { ...DEFAULT_MAP };
function renderHud() {
  const rows = Object.entries(giftMap).map(([name, cmd]) => {
    const g = GIFTS_1.find(x => x.name === name);
    return `<div class="row">${g ? `<img src="${g.imageUrl}">` : ''}<span>${name}</span> → ${ACTIONS[cmd].emoji} ${ACTIONS[cmd].label}</div>`;
  }).join('');
  hud.innerHTML = '<b>🛸 Tặng quà để lái flycam</b>' + rows + '<div id="st" style="opacity:.6;margin-top:4px"></div>';
}
renderHud();
const stEl = { get textContent() { return ''; }, set textContent(v: string) { const e = document.getElementById('st'); if (e) e.textContent = v; } };
let toastTimer = 0;
function showToast(msg: string) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}
fly.onEvent = showToast;
if (params.has('nohud')) hud.style.display = 'none';

function runCmd(cmd: Cmd, user?: string, count = 1, gift?: string) {
  fly.command(cmd, count);
  showToast(`${user ? '@' + user + ' ' : ''}${gift ? '🎁 ' + gift + ' → ' : ''}${ACTIONS[cmd].emoji} ${ACTIONS[cmd].label}${count > 1 ? ' ×' + count : ''}`);
}
connectServer('game', m => {
  if (m.type === 'command') runCmd(m.cmd, m.user, m.count ?? 1, m.gift);
  else if (m.type === 'state') { giftMap = m.map; renderHud(); }
}, ok => { stEl.textContent = ok ? '' : '○ Chưa nối server'; });

// bàn phím để test: A/D rẽ, W tăng tốc, Q/E lên/xuống, R quay đầu, T warp, H ẩn HUD
const KEYS: Record<string, Cmd> = {
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'forward', arrowup: 'forward',
  q: 'up', ' ': 'up', e: 'down', arrowdown: 'down', r: 'turn180', t: 'warp',
};
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'h') { hud.style.display = hud.style.display === 'none' ? '' : 'none'; return; }
  if (KEYS[k]) { e.preventDefault(); runCmd(KEYS[k], 'bạn'); }
});

// ───────── nạp cảnh ban đầu ─────────
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
preload();
fireflies.seedAround(camera.position);
(window as any).__preload = preload; (window as any).__h = heightAt;

// ───────── vòng lặp ─────────
let last = performance.now();
let acc = 0, frames = 0, fps = 0;
const dbg = params.has('fps');
(window as any).__trees = trees; (window as any).__fly = fly; (window as any).__ready = true;

function frame() {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now;
  U.uTime.value += dt;
  fly.update(dt);
  const cp = camera.position;
  U.uCam.value.copy(cp);
  const agl = cp.y - fly.ground;

  sky.position.copy(cp);
  water.position.set(Math.round(cp.x / 20) * 20, 0, Math.round(cp.z / 20) * 20);
  moon.position.copy(cp).addScaledVector(MOON_DIR, 400);
  moon.target.position.copy(cp);

  near.update(cp.x, cp.z, 1); far.update(cp.x, cp.z, 1);
  trees.update(cp.x, cp.z, agl, 1);
  village.update(dt, cp.x, cp.z, 1);
  grass.update(cp.x, cp.z, agl, 2);
  fireflies.update(dt, cp, agl);

  post.render(dt, U.uTime.value);

  frames++; acc += dt;
  if (acc >= 1) { fps = frames / acc; frames = 0; acc = 0; if (dbg) stEl.textContent = `${fps.toFixed(0)} fps · alt ${agl.toFixed(0)}m · spd ${fly.speed.toFixed(1)}`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
