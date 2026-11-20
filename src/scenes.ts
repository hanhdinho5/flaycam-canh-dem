import type { WorldParams } from './world/world';

type V3 = [number, number, number];

export interface SceneDef {
  id: string; name: string; emoji: string;
  world: WorldParams;
  start: { x: number; z: number; lookAt: { x: number; z: number }; agl: number; clearR?: number };
  look: {
    fogColor: string; fogDensity: number;
    skyTop: V3; skyMid: V3; moonDir: V3; moonColor: string; moonOn: number; moonSize: number; moonBrightness?: number;
    stars: [number, number]; milkyWay: number; cloud: [number, number]; cloudLit: V3; cloudDark: V3;
    moonLight: { color: number; intensity: number };
    hemi: { sky: number; ground: number; intensity: number };
    fill: { color: number; intensity: number; pos: V3 };
    exposure: number; bloom: number; gradeShadow: V3; gradeSat: number;
    grassTint: V3; rockMul: V3; snowCol: V3;
    grass: number; trees: { density: number; pine: number; slim: boolean; scale: number }; fireflies: number;
    water: 'plain' | 'mirror';
    mist: { y: number; layers: number; alpha: number; color: V3 } | null;
  };
}

export const SCENES: SceneDef[] = [
  // ───────── 1. Đồng cỏ Thụy Sĩ ─────────
  {
    id: 'meadow', name: 'Đồng cỏ Thụy Sĩ', emoji: '🌿',
    world: {
      seed: 20261119,
      hill: { base: 8, amp: 11, freq: 0.0038 },
      mount: { freq: 0.00052, t0: 0.02, t1: 0.42, base: 30, amp: 235, pow: 2.15, ridge: 0.62, fine: 14, wall: 0.95, spawnClear: [350, 650] },
      lake: { t0: 0.3, t1: 0.52, depth: 2.6 },
      river: true,
      forest: { t0: -0.22, t1: 0.26 },
      village: { chance: 0.6, yMin: 2.5, yMax: 20, flat: false, plateau: [40, 48], fence: true, animals: true, types: [0, 0, 1, 2, 2], n: [4, 7], houseR: [9, 36], forced: { x: 95, z: -150 } },
      snowLine: 165, rockLine: 95, treeLine: 95,
    },
    start: { x: 55, z: 0, lookAt: { x: 95, z: -150 }, agl: 9 },
    look: {
      fogColor: '#263845', fogDensity: 0.0016,
      skyTop: [0.0016, 0.012, 0.024], skyMid: [0.006, 0.040, 0.078], moonDir: [0.15, 0.30, -0.94], moonColor: '#e3ebf4', moonOn: 1, moonSize: 0.012,
      stars: [0.987, 1.0], milkyWay: 0.35, cloud: [0.5, 0], cloudLit: [0.29, 0.40, 0.49], cloudDark: [0.010, 0.040, 0.062],
      moonLight: { color: 0xd6e1ee, intensity: 2.0 }, hemi: { sky: 0x647d96, ground: 0x384439, intensity: 0.85 }, fill: { color: 0x8199b3, intensity: 0.55, pos: [0.5, 0.55, 0.7] },
      exposure: 1.15, bloom: 0.55, gradeShadow: [0.98, 1.0, 1.02], gradeSat: 0.94,
      grassTint: [1, 1, 1], rockMul: [1, 1, 1], snowCol: [0.62, 0.70, 0.78],
      grass: 1, trees: { density: 1, pine: 0.45, slim: false, scale: 1 }, fireflies: 1,
      water: 'plain', mist: { y: 1.5, layers: 2, alpha: 0.35, color: [0.27, 0.35, 0.42] },
    },
  },
  // ───────── 2. Cao nguyên mây (kiểu Dolomites) ─────────
  {
    id: 'plateau', name: 'Cao nguyên trên mây', emoji: '☁️',
    world: {
      seed: 777001,
      hill: { base: 32, amp: 4, freq: 0.004 },
      mount: { freq: 0.0006, t0: 0.1, t1: 0.4, base: 20, amp: 430, pow: 3.1, ridge: 0.92, fine: 24, wall: 0.95, spawnClear: [380, 700] },
      valley: { depth: 30, freq: 0.0016, t0: 0.14, t1: 0.24, boost: { x: 0, z: -440, r: 230, soft: 120 } },
      lake: { t0: 5, t1: 6, depth: 2 },
      river: false,
      forest: { t0: 0.2, t1: 0.7 },
      village: { chance: 0.55, yMin: 22, yMax: 44, flat: true, plateau: [34, 40], fence: false, animals: false, types: [0, 0, 0, 1], n: [3, 6], houseR: [8, 30], forced: { x: 30, z: -150 } },
      snowLine: 400, rockLine: 40, treeLine: 62,
    },
    start: { x: -8, z: -35, lookAt: { x: 30, z: -200 }, agl: 13, clearR: 60 },
    look: {
      fogColor: '#43516a', fogDensity: 0.00055,
      skyTop: [0.003, 0.008, 0.035], skyMid: [0.016, 0.046, 0.14], moonDir: [0.28, 0.38, -0.88], moonColor: '#fff0d0', moonOn: 1, moonSize: 0.013, moonBrightness: 0.22,
      stars: [0.992, 0.8], milkyWay: 0.12, cloud: [0.55, 1.0], cloudLit: [0.46, 0.58, 0.86], cloudDark: [0.012, 0.022, 0.07],
      moonLight: { color: 0xdde8ff, intensity: 2.5 }, hemi: { sky: 0x3c5f9c, ground: 0x24331f, intensity: 1.15 }, fill: { color: 0xa4b4cf, intensity: 0.95, pos: [-0.3, 0.45, 0.85] },
      exposure: 1.2, bloom: 0.55, gradeShadow: [0.96, 0.99, 1.04], gradeSat: 0.94,
      grassTint: [0.85, 1.0, 0.6], rockMul: [3.4, 3.3, 3.5], snowCol: [0.66, 0.72, 0.85],
      grass: 0.9, trees: { density: 0.3, pine: 0.6, slim: true, scale: 0.9 }, fireflies: 0.2,
      water: 'plain', mist: { y: 16, layers: 4, alpha: 0.98, color: [0.39, 0.45, 0.54] },
    },
  },
  // ───────── 3. Hồ gương dưới dải ngân hà ─────────
  {
    id: 'lake', name: 'Hồ gương dưới dải ngân hà', emoji: '🌌',
    world: {
      seed: 909090,
      hill: { base: 10, amp: 7, freq: 0.004 },
      mount: { freq: 0.0007, t0: -0.35, t1: 0.15, base: 60, amp: 330, pow: 2.2, ridge: 0.8, fine: 18, wall: 0.95, spawnClear: [430, 820] },
      lake: { t0: 0.35, t1: 0.6, depth: 3.2, boost: { x: 0, z: -330, r: 250, soft: 120 } },
      river: true,
      forest: { t0: -0.9, t1: -0.4 },
      village: { chance: 0.15, yMin: 2, yMax: 16, flat: false, plateau: [24, 26], fence: false, animals: false, types: [4, 4, 1], n: [1, 2], houseR: [10, 22],
        forced: { x: 262, z: -330, y: 1.9, kind: 'lakecabin', facing: { x: 0, z: -330 } } },
      snowLine: 80, rockLine: 62, treeLine: 115,
    },
    start: { x: 150, z: -230, lookAt: { x: 300, z: -440 }, agl: 6, clearR: 40 },
    look: {
      fogColor: '#161f30', fogDensity: 0.0008,
      skyTop: [0.001, 0.004, 0.02], skyMid: [0.008, 0.026, 0.085], moonDir: [-0.35, 0.75, 0.55], moonColor: '#9bb8ff', moonOn: 0, moonSize: 0.03,
      stars: [0.974, 1.05], milkyWay: 0.5, cloud: [0, 0], cloudLit: [0.3, 0.4, 0.6], cloudDark: [0.01, 0.02, 0.05],
      moonLight: { color: 0xb6c8e8, intensity: 1.5 }, hemi: { sky: 0x1b3566, ground: 0x0a1a1a, intensity: 0.95 }, fill: { color: 0x3a5f9a, intensity: 0.6, pos: [0.4, 0.6, 0.7] },
      exposure: 1.3, bloom: 0.55, gradeShadow: [0.95, 0.99, 1.04], gradeSat: 0.95,
      grassTint: [0.3, 0.42, 0.3], rockMul: [1.4, 1.45, 1.6], snowCol: [0.72, 0.78, 0.9],
      grass: 0.3, trees: { density: 1.7, pine: 0.97, slim: true, scale: 1.0 }, fireflies: 0,
      water: 'mirror', mist: { y: 0.9, layers: 2, alpha: 0.3, color: [0.3, 0.4, 0.58] },
    },
  },
  // ───────── 4. Dãy núi dưới trăng ─────────
  {
    id: 'moonlit-mountains', name: 'Dãy núi dưới trăng', emoji: '🏔️',
    world: {
      seed: 411803,
      hill: { base: 86, amp: 28, freq: 0.0027 },
      mount: { freq: 0.00076, t0: -0.30, t1: 0.38, base: 42, amp: 420, pow: 3.4, ridge: 0.94, fine: 26, wall: 0.96, spawnClear: [240, 590] },
      valley: { depth: 50, freq: 0.0019, t0: 0.02, t1: 0.42, boost: { x: -5, z: -380, r: 210, soft: 130 } },
      lake: { t0: 5, t1: 6, depth: 0 },
      river: false,
      forest: { t0: -0.42, t1: 0.36 },
      village: null,
      snowLine: 287, rockLine: 145, treeLine: 155,
    },
    start: { x: 28, z: -94, lookAt: { x: -125, z: -960 }, agl: 30, clearR: 26 },
    look: {
      fogColor: '#344157', fogDensity: 0.00068,
      skyTop: [0.002, 0.004, 0.017], skyMid: [0.015, 0.026, 0.060],
      moonDir: [-0.11, 0.33, -0.94], moonColor: '#fff3de', moonOn: 1, moonSize: 0.018, moonBrightness: 1.05,
      stars: [0.978, 1.13], milkyWay: 0.38, cloud: [0.17, 0.0],
      cloudLit: [0.36, 0.41, 0.53], cloudDark: [0.015, 0.021, 0.043],
      moonLight: { color: 0xd9e5f8, intensity: 2.25 },
      hemi: { sky: 0x768cae, ground: 0x383b43, intensity: 0.85 },
      fill: { color: 0x9caec8, intensity: 0.65, pos: [0.65, 0.4, 0.7] },
      exposure: 1.18, bloom: 0.65, gradeShadow: [0.98, 1.0, 1.03], gradeSat: 0.92,
      grassTint: [0.69, 0.74, 0.63], rockMul: [1.55, 1.62, 1.75], snowCol: [0.72, 0.76, 0.83],
      grass: 0.42, trees: { density: 0.86, pine: 1, slim: true, scale: 0.93 }, fireflies: 0,
      water: 'plain', mist: { y: 64, layers: 2, alpha: 0.27, color: [0.34, 0.40, 0.50] },
    },
  },
  // ───────── 5. Vịnh trăng qua rừng thông ─────────
  {
    id: 'moonlit-pine-bay', name: 'Vịnh trăng qua rừng thông', emoji: '🌙',
    world: {
      seed: 581031,
      hill: { base: 20, amp: 18, freq: 0.0042 },
      mount: { freq: 0.00084, t0: -0.02, t1: 0.47, base: 22, amp: 205, pow: 2.6, ridge: 0.76, fine: 12, wall: 0.83, spawnClear: [340, 710] },
      lake: { t0: 0.53, t1: 0.72, depth: 4.5, boost: { x: -65, z: -325, r: 265, soft: 78 } },
      river: false,
      forest: { t0: -0.65, t1: 0.12 },
      village: null,
      snowLine: 330, rockLine: 91, treeLine: 126,
    },
    start: { x: 110, z: -65, lookAt: { x: -120, z: -570 }, agl: 11, clearR: 21 },
    look: {
      fogColor: '#2b3b4c', fogDensity: 0.00087,
      skyTop: [0.002, 0.006, 0.018], skyMid: [0.019, 0.030, 0.055],
      moonDir: [-0.34, 0.18, -0.923], moonColor: '#fff0cf', moonOn: 1, moonSize: 0.017, moonBrightness: 1.12,
      stars: [0.982, 1.07], milkyWay: 0.22, cloud: [0.12, 0],
      cloudLit: [0.43, 0.45, 0.52], cloudDark: [0.016, 0.024, 0.043],
      moonLight: { color: 0xffebc7, intensity: 2.15 },
      hemi: { sky: 0x748cae, ground: 0x344139, intensity: 0.87 },
      fill: { color: 0x91a9c7, intensity: 0.56, pos: [0.6, 0.48, 0.7] },
      exposure: 1.16, bloom: 0.7, gradeShadow: [0.98, 1.0, 1.03], gradeSat: 0.95,
      grassTint: [0.70, 0.78, 0.65], rockMul: [1.36, 1.42, 1.48], snowCol: [0.70, 0.75, 0.82],
      grass: 0.65, trees: { density: 1.28, pine: 0.98, slim: true, scale: 1.08 }, fireflies: 0.22,
      water: 'mirror', mist: { y: 1.8, layers: 1, alpha: 0.19, color: [0.32, 0.40, 0.49] },
    },
  },
];
