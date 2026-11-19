import * as THREE from 'three';
import { U } from '../core/env';
import { heightAt, WATER_Y } from './world';

// Đom đóm + bụi sáng trôi theo gió quanh camera
const vert = /* glsl */ `
attribute float aSeed;
uniform float uTime; uniform float uPx; uniform vec3 uCam; uniform float uAgl; uniform float uFogDensity;
varying float vA; varying float vK;
void main(){
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 2.0) + aSeed * 60.0);
  float dist = -mv.z;
  float size = mix(0.07, 0.16, aSeed);
  gl_PointSize = clamp(size * uPx / max(dist, 0.1), 1.5, 26.0);
  float fade = 1.0 - smoothstep(25.0, 60.0, distance(position.xz, uCam.xz));
  float h = 1.0 - smoothstep(12.0, 45.0, uAgl);
  vA = tw * tw * fade * h;
  vK = aSeed;
}`;
const frag = /* glsl */ `
precision highp float;
varying float vA; varying float vK;
void main(){
  vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0;
  float a = exp(-r * r * 4.5) * vA;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(1.0, 0.85, 0.35), vec3(0.55, 1.0, 0.75), step(0.55, vK));
  gl_FragColor = vec4(c * 2.2, a);
}`;

export class Fireflies {
  readonly points: THREE.Points;
  private pos: Float32Array; private base: Float32Array; private vel: Float32Array;
  private seed: Float32Array; private gh: Float32Array;
  private mat: THREE.ShaderMaterial;
  private n: number; private box = 70;
  aglUniform = { value: 6 };

  constructor(n = 700) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.seed = new Float32Array(n); this.gh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.seed[i] = Math.random();
      this.base[i * 3] = (Math.random() - 0.5) * this.box * 2;
      this.base[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      this.base[i * 3 + 1] = 0.3 + Math.random() * 3.5;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.4; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uPx: U.uPx, uCam: U.uCam, uAgl: this.aglUniform, uFogDensity: U.uFogDensity },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.initialized = false;
  }
  private initialized: boolean;
  private resample(i: number, cx: number, cz: number) {
    const x = cx + this.base[i * 3], z = cz + this.base[i * 3 + 2];
    this.gh[i] = Math.max(heightAt(x, z), WATER_Y);
  }

  update(dt: number, cam: THREE.Vector3, agl: number) {
    this.aglUniform.value = agl;
    const t = U.uTime.value, B = this.box;
    for (let i = 0; i < this.n; i++) {
      const s = this.seed[i];
      let bx = this.base[i * 3], bz = this.base[i * 3 + 2];
      // vị trí tuyệt đối (thế giới); wrap theo hộp quanh camera
      let wx = this.initialized ? this.pos[i * 3] : cam.x + bx;
      let wz = this.initialized ? this.pos[i * 3 + 2] : cam.z + bz;
      let moved = !this.initialized;
      const wind = U.uWind.value;
      this.base[i * 3] += (wind.x * 0.9 + this.vel[i * 3] + Math.sin(t * 0.7 + s * 40) * 0.5) * dt;
      this.base[i * 3 + 2] += (wind.y * 0.9 + this.vel[i * 3 + 2] + Math.cos(t * 0.6 + s * 30) * 0.5) * dt;
      // base giữ ở hệ toạ độ thế giới tương đối gốc; wrap quanh camera
      let ax = this.base[i * 3] , az = this.base[i * 3 + 2];
      const dx = ax - cam.x, dz = az - cam.z;
      if (dx > B) { ax -= 2 * B; moved = true; } else if (dx < -B) { ax += 2 * B; moved = true; }
      if (dz > B) { az -= 2 * B; moved = true; } else if (dz < -B) { az += 2 * B; moved = true; }
      this.base[i * 3] = ax; this.base[i * 3 + 2] = az;
      wx = ax; wz = az;
      if (moved) this.gh[i] = Math.max(heightAt(wx, wz), WATER_Y);
      this.pos[i * 3] = wx; this.pos[i * 3 + 2] = wz;
      this.pos[i * 3 + 1] = this.gh[i] + this.base[i * 3 + 1] + Math.sin(t * 0.9 + s * 50) * 0.5;
    }
    this.initialized = true;
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** gọi một lần khi bắt đầu: đặt hạt xung quanh camera (toạ độ tuyệt đối) */
  seedAround(cam: THREE.Vector3) {
    for (let i = 0; i < this.n; i++) {
      this.base[i * 3] += cam.x; this.base[i * 3 + 2] += cam.z;
    }
    this.initialized = false;
    this.initialized = true;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = this.base[i * 3]; this.pos[i * 3 + 2] = this.base[i * 3 + 2];
      this.gh[i] = Math.max(heightAt(this.pos[i * 3], this.pos[i * 3 + 2]), WATER_Y);
    }
  }
}
