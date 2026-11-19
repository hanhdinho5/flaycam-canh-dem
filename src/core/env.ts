import * as THREE from 'three';

// Uniform dùng chung cho mọi shader tự viết (cỏ, nước, hạt, bầu trời...).
export const MOON_DIR = new THREE.Vector3(0.15, 0.30, -0.94).normalize();
export const FOG_COLOR = new THREE.Color('#0e3a50');
export const MOON_COLOR = new THREE.Color('#7fe9ff');

export const U = {
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uWind: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uFogColor: { value: FOG_COLOR.clone() },
  uFogDensity: { value: 0.0016 },
  uPx: { value: 800 },
  uMoonDir: { value: MOON_DIR.clone() },
  uMoonCol: { value: MOON_COLOR.clone() },
  // bầu trời (mỗi không gian một bộ)
  uSkyTop: { value: new THREE.Vector3(0.0016, 0.012, 0.024) },
  uSkyMid: { value: new THREE.Vector3(0.006, 0.040, 0.078) },
  uMoonOn: { value: 1 },
  uMoonSize: { value: 0.028 },
  uStars: { value: new THREE.Vector2(0.987, 1.0) },      // x: ngưỡng (thấp = nhiều sao), y: độ sáng
  uMW: { value: 0.35 },                                  // dải ngân hà
  uCloud: { value: new THREE.Vector2(0.5, 0.0) },        // x: độ phủ mây, y: kiểu (0 cuộn, 1 sợi mảnh)
  uCloudLit: { value: new THREE.Vector3(0.30, 0.78, 0.92) },
  uCloudDark: { value: new THREE.Vector3(0.010, 0.040, 0.062) },
};

export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogDensity;
float fogAmount(float dist){ float f = dist * uFogDensity; return 1.0 - exp(-f * f); }
`;
