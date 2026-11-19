import { createNoise2D } from 'simplex-noise';
import { mulberry32, hashInt, clamp, mix, smooth } from '../core/rand';

// ───────── Hàm địa hình vô hạn (thuần toán học, dùng chung cho mọi thứ) ─────────
const R = mulberry32(20261119);
const nA = createNoise2D(R), nB = createNoise2D(R), nC = createNoise2D(R),
  nD = createNoise2D(R), nE = createNoise2D(R), nF = createNoise2D(R), nG = createNoise2D(R);

export const WATER_Y = 0;

type N2 = (x: number, y: number) => number;
function fbm(n: N2, x: number, z: number, oct: number): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += n(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/** Vùng núi cao (0..1). Quanh điểm xuất phát là thung lũng. */
export function mountainMask(x: number, z: number): number {
  let m = smooth(0.02, 0.42, fbm(nA, x * 0.00052 + 13.7, z * 0.00052 - 4.2, 3));
  // dãy núi cố định phía trước điểm xuất phát (hướng -z) để cảnh đầu tiên luôn đẹp
  const ahead = smooth(520, 900, -z) * (1 - smooth(1500, 2300, -z)) * (1 - smooth(900, 1700, Math.abs(x + 150)));
  m = Math.max(m, ahead * 0.95);
  const d = Math.hypot(x, z);
  return m * smooth(350, 650, d + Math.max(0, -z - 350) * 0.8);
}

export function forestDensity(x: number, z: number): number {
  return smooth(-0.12, 0.38, fbm(nG, x * 0.0055 + 3, z * 0.0055 - 9, 3));
}

function heightRaw(x: number, z: number): number {
  const m = mountainMask(x, z);
  let h = 8 + 11 * fbm(nB, x * 0.0038, z * 0.0038, 4) + 1.5 * fbm(nC, x * 0.025 + 7, z * 0.025, 2);
  const rid = 1 - Math.abs(fbm(nD, x * 0.0014, z * 0.0014, 5));
  h += m * (30 + 240 * Math.pow(rid, 2.6)) + m * 16 * fbm(nE, x * 0.012, z * 0.012, 3);
  // hồ
  const lk = smooth(0.3, 0.52, fbm(nC, x * 0.0011 + 91, z * 0.0011 + 17, 2)) * (1 - smooth(0.05, 0.3, m));
  h = mix(h, -2.6, lk);
  // suối / sông
  const rv = Math.abs(fbm(nE, x * 0.0016 - 33, z * 0.0016 + 8, 2));
  const ch = (1 - smooth(0.004, 0.032, rv)) * (1 - smooth(0.05, 0.35, m));
  h = mix(h, -1.8, ch);
  return h;
}

// ───────── Thôn bản ─────────
export interface HouseSpec { x: number; z: number; y: number; rot: number; type: 0 | 1 | 2 | 3; s: number; lit: number }
export interface AnimalSpec { kind: 'sheep' | 'cow'; x: number; z: number; heading: number; seed: number }
export interface Village {
  x: number; z: number; y: number;
  houses: HouseSpec[]; animals: AnimalSpec[];
  lamps: { x: number; z: number }[];
  fenceR: number; gapA: number;
}
const CELL = 420, PLATEAU = 40, FALL = 48;
const vcache = new Map<number, Village | null>();

function makeVillage(cx: number, cz: number, forced?: { x: number; z: number }): Village | null {
  const r = mulberry32(hashInt(cx, cz, 991));
  if (!forced && r() > 0.6) return null;
  const x = forced ? forced.x : (cx + 0.27 + 0.46 * r()) * CELL;
  const z = forced ? forced.z : (cz + 0.27 + 0.46 * r()) * CELL;
  const y = heightRaw(x, z);
  if (!forced) {
    if (y < 2.5 || y > 20 || mountainMask(x, z) > 0.08) return null;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, rr = i % 2 ? 62 : 32;
      const hh = heightRaw(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (hh < 1.0 || hh > y + 16) return null;
    }
  }
  const v: Village = { x, z, y, houses: [], animals: [], lamps: [], fenceR: 60, gapA: r() * Math.PI * 2 };
  const n = 4 + Math.floor(r() * 4);
  const placed: { x: number; z: number; rad: number }[] = [];
  for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
    const a = r() * Math.PI * 2, d = 9 + r() * 27;
    const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
    const type: 0 | 1 | 2 | 3 = k === 0 && r() < 0.35 ? 3 : (([0, 0, 1, 2, 2][Math.floor(r() * 5)]) as 0 | 1 | 2);
    const rad = type === 1 ? 9 : type === 3 ? 10 : 8;
    if (placed.some(p => Math.hypot(p.x - hx, p.z - hz) < p.rad + rad)) continue;
    placed.push({ x: hx, z: hz, rad });
    // quay mặt (+z local) về phía trung tâm làng, lệch nhẹ
    const rot = Math.atan2(x - hx, z - hz) + (r() - 0.5) * 0.9;
    v.houses.push({ x: hx, z: hz, y, rot, type, s: 0.9 + r() * 0.3, lit: r() < 0.85 ? 0.7 + r() * 0.6 : 0 });
    v.lamps.push({ x: hx + Math.sin(rot) * 6.2 + Math.cos(rot) * 3, z: hz + Math.cos(rot) * 6.2 - Math.sin(rot) * 3 });
    k++;
  }
  const ns = 9 + Math.floor(r() * 8), nc = 3 + Math.floor(r() * 3);
  for (let i = 0; i < ns + nc; i++) {
    for (let t = 0; t < 20; t++) {
      const a = r() * Math.PI * 2, d = 6 + Math.sqrt(r()) * 46;
      const ax = x + Math.cos(a) * d, az = z + Math.sin(a) * d;
      if (placed.some(p => Math.hypot(p.x - ax, p.z - az) < p.rad)) continue;
      v.animals.push({ kind: i < ns ? 'sheep' : 'cow', x: ax, z: az, heading: r() * 6.28, seed: r() });
      break;
    }
  }
  return v;
}

// Làng khởi đầu cố định, nằm ngay trước mặt camera lúc bắt đầu
export const START_VILLAGE = { x: 95, z: -150 };

export function villageInCell(cx: number, cz: number): Village | null {
  const key = (cx + 5000) * 10007 + (cz + 5000);
  let v = vcache.get(key);
  if (v === undefined) {
    const sc = Math.floor(START_VILLAGE.x / CELL), sz = Math.floor(START_VILLAGE.z / CELL);
    v = makeVillage(cx, cz, cx === sc && cz === sz ? START_VILLAGE : undefined);
    vcache.set(key, v);
  }
  return v;
}
export function villageAt(x: number, z: number): Village | null {
  return villageInCell(Math.floor(x / CELL), Math.floor(z / CELL));
}
export function villagesNear(x: number, z: number, rad: number): Village[] {
  const out: Village[] = [];
  const c0 = Math.floor((x - rad) / CELL), c1 = Math.floor((x + rad) / CELL);
  const d0 = Math.floor((z - rad) / CELL), d1 = Math.floor((z + rad) / CELL);
  for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
    const v = villageInCell(i, j);
    if (v) out.push(v);
  }
  return out;
}

export function heightAt(x: number, z: number): number {
  let h = heightRaw(x, z);
  const v = villageAt(x, z);
  if (v) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d < PLATEAU + FALL) h = mix(h, v.y, 1 - smooth(PLATEAU, PLATEAU + FALL, d));
  }
  return h;
}

export function slopeAt(x: number, z: number, e = 1.5): number {
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** khoảng cách tới đường mòn trong làng (tính theo m) — Infinity nếu không ở trong làng */
export function pathDist(x: number, z: number): number {
  const v = villageAt(x, z);
  if (!v) return Infinity;
  if (Math.hypot(x - v.x, z - v.z) > 48) return Infinity;
  let best = Infinity;
  for (const h of v.houses) {
    const fx = h.x + Math.sin(h.rot) * 5, fz = h.z + Math.cos(h.rot) * 5;
    const ax = v.x, az = v.z, bx = fx - ax, bz = fz - az;
    const t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz + 1e-6), 0, 1);
    const d = Math.hypot(x - (ax + bx * t), z - (az + bz * t));
    if (d < best) best = d;
  }
  return best;
}

// noise phụ cho màu đất / hoa
export const patchNoise = (x: number, z: number) => fbm(nF, x * 0.012, z * 0.012, 2);
export const fineNoise = (x: number, z: number) => nF(x * 0.21 + 40, z * 0.21 - 7);
export const rockNoise = (x: number, z: number) => fbm(nG, x * 0.05, z * 0.05, 3);
export { fbm };
