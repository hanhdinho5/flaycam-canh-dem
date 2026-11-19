import * as THREE from 'three';
import { heightAt, forestDensity, patchNoise, fineNoise, rockNoise, pathDist, WATER_Y } from './world';
import { clamp, mix, smooth } from '../core/rand';
import { TEX } from '../core/assets';
import { U } from '../core/env';

/** out[0..2] = tint nhân với texture; out[3..6] = mask đá / tuyết / đường mòn / bùn bờ nước */
export function groundColor(x: number, z: number, h: number, slope: number, far: boolean, out: number[]) {
  const patch = patchNoise(x, z) * 0.5 + 0.5;
  const fine = far ? 0.5 : fineNoise(x, z) * 0.5 + 0.5;
  // vùng cỏ xanh tươi xen cỏ vàng úa nhạt
  let r = mix(0.80, 1.18, patch), g = mix(0.88, 1.05, patch), b = mix(0.80, 1.0, patch);
  const v = 0.82 + fine * 0.36;
  r *= v; g *= v; b *= v;
  if (far) {
    const f = forestDensity(x, z) * (1 - smooth(60, 140, h));
    r = mix(r, 0.35, f * 0.75); g = mix(g, 0.45, f * 0.75); b = mix(b, 0.42, f * 0.75);
  }
  const rk = rockNoise(x, z) * 0.5 + 0.5;
  const rock = clamp(smooth(0.40, 0.74, slope) + smooth(95 + rk * 45, 160, h), 0, 1);
  const snow = smooth(165 + patchNoise(x, z) * 30, 225, h) * (1 - smooth(0.85, 1.4, slope));
  let path = 0;
  if (!far) { const pd = pathDist(x, z); if (pd < 2.8) path = smooth(2.8, 1.0, pd); }
  const mud = smooth(1.0, 0.05, h);
  out[0] = r; out[1] = g; out[2] = b; out[3] = rock; out[4] = snow; out[5] = path; out[6] = mud;
}

/** Vật liệu mặt đất: texture ảnh thật, trộn theo mask, triplanar cho đá, normal map, nhoè về màu trung bình ở xa */
export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tGrass: { value: TEX.rocky_terrain_02_diff }, tGrassN: { value: TEX.rocky_terrain_02_nor },
      tPath: { value: TEX.grass_path_2_diff }, tMud: { value: TEX.forest_ground_04_diff },
      tRock: { value: TEX.dark_rock_diff }, tRockN: { value: TEX.dark_rock_nor }, uCam: U.uCam,
    });
    sh.vertexShader = `attribute vec4 aMask; varying vec4 vMask; varying vec3 vWP; varying vec3 vWN;\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vMask = aMask; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = `uniform sampler2D tGrass, tGrassN, tPath, tMud, tRock, tRockN; uniform vec3 uCam;
      varying vec4 vMask; varying vec3 vWP; varying vec3 vWN;
      vec3 tri(sampler2D t, vec3 p, vec3 w, float s){
        return texture2D(t, p.zy*s).rgb*w.x + texture2D(t, p.xz*s).rgb*w.y + texture2D(t, p.xy*s).rgb*w.z;
      }
      \n` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        float dist = distance(vWP, uCam);
        vec3 wn0 = normalize(vWN);
        vec3 bw = pow(abs(wn0), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec2 gp = vWP.xz;
        vec3 g1 = texture2D(tGrass, gp / 7.0).rgb;
        vec3 g2 = texture2D(tGrass, gp / 53.0 + 0.31).rgb;
        float lum2 = dot(g2, vec3(0.33));
        vec3 alb = g1 * (0.55 + 1.1 * lum2) * 1.9;
        vec3 pth = texture2D(tPath, gp / 3.5).rgb * 1.2;
        vec3 mud = texture2D(tMud, gp / 4.0).rgb * 1.1;
        vec3 rk = (tri(tRock, vWP, bw, 0.11) * 0.8 + tri(tRock, vWP, bw, 0.021) * 0.9) * 2.3;
        alb = mix(alb, mud, vMask.w);
        alb = mix(alb, pth, vMask.z);
        alb = mix(alb, rk, vMask.x);
        alb = mix(alb, vec3(0.62, 0.70, 0.78) * (0.8 + 0.4 * dot(rk, vec3(0.33))), vMask.y);
        // ở xa nhoè về màu trung bình để tránh lặp texture / nhiễu
        vec3 avg = mix(vec3(0.050, 0.085, 0.026), vec3(0.045, 0.050, 0.058) * 1.5, vMask.x);
        avg = mix(avg, vec3(0.62, 0.70, 0.78), vMask.y);
        alb = mix(alb, avg * 1.1, smoothstep(140.0, 520.0, dist) * (1.0 - vMask.y * 0.6));
        diffuseColor.rgb = alb;`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 wn = normalize(vWN);
          float nf = 1.0 - smoothstep(40.0, 260.0, dist);
          vec2 gq = vWP.xz / 7.0;
          vec3 tg = texture2D(tGrassN, gq).xyz * 2.0 - 1.0;
          vec3 tg2 = texture2D(tGrassN, vWP.xz / 1.9 + 0.5).xyz * 2.0 - 1.0;
          vec3 bump = vec3(tg.x + tg2.x * 0.5, 0.0, tg.y + tg2.y * 0.5) * 0.9;
          vec3 rx = texture2D(tRockN, vWP.zy * 0.11).xyz * 2.0 - 1.0;
          vec3 ry = texture2D(tRockN, vWP.xz * 0.11).xyz * 2.0 - 1.0;
          vec3 rz = texture2D(tRockN, vWP.xy * 0.11).xyz * 2.0 - 1.0;
          vec3 rb = bw.x * vec3(0.0, rx.y, rx.x) + bw.y * vec3(ry.x, 0.0, ry.y) + bw.z * vec3(rz.x, rz.y, 0.0);
          bump = mix(bump, rb * 1.4, clamp(vMask.x + vMask.y, 0.0, 1.0));
          vec3 pn = normalize(wn + bump * nf);
          normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
        }`);
  };
  return m;
}

const idxCache = new Map<number, THREE.BufferAttribute>();
function sharedIndex(segs: number) {
  let a = idxCache.get(segs);
  if (!a) {
    const n = segs + 1, idx = new Uint32Array(segs * segs * 6);
    let p = 0;
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a0 = j * n + i, b0 = a0 + 1, c0 = a0 + n, d0 = c0 + 1;
      idx[p++] = a0; idx[p++] = c0; idx[p++] = b0;
      idx[p++] = b0; idx[p++] = c0; idx[p++] = d0;
    }
    a = new THREE.BufferAttribute(idx, 1);
    idxCache.set(segs, a);
  }
  return a;
}

export class TerrainLayer {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  constructor(
    readonly size: number, readonly segs: number, readonly radius: number,
    readonly yOff: number, readonly far: boolean, readonly material: THREE.Material,
  ) {}

  private build(cx: number, cz: number): THREE.Mesh {
    const { size, segs } = this, n = segs + 1, step = size / segs;
    const ox = cx * size, oz = cz * size, m = segs + 3;
    const hg = new Float32Array(m * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) hg[j * m + i] = heightAt(ox + (i - 1) * step, oz + (j - 1) * step);
    const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), msk = new Float32Array(n * n * 4);
    const c: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, gi = (j + 1) * m + (i + 1);
      const h = hg[gi];
      const dx = (hg[gi + 1] - hg[gi - 1]) / (2 * step), dz = (hg[gi + m] - hg[gi - m]) / (2 * step);
      const il = 1 / Math.hypot(dx, 1, dz);
      pos[k * 3] = i * step; pos[k * 3 + 1] = h + this.yOff; pos[k * 3 + 2] = j * step;
      nor[k * 3] = -dx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = -dz * il;
      groundColor(ox + i * step, oz + j * step, h, Math.hypot(dx, dz), this.far, c);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      msk[k * 4] = c[3]; msk[k * 4 + 1] = c[4]; msk[k * 4 + 2] = c[5]; msk[k * 4 + 3] = c[6];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMask', new THREE.BufferAttribute(msk, 4));
    g.setIndex(sharedIndex(segs));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(ox, 0, oz);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }

  /** Tạo tối đa `budget` chunk mới (gần nhất trước), xoá chunk quá xa. Trả về số chunk đã tạo. */
  update(camX: number, camZ: number, budget: number): number {
    const ccx = Math.floor(camX / this.size), ccz = Math.floor(camZ / this.size), r = this.radius;
    for (const [key, mesh] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > r + 1 || Math.abs(z - ccz) > r + 1) {
        this.group.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(key);
      }
    }
    let made = 0;
    const want: [number, number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const key = `${ccx + dx},${ccz + dz}`;
      if (!this.chunks.has(key)) want.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
    }
    want.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of want) {
      if (made >= budget) break;
      const mesh = this.build(x, z);
      this.chunks.set(`${x},${z}`, mesh); this.group.add(mesh); made++;
    }
    return made;
  }
}

export { WATER_Y };
