import * as THREE from 'three';

// Texture ảnh thật (Poly Haven, CC0) — public/tex
export const TEX: Record<string, THREE.Texture> = {};

const NAMES: [string, boolean][] = [
  ['rocky_terrain_02_diff', true], ['rocky_terrain_02_nor', false],
  ['grass_path_2_diff', true], ['grass_path_2_nor', false],
  ['forest_ground_04_diff', true], ['forest_ground_04_nor', false],
  ['dark_rock_diff', true], ['dark_rock_nor', false],
  ['brown_planks_09_diff', true], ['brown_planks_09_nor', false],
  ['roof_slates_02_diff', true], ['roof_slates_02_nor', false],
  ['bark_brown_02_diff', true], ['bark_brown_02_nor', false],
];

export function loadAssets(maxAniso: number): Promise<void> {
  const loader = new THREE.TextureLoader();
  return Promise.all(NAMES.map(([n, srgb]) => new Promise<void>(res => {
    loader.load(`${import.meta.env.BASE_URL}tex/${n}.jpg`, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      t.generateMipmaps = true;
      TEX[n] = t; res();
    }, undefined, () => { console.warn('thiếu texture', n); res(); });
  }))).then(() => undefined);
}
