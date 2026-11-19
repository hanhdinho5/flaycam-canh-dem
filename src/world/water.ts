import * as THREE from 'three';
import { U } from '../core/env';
import { WATER_Y } from './world';

const vert = /* glsl */ `
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vW;
uniform float uTime; uniform vec3 uCam; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec2 uWind;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
vec2 waveGrad(vec2 p, float t){
  // gradient của vài lớp sóng chạy theo hướng gió
  vec2 g = vec2(0.0);
  vec2 wd = uWind;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float k = 0.35 * pow(1.9, fi);
    vec2 dir = normalize(wd + vec2(sin(fi*2.1), cos(fi*1.7)) * 0.9);
    float ph = dot(p, dir) * k + t * (0.8 + fi*0.35);
    g += dir * cos(ph) * k * (0.020 / (1.0 + fi*0.9));
  }
  float e = 0.01;
  float n  = vnoise(p*1.7 + t*0.2);
  g += vec2(vnoise(p*1.7 + vec2(e,0.0) + t*0.2) - n, vnoise(p*1.7 + vec2(0.0,e) + t*0.2) - n) / e * 0.004;
  return g;
}

void main(){
  vec3 V = uCam - vW; float dist = length(V); V /= dist;
  vec2 g = waveGrad(vW.xz, uTime);
  g *= 1.0 / (1.0 + dist * 0.004);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);

  vec3 deep = vec3(0.008, 0.050, 0.070);
  vec3 skyRef = mix(vec3(0.035,0.150,0.230), uFogColor * 1.3, smoothstep(0.45, 0.0, R.y));
  vec3 col = mix(deep, skyRef, clamp(fres + 0.3, 0.0, 1.0));

  float rd = max(dot(R, uMoonDir), 0.0);
  float spec = pow(rd, 900.0) * 6.0 + pow(rd, 120.0) * 0.7 + pow(rd, 12.0) * 0.06;
  col += uMoonCol * spec * (0.4 + 0.6 * smoothstep(0.0, 0.2, 1.0 - cosT));

  float f = dist * uFogDensity;
  col = mix(col, uFogColor, 1.0 - exp(-f*f));
  gl_FragColor = vec4(col, 0.93);
}`;

export function createWater(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true,
    uniforms: {
      uTime: U.uTime, uCam: U.uCam, uMoonDir: U.uMoonDir, uMoonCol: U.uMoonCol,
      uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uWind: U.uWind,
    },
  });
  const g = new THREE.PlaneGeometry(3600, 3600, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = WATER_Y; m.frustumCulled = false; m.renderOrder = 1;
  return m;
}
