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
};

export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogDensity;
float fogAmount(float dist){ float f = dist * uFogDensity; return 1.0 - exp(-f * f); }
`;
