import * as THREE from 'three';
import { U } from '../core/env';

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform vec3 uFogColor; uniform vec2 uWind;
const vec3 TOP = vec3(0.0016, 0.012, 0.024);
const vec3 MID = vec3(0.006, 0.040, 0.078);

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float hash3(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float fbm(vec2 p){
  float s=0., a=.5;
  for(int i=0;i<5;i++){ s+=vnoise(p)*a; p=p*2.03+vec2(17.1,9.2); a*=.5; }
  return s;
}
float cloudField(vec2 uv, float t){
  vec2 q = uv + vec2(fbm(uv*0.8 + t*0.05), fbm(uv*0.8 - t*0.04 + 5.2))*0.9;
  return fbm(q*1.3 + t*0.02);
}

void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uFogColor*0.9, MID, smoothstep(0.0, 0.18, up));
  col = mix(col, TOP, smoothstep(0.12, 0.85, up));

  float md = clamp(dot(d, uMoonDir), -1.0, 1.0);
  float ang = acos(md);

  // sao
  vec3 sp = d * 260.0; vec3 ip = floor(sp); vec3 fp = fract(sp) - 0.5;
  float hs = hash3(ip);
  float star = step(0.987, hs) * smoothstep(0.5, 0.0, length(fp)) * (0.55 + 0.45*sin(uTime*(1.0+hs*3.0)+hs*80.0));
  star *= smoothstep(0.02, 0.25, d.y);
  vec3 stars = vec3(0.7,0.9,1.0) * star * (0.5 + 3.0*hash3(ip+3.1));

  // dải ngân hà mờ
  float band = exp(-pow(dot(d, normalize(vec3(0.35,0.75,0.55))) * 4.0, 2.0));
  float mw = band * (0.3 + fbm(d.xz*6.0/(d.y+0.4)) ) * smoothstep(0.05,0.4,d.y);
  col += vec3(0.02,0.06,0.09) * mw * 0.9;

  // mây
  float cover = 0.0; vec3 cloudCol = vec3(0.0);
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.22) * 0.55 + uWind * uTime * 0.012;
    float c0 = cloudField(uv, uTime);
    float c1 = cloudField(uv + uMoonDir.xz * 0.05, uTime);
    float dens = smoothstep(0.46, 0.74, c0);
    float clear = smoothstep(0.03, 0.30, ang);
    dens *= mix(0.12, 1.0, clear);
    dens *= smoothstep(0.0, 0.14, d.y);
    float lit = clamp((c0 - c1) * 7.0 + 0.45, 0.0, 1.0);
    float near = 0.25 + 0.75 * exp(-ang * 2.2);
    vec3 dark = vec3(0.010, 0.040, 0.062);
    vec3 bright = vec3(0.30, 0.78, 0.92);
    cloudCol = mix(dark, bright, lit * near);
    cloudCol += uMoonCol * 0.35 * smoothstep(0.55,0.8,c0) * exp(-ang*3.0);
    cover = dens;
  }

  // vầng trăng
  float halo = 0.10 / (1.0 + pow(ang * 14.0, 2.0)) + 0.35 * exp(-ang * 28.0) + 0.9 * exp(-ang*90.0);
  vec3 moonGlow = uMoonCol * halo;

  vec3 b1 = normalize(cross(uMoonDir, vec3(0,1,0))); vec3 b2 = cross(b1, uMoonDir);
  vec2 muv = vec2(dot(d,b1), dot(d,b2)) / 0.028;
  float r = length(muv);
  float disc = 1.0 - smoothstep(0.93, 1.0, r);
  float crater = fbm(muv*2.2 + 3.0);
  float mare = fbm(muv*0.9 + 11.0);
  vec3 moonSurf = uMoonCol * (1.9 + 0.7*crater - 0.9*smoothstep(0.45,0.7,mare));
  moonSurf = mix(moonSurf, vec3(1.6,2.2,2.4), 0.25);

  col += stars * (1.0 - cover);
  col += moonGlow * (1.0 - cover*0.7);
  col = mix(col, cloudCol, cover);
  col += moonGlow * cover * 0.25;
  col = mix(col, moonSurf, disc * (1.0 - cover*0.85));

  // hạ chân trời hoà vào sương mù
  float hz = smoothstep(0.0, 0.10, d.y);
  col = mix(uFogColor, col, hz);
  if (d.y < 0.0) col = uFogColor;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonCol: U.uMoonCol, uFogColor: U.uFogColor, uWind: U.uWind },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
