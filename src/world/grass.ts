import * as THREE from 'three';
import { U, FOG_GLSL } from '../core/env';
import { heightAt, slopeAt, pathDist, patchNoise, mountainMask, villageAt, P as WORLD } from './world';
import { mulberry32, hashInt, smooth } from '../core/rand';

const CH = 32; // kích thước chunk cỏ (m)

const vert = /* glsl */ `
attribute vec3 aOff; attribute vec4 aP; attribute vec3 aTint;
uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform float uFadeA; uniform float uFadeB;
uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform float uFogDensity;
varying vec3 vCol; varying float vFog;
void main(){
  float h = aP.x, w = aP.y, rot = aP.z, seed = aP.w;
  float d = distance(aOff.xz, uCam.xz);
  float fade = 1.0 - smoothstep(uFadeA, uFadeB, d);
  float t = position.y;
  vec3 p = vec3(position.x * w, t * h * fade, 0.0);
  float c = cos(rot), s = sin(rot);
  vec3 nrm = vec3(-s, 0.35, c);
  p = vec3(c * p.x, p.y, s * p.x);
  // gió: sóng lớn quét qua đồi + rung nhỏ từng ngọn
  vec2 wd = uWind; vec2 wn = vec2(-wd.y, wd.x);
  float ph = dot(aOff.xz, wd) * 0.05 - uTime * 1.05 + sin(dot(aOff.xz, wn) * 0.03 + uTime*0.2) * 2.0;
  float g = 0.5 + 0.5 * sin(ph);
  g = g * g * 0.8 + 0.5 * (0.5 + 0.5 * sin(dot(aOff.xz, wd) * 0.13 - uTime * 1.9));
  float flut = sin(uTime * 3.1 + seed * 40.0 + dot(aOff.xz, vec2(0.7, 0.9))) * 0.12;
  float bend = (0.12 + g * 0.55 + flut) * t * t * h * 0.55;
  p.xz += wd * bend;
  p.y -= bend * 0.28;
  vec3 wp = aOff + p;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  // màu: gốc tối, ngọn sáng xanh ngọc; sóng gió làm sáng lên
  float vv = 0.75 + 0.5 * fract(seed * 7.13);
  vec3 base = aTint * vec3(0.016, 0.034, 0.014);
  vec3 tip  = aTint * vec3(0.085, 0.150, 0.050);
  vec3 col = mix(base, tip, t) * vv;
  float lam = abs(dot(normalize(nrm), uMoonDir)) * 0.7 + 0.35;
  col *= 0.55 + lam * 0.9;
  col += vec3(0.010, 0.050, 0.050) * g * t;                // ánh gió trên ngọn cỏ
  col += uMoonCol * 0.012 * pow(max(dot(normalize(nrm), uMoonDir), 0.0), 2.0) * t; // viền sáng ánh trăng
  vCol = col;
  vFog = 1.0 - exp(-pow(length(mv.xyz) * uFogDensity, 2.0));
}`;

const frag = /* glsl */ `
precision highp float;
uniform vec3 uFogColor;
varying vec3 vCol; varying float vFog;
void main(){ gl_FragColor = vec4(mix(vCol, uFogColor, vFog), 1.0); }
`;

function bladeGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const pos = new Float32Array([
    -0.5, 0.0, 0, 0.5, 0.0, 0,
    -0.40, 0.38, 0, 0.40, 0.38, 0,
    -0.24, 0.72, 0, 0.24, 0.72, 0,
    0.0, 1.0, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  return g;
}

export class GrassField {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private mat: THREE.ShaderMaterial;
  private base = bladeGeometry();
  fadeStart = 42; fadeEnd = 78; density = 7; enabled = true;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
      uniforms: {
        uTime: U.uTime, uCam: U.uCam, uWind: U.uWind, uMoonDir: U.uMoonDir, uMoonCol: U.uMoonCol,
        uFogColor: U.uFogColor, uFogDensity: U.uFogDensity,
        uFadeA: { value: this.fadeStart }, uFadeB: { value: this.fadeEnd },
      },
    });
  }

  setRange(a: number, b: number) {
    this.fadeStart = a; this.fadeEnd = b;
    this.mat.uniforms.uFadeA.value = a; this.mat.uniforms.uFadeB.value = b;
  }

  private build(cx: number, cz: number): THREE.Mesh | null {
    const ox = cx * CH, oz = cz * CH;
    const N = CH + 1, hg = new Float32Array(N * N);
    let any = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = heightAt(ox + i, oz + j); hg[j * N + i] = h; if (h > 0.5 && h < 95) any = true;
    }
    if (!any) return null;
    const rnd = mulberry32(hashInt(cx, cz, 4242));
    const count = Math.floor(CH * CH * this.density * this.densityMul);
    const off = new Float32Array(count * 3), P = new Float32Array(count * 4), T = new Float32Array(count * 3);
    let k = 0, ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < count; i++) {
      const lx = rnd() * CH, lz = rnd() * CH;
      const ix = Math.min(CH - 1, Math.floor(lx)), iz = Math.min(CH - 1, Math.floor(lz));
      const fx = lx - ix, fz = lz - iz, b = iz * N + ix;
      const h = hg[b] * (1 - fx) * (1 - fz) + hg[b + 1] * fx * (1 - fz) + hg[b + N] * (1 - fx) * fz + hg[b + N + 1] * fx * fz;
      const sl = Math.hypot(hg[b + 1] - hg[b], hg[b + N] - hg[b]);
      const wx = ox + lx, wz = oz + lz;
      // mật độ theo độ cao, độ dốc, bờ nước, đường mòn
      let dens = smooth(0.25, 0.9, h) * (1 - smooth(WORLD.treeLine * 0.58, WORLD.treeLine, h)) * (1 - smooth(0.5, 0.95, sl));
      const pd = pathDist(wx, wz);
      if (pd < 2.6) dens *= smooth(0.9, 2.6, pd);
      const r2 = rnd();
      if (r2 > dens) continue;
      const flower = rnd() < 0.018;
      const patch = patchNoise(wx, wz) * 0.5 + 0.5;
      const bh = flower ? 0.32 + rnd() * 0.2 : 0.2 + rnd() * 0.38 + patch * 0.16;
      off[k * 3] = wx; off[k * 3 + 1] = h - 0.03; off[k * 3 + 2] = wz;
      P[k * 4] = bh; P[k * 4 + 1] = flower ? 0.05 : 0.04 + rnd() * 0.03; P[k * 4 + 2] = rnd() * Math.PI; P[k * 4 + 3] = rnd();
      if (flower) {
        const c = rnd();
        // hoa dại: trắng / vàng / tím nhạt, sáng hơn cỏ để bắt ánh trăng
        if (c < 0.4) { T[k * 3] = 3.2; T[k * 3 + 1] = 2.0; T[k * 3 + 2] = 2.6; }
        else if (c < 0.75) { T[k * 3] = 3.6; T[k * 3 + 1] = 2.2; T[k * 3 + 2] = 0.9; }
        else { T[k * 3] = 2.4; T[k * 3 + 1] = 1.4; T[k * 3 + 2] = 3.4; }
      } else {
        const tn = 0.8 + 0.5 * patch;
        T[k * 3] = (0.55 * tn + rnd() * 0.15) * this.tint[0]; T[k * 3 + 1] = (0.95 * tn + rnd() * 0.12) * this.tint[1]; T[k * 3 + 2] = 0.6 * tn * this.tint[2];
      }
      if (h < ymin) ymin = h; if (h > ymax) ymax = h;
      k++;
    }
    if (k === 0) return null;
    const g = new THREE.InstancedBufferGeometry();
    g.index = this.base.index;
    g.setAttribute('position', this.base.getAttribute('position'));
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off.subarray(0, k * 3), 3));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(P.subarray(0, k * 4), 4));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(T.subarray(0, k * 3), 3));
    g.instanceCount = k;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ox + CH / 2, (ymin + ymax) / 2 + 1, oz + CH / 2), CH * 0.72 + (ymax - ymin) / 2 + 2);
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.frustumCulled = true; mesh.layers.set(1); // layer 1: không vẽ trong ảnh phản chiếu mặt hồ
    return mesh;
  }

  /** 0..1.x: nhân mật độ cỏ theo không gian; tint nhân màu ngọn cỏ */
  densityMul = 1; tint: [number, number, number] = [1, 1, 1];
  clear() {
    for (const [, m] of this.chunks) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
  }

  update(camX: number, camZ: number, agl: number, budget: number) {
    this.group.visible = this.enabled && agl < 75;
    const ccx = Math.floor(camX / CH), ccz = Math.floor(camZ / CH), r = Math.ceil(this.fadeEnd / CH) + 1;
    for (const [key, mesh] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > r + 1 || Math.abs(z - ccz) > r + 1) {
        this.group.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(key);
      }
    }
    if (!this.group.visible) return;
    const want: [number, number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const key = `${ccx + dx},${ccz + dz}`;
      if (this.chunks.has(key)) continue;
      const cxm = (ccx + dx + 0.5) * CH - camX, czm = (ccz + dz + 0.5) * CH - camZ;
      const dist = Math.hypot(cxm, czm);
      if (dist < this.fadeEnd + CH) want.push([ccx + dx, ccz + dz, dist]);
    }
    want.sort((a, b) => a[2] - b[2]);
    let made = 0;
    for (const [x, z] of want) {
      if (made >= budget) break;
      const m = this.build(x, z);
      this.chunks.set(`${x},${z}`, m ?? new THREE.Mesh()); // chunk rỗng cũng được ghi nhớ
      if (m) this.group.add(m);
      made++;
    }
  }
}

export { slopeAt, mountainMask, villageAt };
