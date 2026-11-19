import * as THREE from 'three';
import { U } from '../core/env';

/** Biển mây / sương thấp: các lớp phẳng nằm ngang, mờ dần về phía mặt đất (aDepth = độ sâu so với mặt đất). */
export const MIST_LOOK = {
  color: { value: new THREE.Vector3(0.4, 0.5, 0.7) },
  alpha: { value: 0.8 },
};

const vert = /* glsl */ `
attribute float aDepth; attribute float aLayer;
varying float vDepth; varying float vLayer; varying vec3 vWP;
void main(){
  vDepth = aDepth; vLayer = aLayer;
  vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const frag = /* glsl */ `
precision highp float;
varying float vDepth; varying float vLayer; varying vec3 vWP;
uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uMistCol; uniform float uMistAlpha; uniform float uMinDist; uniform vec3 uMoonCol;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=vnoise(p)*a; p=p*2.07+vec2(11.3,7.1); a*=.5; } return s; }
void main(){
  vec3 toC = uCam - vWP; float dist = length(toC);
  vec2 q = vWP.xz + uWind * uTime * (1.2 + vLayer * 0.7);
  float n1 = fbm(q * 0.0075 + vLayer * 7.3);
  float n2 = fbm(q * 0.022 - vLayer * 3.1 + 40.0);
  // lớp càng cao càng chỉ xuất hiện ở chỗ sương dày -> mặt trên bồng bềnh, có chỗ hở
  float thr = 0.30 + vLayer * 0.13;
  float body = smoothstep(thr, thr + 0.30, n1 * 0.8 + n2 * 0.35);
  float a = uMistAlpha * smoothstep(0.0, 9.0, vDepth) * (0.12 + 0.95 * body);
  a *= mix(1.0, 0.8, vLayer * 0.3);
  // lớp gần mặt đất mờ dần khi camera lại gần (khỏi che mất cảnh khi bay xuyên qua)
  a *= smoothstep(3.0, 40.0, dist);
  a *= smoothstep(uMinDist - 70.0, uMinDist + 70.0, dist);
  vec3 col = uMistCol * (0.42 + 0.7 * n1 + 0.3 * n2 - 0.12 * vLayer) + uMoonCol * 0.06 * body;
  float f = dist * uFogDensity;
  col = mix(col, uFogColor, (1.0 - exp(-f * f)) * 0.55);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.96));
}`;

export function createMistMaterial(minDist: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: {
      uTime: U.uTime, uCam: U.uCam, uWind: U.uWind, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uMoonCol: U.uMoonCol,
      uMistCol: MIST_LOOK.color, uMistAlpha: MIST_LOOK.alpha, uMinDist: { value: minDist },
    },
  });
}
