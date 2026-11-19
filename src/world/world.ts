import { createNoise2D } from 'simplex-noise';
import { mulberry32, hashInt, clamp, mix, smooth } from '../core/rand';

// ───────── Hàm địa hình vô hạn, tham số hoá theo từng "không gian" (scene) ─────────
export interface WorldParams {
  seed: number;
  hill: { base: number; amp: number; freq: number };
  mount: { freq: number; t0: number; t1: number; base: number; amp: number; pow: number; ridge: number; fine: number; wall: number; spawnClear: [number, number] };
  valley?: { depth: number; freq: number; t0: number; t1: number; boost?: { x: number; z: number; r: number; soft: number } };      // thung lũng sâu (biển mây)
  lake: { t0: number; t1: number; depth: number; boost?: { x: number; z: number; r: number; soft: number } };
  river: boolean;
  forest: { t0: number; t1: number };
  village: {
    chance: number; yMin: number; yMax: number; flat: boolean; plateau: [number, number];
    fence: boolean; animals: boolean; types: number[]; n: [number, number]; houseR: [number, number];
    forced: { x: number; z: number; y?: number; kind?: 'lakecabin'; facing?: { x: number; z: number } };
  };
  snowLine: number; rockLine: number; treeLine: number;
}

let nA: N2, nB: N2, nC: N2, nD: N2, nE: N2, nF: N2, nG: N2;
export let P: WorldParams;
const vcache = new Map<number, Village | null>();

export const WATER_Y = 0;

type N2 = (x: number, y: number) => number;
function fbm(n: N2, x: number, z: number, oct: number): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += n(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/** Đổi sang thế giới mới: tạo lại noise theo seed và xoá cache làng. */
export function setWorld(p: WorldParams) {
  P = p;
  const R = mulberry32(p.seed);
  nA = createNoise2D(R); nB = createNoise2D(R); nC = createNoise2D(R); nD = createNoise2D(R);
  nE = createNoise2D(R); nF = createNoise2D(R); nG = createNoise2D(R);
  vcache.clear();
}

/** Vùng núi cao (0..1). Quanh điểm xuất phát luôn là thung lũng / đồng cỏ. */
export function mountainMask(x: number, z: number): number {
  const M = P.mount;
  let m = smooth(M.t0, M.t1, fbm(nA, x * M.freq + 13.7, z * M.freq - 4.2, 3));
  // dãy núi cố định phía trước điểm xuất phát (hướng -z) để cảnh đầu tiên luôn đẹp
  const ahead = smooth(520, 900, -z) * (1 - smooth(1500, 2300, -z)) * (1 - smooth(900, 1700, Math.abs(x + 150)));
  m = Math.max(m, ahead * M.wall);
  const d = Math.hypot(x, z);
  return m * smooth(M.spawnClear[0], M.spawnClear[1], d + Math.max(0, -z - 350) * 0.8);
}

export function forestDensity(x: number, z: number): number {
  return smooth(P.forest.t0, P.forest.t1, fbm(nG, x * 0.0055 + 3, z * 0.0055 - 9, 3));
}

function heightRaw(x: number, z: number): number {
  const m = mountainMask(x, z), H = P.hill, M = P.mount;
  let h = H.base + H.amp * fbm(nB, x * H.freq, z * H.freq, 4) + 1.5 * fbm(nC, x * 0.025 + 7, z * 0.025, 2);
  if (P.valley) {
    const V = P.valley;
    let vm = smooth(V.t0, V.t1, fbm(nF, x * V.freq + 5, z * V.freq - 3, 3));
    if (V.boost) vm = Math.max(vm, smooth(V.boost.r + V.boost.soft, V.boost.r - 40, Math.hypot(x - V.boost.x, z - V.boost.z)));
    h -= V.depth * vm * (1 - smooth(0.02, 0.2, m));
  }
  const fm = fbm(nD, x * 0.0014, z * 0.0014, 4);
  const rid = M.ridge * (1 - Math.abs(fm)) + (1 - M.ridge) * (0.5 + 0.5 * fm); // ridge=1: đỉnh nhọn; thấp: sống núi tròn
  h += m * (M.base + M.amp * Math.pow(rid, M.pow)) + m * M.fine * fbm(nE, x * 0.012, z * 0.012, 3);
  // hồ
  const L = P.lake;
  let lk = smooth(L.t0, L.t1, fbm(nC, x * 0.0011 + 91, z * 0.0011 + 17, 2)) * (1 - smooth(0.05, 0.3, m));
  if (L.boost) lk = Math.max(lk, smooth(L.boost.r + L.boost.soft, L.boost.r - 30, Math.hypot(x - L.boost.x, z - L.boost.z)));
  h = mix(h, -L.depth, lk);
  // suối / sông
  if (P.river) {
    const rv = Math.abs(fbm(nE, x * 0.0016 - 33, z * 0.0016 + 8, 2));
    const ch = (1 - smooth(0.004, 0.032, rv)) * (1 - smooth(0.05, 0.35, m));
    h = mix(h, -1.8, ch);
  }
  return h;
}

// ───────── Thôn bản ─────────
export interface HouseSpec { x: number; z: number; y: number; rot: number; type: 0 | 1 | 2 | 3 | 4; s: number; lit: number }
export interface AnimalSpec { kind: 'sheep' | 'cow'; x: number; z: number; heading: number; seed: number }
export interface Village {
  x: number; z: number; y: number;
  houses: HouseSpec[]; animals: AnimalSpec[];
  lamps: { x: number; z: number }[];
  fenceR: number; gapA: number;
  kind: 'village' | 'lakecabin';
  plateau: [number, number];
}
const CELL = 420;

function makeVillage(cx: number, cz: number, isForced: boolean): Village | null {
  const V = P.village, F = V.forced;
  const r = mulberry32(hashInt(cx, cz, 991 + P.seed));
  if (!isForced && r() > V.chance) return null;
  const x = isForced ? F.x : (cx + 0.27 + 0.46 * r()) * CELL;
  const z = isForced ? F.z : (cz + 0.27 + 0.46 * r()) * CELL;
  const y = isForced && F.y !== undefined ? F.y : heightRaw(x, z);
  if (!isForced) {
    if (y < V.yMin || y > V.yMax || mountainMask(x, z) > 0.08) return null;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, rr = i % 2 ? 62 : 32;
      const hh = heightRaw(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (V.flat ? Math.abs(hh - y) > 9 : (hh < 1.0 || hh > y + 16)) return null;
    }
  }
  const kind = isForced && F.kind ? F.kind : 'village';
  const v: Village = { x, z, y, houses: [], animals: [], lamps: [], fenceR: 60, gapA: r() * Math.PI * 2, kind, plateau: V.plateau };
  const n = V.n[0] + Math.floor(r() * (V.n[1] - V.n[0] + 1));
  const placed: { x: number; z: number; rad: number }[] = [];
  for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
    const a = r() * Math.PI * 2, d = V.houseR[0] + r() * (V.houseR[1] - V.houseR[0]);
    const hx = x + Math.cos(a) * (kind === 'lakecabin' && k === 0 ? 0 : d), hz = z + Math.sin(a) * (kind === 'lakecabin' && k === 0 ? 0 : d);
    const type = (k === 0 && V.types.includes(3) && r() < 0.35 ? 3 : V.types[Math.floor(r() * V.types.length)]) as HouseSpec['type'];
    const rad = type === 1 ? 9 : type === 3 ? 10 : type === 4 ? 9 : 8;
    if (placed.some(p => Math.hypot(p.x - hx, p.z - hz) < p.rad + rad)) continue;
    placed.push({ x: hx, z: hz, rad });
    // quay mặt (+z local) về phía hồ / trung tâm làng, lệch nhẹ
    const fx = kind === 'lakecabin' && F.facing ? F.facing.x : x, fz = kind === 'lakecabin' && F.facing ? F.facing.z : z;
    const rot = Math.atan2(fx - hx, fz - hz) + (r() - 0.5) * (kind === 'lakecabin' ? 0.12 : 0.9);
    v.houses.push({ x: hx, z: hz, y, rot, type, s: 0.9 + r() * 0.3, lit: r() < 0.9 ? 0.7 + r() * 0.6 : 0 });
    v.lamps.push({ x: hx + Math.sin(rot) * 6.2 + Math.cos(rot) * 3, z: hz + Math.cos(rot) * 6.2 - Math.sin(rot) * 3 });
    k++;
  }
  if (V.animals) {
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
  }
  if (!V.fence) v.fenceR = 0;
  if (kind === 'lakecabin') v.lamps.length = 0;
  return v;
}

export function villageInCell(cx: number, cz: number): Village | null {
  const key = (cx + 5000) * 10007 + (cz + 5000);
  let v = vcache.get(key);
  if (v === undefined) {
    const F = P.village.forced;
    v = makeVillage(cx, cz, cx === Math.floor(F.x / CELL) && cz === Math.floor(F.z / CELL));
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
    const d = Math.hypot(x - v.x, z - v.z), [pl, fa] = v.plateau;
    if (d < pl + fa) h = mix(h, v.y, 1 - smooth(pl, pl + fa, d));
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
  if (!v || v.kind === 'lakecabin') return Infinity;
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
