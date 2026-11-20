import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Cân màu nhẹ sau khi chuyển sang không gian màu màn hình.
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Vector3(0.98, 1.0, 1.02) }, uSat: { value: 0.94 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uShadow; uniform float uSat; varying vec2 vUv;
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
      col *= mix(uShadow, vec3(1.0), smoothstep(0.0, 0.5, dot(col, luma)));
      col = mix(vec3(dot(col, luma)), col, uSat);
      float edge = smoothstep(0.2, 0.71, length(vUv - 0.5));
      col *= 1.0 - 0.12 * edge;
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
  }
  render(dt: number) { this.composer.render(dt); }
}
