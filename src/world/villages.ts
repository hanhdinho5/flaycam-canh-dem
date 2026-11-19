import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U } from '../core/env';
import { heightAt, villagesNear, type Village, type HouseSpec } from './world';
import { FEAT_CHUNK } from './trees';
import { mulberry32, hashInt } from '../core/rand';
import { TEX } from '../core/assets';

// ───────── dựng nhà từ khối hộp + mái chóp ─────────
type RGB = [number, number, number];
interface HouseGeo { body: THREE.BufferGeometry; roof: THREE.BufferGeometry; win: THREE.BufferGeometry }
class Builder {
  body: THREE.BufferGeometry[] = []; win: THREE.BufferGeometry[] = []; roof: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, x: number, y: number, z: number, col: RGB, uvs = 0.5, target: 'body' | 'win' | 'roof' = 'body') {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z);
    const uv = g.getAttribute('uv'), nrm = g.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
      const u = ax > 0.5 ? d : w, v = ay > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * u * 0.5, uv.getY(i) * v * 0.5);
    }
    this.push(g, col, target);
  }
  private push(g: THREE.BufferGeometry, col: RGB, target: 'body' | 'win' | 'roof') {
    const n = g.index ? g.toNonIndexed() : g;
    const c = new Float32Array(n.getAttribute('position').count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; }
    n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (target === 'body' ? this.body : target === 'roof' ? this.roof : this.win).push(n);
  }
  /** mái hai dốc, sống mái chạy theo trục x */
  gable(w: number, d: number, y0: number, pitch: number, over: number, col: RGB, wallCol: RGB) {
    const hw = w / 2 + over, hd = d / 2 + over * 0.6, rh = (d / 2 + over * 0.6) * Math.tan(pitch);
    const A = [-hw, y0, -hd], B = [hw, y0, -hd], C = [hw, y0, hd], D = [-hw, y0, hd], R1 = [-hw, y0 + rh, 0], R2 = [hw, y0 + rh, 0];
    const tris: number[][][] = [
      [A, B, R2], [A, R2, R1], // dốc sau
      [D, R1, R2], [D, R2, C], // dốc trước
    ];
    const pos: number[] = [], uv: number[] = [];
    for (const t of tris) for (const v of t) { pos.push(v[0], v[1], v[2]); uv.push(v[0] * 0.4, (v[1] + v[2]) * 0.46); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.push(g, col, 'roof');
    // tường hồi (tam giác)
    const gp: number[] = [], gu: number[] = [];
    const hw2 = w / 2, hd2 = d / 2, rh2 = hd2 * Math.tan(pitch);
    const tri = (a: number[], b: number[], c: number[]) => [a, b, c].forEach(v => { gp.push(v[0], v[1], v[2]); gu.push(v[2] * 0.5, v[1] * 0.5); });
    tri([hw2, y0, -hd2], [hw2, y0 + rh2, 0], [hw2, y0, hd2]);
    tri([-hw2, y0, hd2], [-hw2, y0 + rh2, 0], [-hw2, y0, -hd2]);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
    g2.computeVertexNormals();
    this.push(g2, wallCol, 'body');
    return rh;
  }
  quad(w: number, h: number, x: number, y: number, z: number, ry: number) {
    const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z);
    g.deleteAttribute('uv'); this.push(g, [1, 1, 1], 'win');
  }
  windowAt(x: number, y: number, z: number, ry: number, w = 0.9, h = 1.1) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    this.quad(w, h, x + nx * 0.02, y, z + nz * 0.02, ry);
    const fr: RGB = [0.012, 0.008, 0.005];
    const o = 0.05;
    // khung + chấn song
    const add = (bw: number, bh: number, bx: number, by: number) => {
      const g = new THREE.BoxGeometry(Math.abs(nx) > 0.5 ? 0.06 : bw, bh, Math.abs(nx) > 0.5 ? bw : 0.06);
      g.translate(x + nx * (0.045) + (Math.abs(nx) > 0.5 ? 0 : bx), y + by, z + nz * 0.045 + (Math.abs(nx) > 0.5 ? bx : 0));
      g.deleteAttribute('uv'); this.push(g, fr, 'body');
    };
    add(w + o * 2, o, 0, h / 2); add(w + o * 2, o, 0, -h / 2);
    add(o, h + o, -w / 2, 0); add(o, h + o, w / 2, 0);
    add(o * 0.6, h, 0, 0); add(w, o * 0.6, 0, 0);
  }
  build() {
    const strip = (gs: THREE.BufferGeometry[]) => gs.map(g => { if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); return g; });
    return { body: mergeGeometries(strip(this.body))!, roof: mergeGeometries(strip(this.roof))!, win: mergeGeometries(this.win)! };
  }
}

const WOOD: RGB = [1.0, 0.72, 0.52], WOOD2: RGB = [0.72, 0.52, 0.38], STONE: RGB = [0.42, 0.44, 0.46];
const ROOF: RGB = [0.62, 0.68, 0.78], PLASTER: RGB = [1.25, 1.25, 1.2];

function makeChalet(): HouseGeo {
  const b = new Builder(), W = 7.5, D = 6, H = 3.2;
  b.box(W + 0.3, 0.8, D + 0.3, 0, 0, 0, STONE, 0.5);
  b.box(W, H, D, 0, 0.8, 0, WOOD);
  b.box(W + 0.6, 0.12, D + 0.6, 0, 0.8 + H, 0, WOOD2, 0.4);
  const rh = b.gable(W, D, 0.8 + H, 0.62, 0.7, ROOF, WOOD);
  b.box(0.9, 2.4, 0.9, W * 0.28, 0.8 + H, -0.5, STONE, 0.5); // ống khói (cao hơn sống mái)
  b.box(1.1, 0.2, 1.1, W * 0.28, 0.8 + H + 2.4, -0.5, [0.1, 0.1, 0.11], 0.5);
  b.box(1.1, 2.0, 0.12, 0, 0.8, D / 2 + 0.03, [0.09, 0.05, 0.03], 0.5); // cửa
  b.box(3.2, 0.1, 1.4, 0, 0.8 + H * 0.52, D / 2 + 0.5, WOOD2, 0.4);     // ban công
  for (const sx of [-2.5, 2.5]) { b.windowAt(sx, 0.8 + 1.7, D / 2, 0, 0.9, 1.1); }
  b.windowAt(-2, 0.8 + 1.7, -D / 2, Math.PI); b.windowAt(2, 0.8 + 1.7, -D / 2, Math.PI);
  b.windowAt(W / 2, 0.8 + 1.7, 0, Math.PI / 2); b.windowAt(-W / 2, 0.8 + 1.7, 0, -Math.PI / 2);
  b.windowAt(0, 0.8 + H + rh * 0.45, D / 2 - 0.2 + 0.1, 0, 0.6, 0.7); // cửa sổ tầng áp mái trên tường hồi... (nhẹ)
  return b.build();
}
function makeCabin(): HouseGeo {
  const b = new Builder(), W = 5.2, D = 4.6, H = 2.6;
  b.box(W + 0.2, 0.5, D + 0.2, 0, 0, 0, STONE, 0.5);
  b.box(W, H, D, 0, 0.5, 0, WOOD2);
  b.gable(W, D, 0.5 + H, 0.7, 0.5, ROOF, WOOD2);
  b.box(0.7, 1.9, 0.7, -W * 0.25, 0.5 + H, 0, STONE, 0.5);
  b.box(0.95, 1.95, 0.1, -1.2, 0.5, D / 2 + 0.03, [0.09, 0.05, 0.03], 0.5);
  b.windowAt(1.3, 0.5 + 1.4, D / 2, 0, 0.8, 0.9);
  b.windowAt(W / 2, 0.5 + 1.4, 0, Math.PI / 2, 0.8, 0.9);
  b.windowAt(-W / 2, 0.5 + 1.4, 0, -Math.PI / 2, 0.8, 0.9);
  return b.build();
}
function makeBarn(): HouseGeo {
  const b = new Builder(), W = 11, D = 7.5, H = 3.6;
  b.box(W + 0.2, 0.5, D + 0.2, 0, 0, 0, STONE, 0.5);
  b.box(W, H, D, 0, 0.5, 0, WOOD2);
  b.gable(W, D, 0.5 + H, 0.5, 0.5, [0.5, 0.55, 0.62], WOOD2);
  b.box(3.4, 3.0, 0.14, 0, 0.5, D / 2 + 0.04, [0.07, 0.04, 0.025], 0.4);
  b.windowAt(3.8, 0.5 + 2.2, D / 2, 0, 0.7, 0.7);
  return b.build();
}
function makeChurch(): HouseGeo {
  const b = new Builder(), W = 6.2, D = 11, H = 4.4;
  b.box(W + 0.3, 0.7, D + 0.3, 0, 0, 0, STONE, 0.5);
  b.box(W, H, D, 0, 0.7, 0, PLASTER, 0.3);
  // nhà thờ: mái chạy theo trục z -> xoay hồi: dùng gable quay 90°
  const roof = new Builder(); roof.gable(D, W, 0.7 + H, 0.78, 0.6, ROOF, PLASTER);
  for (const g of roof.body) { g.rotateY(Math.PI / 2); b.body.push(g); }
  for (const g of roof.roof) { g.rotateY(Math.PI / 2); b.roof.push(g); }
  // tháp chuông phía trước
  b.box(3.2, 8.6, 3.2, 0, 0.7, D / 2 + 1.2, PLASTER, 0.3);
  const sp = new THREE.ConeGeometry(2.5, 6.5, 4); sp.rotateY(Math.PI / 4); sp.translate(0, 0.7 + 8.6 + 3.25, D / 2 + 1.2);
  sp.deleteAttribute('uv');
  const ng = sp.toNonIndexed(); const c = new Float32Array(ng.getAttribute('position').count * 3).fill(0.30);
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
  b.roof.push(ng);
  b.box(1.4, 2.6, 0.1, 0, 0.7, D / 2 + 2.82, [0.08, 0.05, 0.03], 0.5);
  b.windowAt(0, 0.7 + 6.5, D / 2 + 2.8, 0, 0.8, 1.2);
  b.windowAt(1.62, 0.7 + 6.5, D / 2 + 1.2, Math.PI / 2, 0.8, 1.2); b.windowAt(-1.62, 0.7 + 6.5, D / 2 + 1.2, -Math.PI / 2, 0.8, 1.2);
  for (const z of [-3, 0, 3]) { b.windowAt(W / 2, 0.7 + 2.4, z, Math.PI / 2, 0.8, 1.5); b.windowAt(-W / 2, 0.7 + 2.4, z, -Math.PI / 2, 0.8, 1.5); }
  return b.build();
}

// ───────── động vật ─────────
function ellipsoid(rx: number, ry: number, rz: number, x: number, y: number, z: number, col: (px: number, py: number, pz: number) => RGB, seg = 8) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(5, seg - 2)); g.scale(rx, ry, rz); g.translate(x, y, z);
  g.deleteAttribute('uv');
  const n = g.toNonIndexed(), p = n.getAttribute('position'), c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = col(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return n;
}
function leg(x: number, z: number, h: number, r: number, col: RGB) {
  const g = new THREE.CylinderGeometry(r, r * 0.8, h, 5); g.translate(x, h / 2, z); g.deleteAttribute('uv');
  const n = g.toNonIndexed(), c = new Float32Array(n.getAttribute('position').count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3)); return n;
}
function makeSheep() {
  const dk: RGB = [0.03, 0.03, 0.035];
  return mergeGeometries([
    ellipsoid(0.62, 0.46, 0.44, 0, 0.78, 0, (x, y) => { const k = 0.8 + 0.25 * y; return [0.55 * k, 0.6 * k, 0.6 * k]; }, 9),
    ellipsoid(0.2, 0.2, 0.15, 0.68, 0.9, 0, () => dk, 7),
    ellipsoid(0.06, 0.12, 0.05, 0.62, 1.04, 0.2, () => dk, 5), ellipsoid(0.06, 0.12, 0.05, 0.62, 1.04, -0.2, () => dk, 5),
    leg(0.35, 0.18, 0.5, 0.05, dk), leg(0.35, -0.18, 0.5, 0.05, dk), leg(-0.35, 0.18, 0.5, 0.05, dk), leg(-0.35, -0.18, 0.5, 0.05, dk),
  ])!;
}
function makeCow() {
  const spot = (x: number, y: number, z: number): RGB => {
    const s = Math.sin(x * 2.6 + 1.3) * Math.cos(z * 3.1 + y * 2.0) + Math.sin(y * 4.0 + x);
    return s > 0.5 ? [0.025, 0.022, 0.02] : [0.5, 0.5, 0.48];
  };
  const dk: RGB = [0.03, 0.025, 0.02];
  return mergeGeometries([
    ellipsoid(1.1, 0.62, 0.55, 0, 1.2, 0, spot, 10),
    ellipsoid(0.34, 0.3, 0.26, 1.2, 1.35, 0, () => [0.35, 0.3, 0.28], 8),
    ellipsoid(0.07, 0.14, 0.05, 1.12, 1.62, 0.28, () => dk, 5), ellipsoid(0.07, 0.14, 0.05, 1.12, 1.62, -0.28, () => dk, 5),
    leg(0.7, 0.32, 0.8, 0.09, dk), leg(0.7, -0.32, 0.8, 0.09, dk), leg(-0.7, 0.32, 0.8, 0.09, dk), leg(-0.7, -0.32, 0.8, 0.09, dk),
  ])!;
}

// ───────── Points (khói, quầng sáng đèn) ─────────
const pointsVert = /* glsl */ `
attribute float aSeed; attribute float aKind;
uniform float uTime; uniform float uPx; uniform vec2 uWind; uniform float uFogDensity;
varying float vA; varying float vKind;
void main(){
  vec3 p = position; float a;
  vKind = aKind;
  if (aKind < 0.5) { // khói
    float age = fract(uTime * 0.09 + aSeed);
    p.y += age * 26.0;
    p.xz += uWind * age * age * 34.0 + vec2(sin(age*9.0+aSeed*20.0), cos(age*7.0+aSeed*11.0)) * age * 2.2;
    a = smoothstep(0.0, 0.08, age) * (1.0 - age) * 0.34;
    vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((1.8 + age * 7.5) * uPx / max(-mv.z, 0.1), 1.0, 220.0);
    vA = a * (1.0 - (1.0 - exp(-pow(-mv.z * uFogDensity, 2.0))) * 0.7);
  } else {          // quầng sáng cửa sổ / đèn lồng
    float fl = 0.88 + 0.12 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 50.0);
    vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((aKind > 1.5 ? 5.0 : 9.0) * uPx / max(-mv.z, 0.1), 1.0, 300.0);
    vA = 0.55 * fl * (1.0 - (1.0 - exp(-pow(-mv.z * uFogDensity, 2.0))) * 0.6);
  }
}`;
const pointsFrag = /* glsl */ `
precision highp float;
varying float vA; varying float vKind;
void main(){
  vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
  if (r > 1.0) discard;
  if (vKind < 0.5) { float a = smoothstep(1.0, 0.0, r); gl_FragColor = vec4(vec3(0.20, 0.30, 0.36), a * a * vA); }
  else { float a = exp(-r * r * 5.0); gl_FragColor = vec4(vec3(1.0, 0.55, 0.20) * 1.4, a * vA); }
}`;

interface ChunkData { objs: THREE.Object3D[]; animals: AnimalInst[] }
interface AnimalInst { mesh: THREE.InstancedMesh; i: number; x: number; z: number; h: number; speed: number; timer: number; graze: boolean; seed: number; village: Village; kind: 'sheep' | 'cow'; bob: number }

export class VillageManager {
  readonly group = new THREE.Group();
  private chunks = new Map<string, ChunkData>();
  private matBody = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.brown_planks_09_diff, normalMap: TEX.brown_planks_09_nor, roughness: 0.9 });
  private matRoof = new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.roof_slates_02_diff, normalMap: TEX.roof_slates_02_nor, roughness: 0.85, side: THREE.DoubleSide });
  private matWin = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private matAnimal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private matFence = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  private geos = [makeChalet(), makeCabin(), makeBarn(), makeChurch()];
  private sheepG = makeSheep(); private cowG = makeCow();
  private postG = new THREE.BoxGeometry(0.15, 1.15, 0.15).translate(0, 0.57, 0);
  private railG = new THREE.BoxGeometry(1, 0.08, 0.06);
  private smokeMat: THREE.ShaderMaterial;
  animalsNear: AnimalInst[] = [];
  private tmp = new THREE.Object3D();

  constructor() {
    this.smokeMat = new THREE.ShaderMaterial({
      vertexShader: pointsVert, fragmentShader: pointsFrag, transparent: true, depthWrite: false,
      uniforms: { uTime: U.uTime, uPx: U.uPx, uWind: U.uWind, uFogDensity: U.uFogDensity },
    });
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: pointsVert, fragmentShader: pointsFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uPx: U.uPx, uWind: U.uWind, uFogDensity: U.uFogDensity },
    });
  }
  private glowMat: THREE.ShaderMaterial;

  private buildChunk(cx: number, cz: number): ChunkData {
    const x0 = cx * FEAT_CHUNK, z0 = cz * FEAT_CHUNK, x1 = x0 + FEAT_CHUNK, z1 = z0 + FEAT_CHUNK;
    const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const objs: THREE.Object3D[] = [], animals: AnimalInst[] = [];
    const vs = villagesNear((x0 + x1) / 2, (z0 + z1) / 2, FEAT_CHUNK * 0.75 + 70);
    const T = this.tmp;
    for (const v of vs) {
      // nhà
      for (let type = 0; type < 4; type++) {
        const hs = v.houses.filter(h => h.type === type && inside(h.x, h.z));
        if (!hs.length) continue;
        const body = new THREE.InstancedMesh(this.geos[type].body, this.matBody, hs.length);
        const roof = new THREE.InstancedMesh(this.geos[type].roof, this.matRoof, hs.length);
        const win = new THREE.InstancedMesh(this.geos[type].win, this.matWin, hs.length);
        hs.forEach((h: HouseSpec, i) => {
          T.position.set(h.x, h.y - 0.05, h.z); T.rotation.set(0, h.rot, 0); T.scale.setScalar(h.s); T.updateMatrix();
          body.setMatrixAt(i, T.matrix); roof.setMatrixAt(i, T.matrix); win.setMatrixAt(i, T.matrix);
          const k = h.lit; win.setColorAt(i, new THREE.Color(1.5 * k, 0.95 * k, 0.42 * k));
        });
        [body, roof, win].forEach(m => { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); objs.push(m); this.group.add(m); });
      }
      // khói + quầng sáng
      const sm: number[] = [], smS: number[] = [], smK: number[] = [];
      const gl: number[] = [], glS: number[] = [], glK: number[] = [];
      for (const h of v.houses) {
        if (!inside(h.x, h.z)) continue;
        const rs = mulberry32(hashInt(Math.round(h.x), Math.round(h.z), 5));
        // ống khói (cục bộ) -> thế giới
        const cxl = h.type === 0 ? 7.5 * 0.28 : h.type === 1 ? -5.2 * 0.25 : 0, czl = h.type === 0 ? -0.5 : 0;
        if (h.type <= 1 && h.lit > 0) {
          const ch = h.type === 0 ? 0.8 + 3.2 + 2.6 : 0.5 + 2.6 + 2.0;
          const c = Math.cos(h.rot), s = Math.sin(h.rot);
          const wx = h.x + (cxl * c + czl * s) * h.s, wz = h.z + (-cxl * s + czl * c) * h.s;
          for (let k = 0; k < 14; k++) { sm.push(wx, h.y + ch * h.s, wz); smS.push(k / 14 + rs() * 0.02); smK.push(0); }
        }
        if (h.lit > 0) {
          const c = Math.cos(h.rot), s = Math.sin(h.rot);
          const fz = (h.type === 2 ? 5 : 4.2) * h.s;
          gl.push(h.x + s * fz, h.y + 1.6, h.z + c * fz); glS.push(rs()); glK.push(1);
        }
      }
      for (const l of v.lamps) {
        if (!inside(l.x, l.z)) continue;
        gl.push(l.x, heightAt(l.x, l.z) + 2.3, l.z); glS.push(Math.random()); glK.push(2);
      }
      const mkPoints = (pos: number[], seed: number[], kind: number[], mat: THREE.Material) => {
        if (!pos.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
        g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
        const p = new THREE.Points(g, mat); p.frustumCulled = false; objs.push(p); this.group.add(p);
      };
      mkPoints(sm, smS, smK, this.smokeMat); mkPoints(gl, glS, glK, this.glowMat);
      // lamp posts
      const lampsIn = v.lamps.filter(l => inside(l.x, l.z));
      if (lampsIn.length) {
        const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 5).translate(0, 1.15, 0), this.matFence, lampsIn.length);
        const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.9, 0.8), toneMapped: false }), lampsIn.length);
        lampsIn.forEach((l, i) => {
          const y = heightAt(l.x, l.z);
          T.position.set(l.x, y, l.z); T.rotation.set(0, 0, 0); T.scale.setScalar(1); T.updateMatrix(); pm.setMatrixAt(i, T.matrix);
          T.position.set(l.x, y + 2.35, l.z); T.updateMatrix(); bulb.setMatrixAt(i, T.matrix);
        });
        [pm, bulb].forEach(m => { m.computeBoundingSphere(); objs.push(m); this.group.add(m); });
      }
      // hàng rào quanh đồng cỏ
      const posts: THREE.Vector3[] = [];
      const seg = 3.2, steps = Math.floor((2 * Math.PI * v.fenceR) / seg);
      const pts: (THREE.Vector3 | null)[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const gap = Math.abs(Math.atan2(Math.sin(a - v.gapA), Math.cos(a - v.gapA))) < 0.1;
        const x = v.x + Math.cos(a) * v.fenceR, z = v.z + Math.sin(a) * v.fenceR;
        pts.push(gap || !inside(x, z) ? null : new THREE.Vector3(x, heightAt(x, z), z));
      }
      const pi: THREE.Vector3[] = []; pts.forEach(p => p && pi.push(p));
      if (pi.length) {
        const pm = new THREE.InstancedMesh(this.postG, this.matFence, pi.length);
        pi.forEach((p, i) => { T.position.copy(p); T.rotation.set(0, 0, 0); T.scale.setScalar(1); T.updateMatrix(); pm.setMatrixAt(i, T.matrix); });
        pm.computeBoundingSphere(); objs.push(pm); this.group.add(pm);
        const rails: THREE.Matrix4[] = [];
        const q = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1]; if (!a || !b) continue;
          const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y, L = Math.hypot(dx, dz);
          qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dz, dx)); qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, L));
          q.copy(qy).multiply(qz);
          for (const hy of [0.45, 0.88]) {
            rails.push(new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + hy, (a.z + b.z) / 2), q, new THREE.Vector3(Math.hypot(L, dy), 1, 1)));
          }
        }
        if (rails.length) {
          const rm = new THREE.InstancedMesh(this.railG, this.matFence, rails.length);
          rails.forEach((m, i) => rm.setMatrixAt(i, m)); rm.computeBoundingSphere(); objs.push(rm); this.group.add(rm);
        }
      }
      posts.length = 0;
      // động vật
      for (const kind of ['sheep', 'cow'] as const) {
        const list = v.animals.filter(a => a.kind === kind && inside(a.x, a.z));
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(kind === 'sheep' ? this.sheepG : this.cowG, this.matAnimal, list.length);
        im.frustumCulled = false;
        list.forEach((a, i) => {
          const inst: AnimalInst = { mesh: im, i, x: a.x, z: a.z, h: a.heading, speed: 0, timer: a.seed * 6, graze: true, seed: a.seed, village: v, kind, bob: a.seed * 10 };
          animals.push(inst);
          T.position.set(a.x, heightAt(a.x, a.z), a.z); T.rotation.set(0, a.heading, 0); T.scale.setScalar(1); T.updateMatrix(); im.setMatrixAt(i, T.matrix);
        });
        objs.push(im); this.group.add(im);
      }
    }
    return { objs, animals };
  }

  update(dt: number, camX: number, camZ: number, budget: number) {
    const R = 4, ccx = Math.floor(camX / FEAT_CHUNK), ccz = Math.floor(camZ / FEAT_CHUNK);
    for (const [key, d] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > R + 1 || Math.abs(z - ccz) > R + 1) {
        d.objs.forEach(o => { this.group.remove(o); (o as THREE.InstancedMesh).dispose?.(); });
        this.chunks.delete(key);
      }
    }
    const want: [number, number, number][] = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const key = `${ccx + dx},${ccz + dz}`;
      if (!this.chunks.has(key)) want.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    }
    want.sort((a, b) => a[2] - b[2]);
    let made = 0;
    for (const [x, z] of want) { if (made >= budget) break; this.chunks.set(`${x},${z}`, this.buildChunk(x, z)); made++; }

    // hoạt hình động vật gần camera
    const T = this.tmp, touched = new Set<THREE.InstancedMesh>();
    for (const [key, d] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > 2 || Math.abs(z - ccz) > 2) continue;
      for (const a of d.animals) {
        a.timer -= dt;
        if (a.timer <= 0) { a.graze = Math.random() < 0.6; a.timer = 3 + Math.random() * 8; a.speed = a.graze ? 0 : (a.kind === 'sheep' ? 0.45 : 0.35); a.h += (Math.random() - 0.5) * 1.6; }
        const dv = Math.hypot(a.x - a.village.x, a.z - a.village.z);
        if (dv > a.village.fenceR - 6) { a.h = Math.atan2(-(a.village.z - a.z), a.village.x - a.x); }
        a.x += Math.cos(a.h) * a.speed * dt; a.z += -Math.sin(a.h) * a.speed * dt;
        a.bob += dt * a.speed * 6;
        const y = heightAt(a.x, a.z) + (a.speed > 0 ? Math.abs(Math.sin(a.bob)) * 0.035 : 0);
        T.position.set(a.x, y, a.z); T.rotation.set(0, a.h, a.graze ? -0.18 : 0); T.scale.setScalar(1); T.updateMatrix();
        a.mesh.setMatrixAt(a.i, T.matrix); touched.add(a.mesh);
      }
    }
    touched.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }
}
