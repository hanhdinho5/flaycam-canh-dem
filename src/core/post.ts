import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Color grading kiểu "đêm trăng xanh": đen ngả teal, tương phản nhẹ, vignette, hạt phim
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // quang sai màu rất nhẹ ở rìa
      vec2 dc = uv - 0.5; float r2 = dot(dc, dc);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dc * r2 * 0.012).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dc * r2 * 0.012).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // bóng đổ về teal, vùng sáng giữ cyan lạnh
      col = mix(col, col * vec3(0.78, 1.02, 1.12), 1.0 - smoothstep(0.0, 0.5, l));
      col += vec3(0.0, 0.006, 0.012) * (1.0 - l);
      col = (col - 0.5) * 1.07 + 0.5;
      col = mix(vec3(l), col, 0.92);
      // vignette
      float vig = smoothstep(0.95, 0.25, length(dc) * 1.25);
      col *= mix(0.55, 1.0, vig);
      // hạt phim
      col += (hash(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.022;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  composer: EffectComposer; bloom: UnrealBloomPass; grade: ShaderPass;
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.75, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }
  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }
  render(dt: number, t: number) { this.grade.uniforms.uTime.value = t; this.composer.render(dt); }
}
