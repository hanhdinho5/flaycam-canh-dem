import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U } from '../core/env';
import { TEX } from '../core/assets';
import { heightAt, slopeAt, forestDensity, villageAt, WATER_Y } from './world';
import { mulberry32, hashInt, smooth, clamp } from '../core/rand';

export const FEAT_CHUNK = 128;

// ───────── hình học cây (low-poly có biến dạng, tô màu bằng vertex color) ─────────
function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const p = ng.getAttribute('position'), c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return ng;
}
function jitter(g: THREE.BufferGeometry, amt: number, seed: number) {
  const r = mulberry32(seed), p = g.getAttribute('position');
  const map = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(k);
    if (!o) { o = new THREE.Vector3((r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt); map.set(k, o); }
    p.setXYZ(i, p.getX(i) + o.x, p.getY(i) + o.y, p.getZ(i) + o.z);
  }
}

// ───────── lá vẽ bằng canvas (alpha) ─────────
function paintLeafCluster(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; const r = mulberry32(31);
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 108;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const hue = 92 + r() * 34, sat = 42 + r() * 22, lit = 7 + r() * 15 + (1 - d / 108) * 2;
    g.save(); g.translate(x, y); g.rotate(r() * 6.28);
    g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
    g.beginPath(); g.ellipse(0, 0, 9 + r() * 9, 4.5 + r() * 4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `hsla(${hue},${sat}%,${lit + 8}%,0.5)`; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function paintNeedles(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!; const r = mulberry32(57);
  // cành chính + các nhánh phụ có kim thông
  g.lineCap = 'round';
  const needle = (x: number, y: number, ang: number, len: number) => {
    const hue = 135 + r() * 25, sat = 38 + r() * 20, lit = 5 + r() * 9;
    g.strokeStyle = `hsl(${hue},${sat}%,${lit}%)`; g.lineWidth = 1.4 + r() * 1.0;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  };
  g.strokeStyle = 'hsl(25,30%,12%)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 64); g.lineTo(250, 64); g.stroke();
  for (let i = 0; i < 26; i++) {
    const x = 6 + i * 9 + r() * 4, side = i % 2 ? 1 : -1, L = 52 * (1 - x / 290) + 10;
    const ang = side * (1.0 + r() * 0.3) - (side > 0 ? 0 : 0);
    const bx = x + Math.cos(ang) * 0, by = 64;
    g.strokeStyle = 'hsl(25,30%,14%)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 14, by + side * L); g.stroke();
    for (let k = 0; k < 16; k++) {
      const t = k / 16, px = bx + 14 * t, py = by + side * L * t;
      needle(px, py, 0.6 * (r() - 0.5) + (side > 0 ? 1.0 : -1.0), 11 + r() * 12);
      needle(px, py, 0.6 * (r() - 0.5) + (side > 0 ? 0.3 : -0.3) , 10 + r() * 9);
    }
  }
  for (let k = 0; k < 90; k++) { const x = r() * 250; needle(x, 64, (r() - 0.5) * 2.2 + (r() < 0.5 ? 1.57 : -1.57), 9 + r() * 12); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** thêm một thẻ (quad) vào danh sách: tâm, hai trục, kích thước, pháp tuyến mềm, hệ số sáng */
function card(out: { p: number[]; n: number[]; uv: number[]; c: number[] }, cen: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3,
  w: number, h: number, nrm: (v: THREE.Vector3) => THREE.Vector3, shade: (v: THREE.Vector3) => number, tint: [number, number, number]) {
  const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  for (const [sx, sy, u, v] of corners) {
    const P = cen.clone().addScaledVector(ax, sx * w / 2).addScaledVector(ay, sy * h / 2);
    const N = nrm(P), k = shade(P);
    out.p.push(P.x, P.y, P.z); out.n.push(N.x, N.y, N.z); out.uv.push(u, v);
    out.c.push(tint[0] * k, tint[1] * k, tint[2] * k);
  }
}
function toGeom(o: { p: number[]; n: number[]; uv: number[]; c: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
  return g;
}
function barkTrunk(r0: number, r1: number, h: number, y0 = 0, seed = 1) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 8, 4, true); g.translate(0, y0 + h / 2, 0);
  const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h * 0.25);
  const rr = mulberry32(seed), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (rr() - 0.5) * 0.03);
  const n = g; const c = new Float32Array(p.count * 3).fill(0.55);
  n.setAttribute('color', new THREE.BufferAttribute(c, 3)); return n;
}

function makeBroadleaf(): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const r = mulberry32(8), o = { p: [] as number[], n: [] as number[], uv: [] as number[], c: [] as number[] };
  const C = new THREE.Vector3(0, 6.6, 0), RX = 3.9, RY = 3.2;
  const inside = (): THREE.Vector3 => {
    for (;;) { const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (v.lengthSq() < 1) return v; }
  };
  const clumps = Array.from({ length: 5 }, () => ({ o: inside().multiplyScalar(0.55), s: 0.45 + r() * 0.3 }));
  for (let i = 0; i < 130; i++) {
    const cl = clumps[i % clumps.length];
    const d = inside().multiplyScalar(cl.s).add(cl.o); d.clampLength(0, 1.0);
    const cen = new THREE.Vector3(C.x + d.x * RX, C.y + d.y * RY, C.z + d.z * RX);
    // thẻ hướng ngẫu nhiên nhưng nghiêng về phía ngoài
    const out = new THREE.Vector3(d.x, d.y * 0.6, d.z).normalize();
    const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(out).normalize();
    const ay = out.clone().cross(ax).normalize();
    const sz = 2.2 + r() * 1.5, rr = d.length();
    card(o, cen, ax, ay, sz, sz, P => new THREE.Vector3((P.x - C.x) / RX, (P.y - C.y) / RY * 1.0 + 0.25, (P.z - C.z) / RX).normalize(),
      P => 0.30 + 0.75 * Math.min(1, (P.y - 3.2) / 6.5) * (0.55 + 0.45 * rr), [0.9 + r() * 0.2, 1.0, 0.9 + r() * 0.15]);
  }
  const trunk = mergeGeometries([barkTrunk(0.36, 0.2, 3.6, 0, 2), (() => {
    const b = barkTrunk(0.17, 0.08, 3.2, 0, 3); b.rotateZ(0.7); b.translate(0.2, 3.2, 0); return b; })(),
  (() => { const b = barkTrunk(0.15, 0.07, 3.0, 0, 4); b.rotateZ(-0.6); b.translate(-0.2, 3.4, 0.2); return b; })()])!;
  return { trunk, leaves: toGeom(o) };
}
function makePine(): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const r = mulberry32(21), o = { p: [] as number[], n: [] as number[], uv: [] as number[], c: [] as number[] };
  const H = 15, tiers = 17;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = 1.8 + t * (H - 2.6);
    const L = 3.4 * Math.pow(1 - t, 0.85) + 0.5, n = 8 - Math.floor(t * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n + i * 0.37) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const droop = 0.55 - t * 0.25 + (r() - 0.5) * 0.15;
      const axisL = new THREE.Vector3(dir.x, -droop, dir.z).normalize();   // dọc theo cành
      const side = new THREE.Vector3(-dir.z, 0, dir.x);                      // ngang
      const cen = new THREE.Vector3(0, y + (r() - 0.5) * 0.5, 0).addScaledVector(axisL, L * 0.52);
      card(o, cen, axisL, side, L, 1.9 + (1 - t) * 0.8,
        P => new THREE.Vector3(P.x, 0.8 + (P.y - y) * 0.2, P.z).normalize(),
        P => 0.34 + 0.5 * Math.min(1, Math.hypot(P.x, P.z) / (L * 0.9)) * (0.7 + 0.5 * t), [0.9 + r() * 0.15, 1.0, 0.95]);
      // thẻ thứ hai đặt chéo để cành dày hơn
      const side2 = side.clone().applyAxisAngle(axisL, 1.0);
      card(o, cen, axisL, side2, L * 0.9, 1.6, P => new THREE.Vector3(P.x, 0.9, P.z).normalize(),
        P => 0.32 + 0.5 * Math.min(1, Math.hypot(P.x, P.z) / (L * 0.9)), [0.85, 0.98, 0.9]);
    }
  }
  const trunk = barkTrunk(0.34, 0.07, H, 0, 5);
  return { trunk, leaves: toGeom(o) };
}
function makeRock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1); g.scale(1.3, 0.7, 1);
  jitter(g, 0.45, 5);
  return colorize(g, (x, y) => { const k = 0.7 + 0.5 * clamp(y + 0.5, 0, 1); return [0.075 * k, 0.09 * k, 0.105 * k]; });
}

// vật liệu có gió + thu nhỏ dần ở xa (dùng cho cả thân lẫn lá)
function swayMaterial(sway: number, leaf: boolean, map: THREE.Texture | null, nmap: THREE.Texture | null): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0, map: map ?? undefined, normalMap: nmap ?? undefined,
    side: leaf ? THREE.DoubleSide : THREE.FrontSide, alphaTest: leaf ? 0.4 : 0, alphaToCoverage: leaf,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uCam = U.uCam;
    sh.vertexShader = 'uniform float uTime; uniform vec2 uWind; uniform vec3 uCam;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3]);
      float dcam = distance(ip.xz, uCam.xz);
      transformed *= 1.0 - smoothstep(380.0, 520.0, dcam);
      mat3 imx = mat3(instanceMatrix);
      vec3 wl = normalize(transpose(imx) * vec3(uWind.x, 0.0, uWind.y));
      float y2 = max(transformed.y - 1.5, 0.0); y2 *= y2;
      float g = 0.5 + 0.5 * sin(dot(ip.xz, uWind) * 0.05 - uTime * 1.05);
      float amp = (0.25 + g * 0.75) * y2 * ${sway.toFixed(4)};
      transformed += wl * amp;
      transformed.x += sin(uTime * 2.1 + ip.x * 0.7 + ip.z * 0.3 + position.y * 0.9) * y2 * ${(sway * 0.30).toFixed(4)};
      transformed.z += cos(uTime * 1.7 + ip.z * 0.6 + position.x * 0.8) * y2 * ${(sway * 0.30).toFixed(4)};`,
    );
    if (leaf) {
      // pháp tuyến mềm theo tán cây: không lật khi nhìn mặt sau thẻ
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    }
    // viền sáng xanh ánh trăng quanh tán lá
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.012, 0.050, 0.065) * 0.5 * pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);`,
    );
  };
  return m;
}

export class TreeManager {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Object3D[]>();
  private pine = makePine(); private broad = makeBroadleaf(); private rock = makeRock();
  private leafBroad = swayMaterial(0.0030, true, paintLeafCluster(), null);
  private leafPine = swayMaterial(0.0030, true, paintNeedles(), null);
  private matBark = swayMaterial(0.0010, false, TEX.bark_brown_02_diff ?? null, TEX.bark_brown_02_nor ?? null);
  private matRock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  radius = 4; attempts = 170;

  private build(cx: number, cz: number): THREE.Object3D[] {
    const r = mulberry32(hashInt(cx, cz, 777));
    const ox = cx * FEAT_CHUNK, oz = cz * FEAT_CHUNK;
    const pines: THREE.Matrix4[] = [], broads: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    for (let i = 0; i < this.attempts; i++) {
      const x = ox + r() * FEAT_CHUNK, z = oz + r() * FEAT_CHUNK;
      const h = heightAt(x, z);
      const rr = r(), rr2 = r(), rr3 = r(), rr4 = r();
      if (h < 1.1) continue;
      const v = villageAt(x, z);
      const vd = v ? Math.hypot(x - v.x, z - v.z) : 999;
      if (vd < 44) continue;
      if (Math.hypot(x - 55, z) < 34) continue; // chừa chỗ camera xuất phát
      const alt = smooth(95, 130, h + (rr2 - 0.5) * 30);
      const fd = forestDensity(x, z) * (1 - alt);
      const sl = slopeAt(x, z);
      if (sl > 0.75) continue;
      if (rr < 0.05 && alt < 0.9) { // đá tảng
        p.set(x, h - 0.2, z); const sc = 0.5 + rr2 * 1.6;
        q.setFromEuler(e.set(0, rr3 * 6.28, 0)); s.set(sc, sc * 0.8, sc * (0.8 + rr4 * 0.5));
        rocks.push(m.clone().compose(p, q, s)); continue;
      }
      const prob = fd * 0.95 + (alt < 0.5 ? 0.025 : 0) + (vd < 70 ? 0.08 : 0);
      if (rr2 > prob) continue;
      const sc = 0.62 + rr3 * 0.75 + fd * 0.2;
      p.set(x, h - 0.15, z);
      q.setFromEuler(e.set((rr4 - 0.5) * 0.06, rr * 40, (rr3 - 0.5) * 0.06));
      s.set(sc * (0.85 + rr4 * 0.3), sc, sc * (0.85 + rr * 0.3));
      const mat = m.clone().compose(p, q, s);
      const pineChance = 0.45 + alt * 0.5 + (h > 28 ? 0.2 : 0);
      (rr4 < pineChance ? pines : broads).push(mat);
    }
    const out: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      out.push(im); this.group.add(im);
    };
    add(this.pine.trunk, this.matBark, pines); add(this.pine.leaves, this.leafPine, pines);
    add(this.broad.trunk, this.matBark, broads); add(this.broad.leaves, this.leafBroad, broads);
    add(this.rock, this.matRock, rocks);
    return out;
  }

  update(camX: number, camZ: number, agl: number, budget: number): number {
    const ccx = Math.floor(camX / FEAT_CHUNK), ccz = Math.floor(camZ / FEAT_CHUNK), R = this.radius;
    for (const [key, objs] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > R + 1 || Math.abs(z - ccz) > R + 1) {
        objs.forEach(o => { this.group.remove(o); (o as THREE.InstancedMesh).dispose(); });
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
    for (const [x, z] of want) {
      if (made >= budget) break;
      this.chunks.set(`${x},${z}`, this.build(x, z)); made++;
    }
    return made;
  }
}
export { WATER_Y };
