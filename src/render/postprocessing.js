import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Brillo (bloom): solo lo más luminoso (el disco del sol y reflejos fuertes) "derrama" luz.
const BLOOM = { strength: 0.35, radius: 0.6, threshold: 1.05 };

// Gradación de película sobre la imagen lineal (antes del tone mapping de OutputPass):
// tono cálido, viñeta en los bordes y un grano muy leve.
const FilmGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarmth: { value: new THREE.Vector3(1.05, 1.0, 0.92) },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uWarmth;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb * uWarmth;
      color *= 1.0 - uVignette * smoothstep(0.35, 0.85, distance(vUv, vec2(0.5)));
      color *= 1.0 + (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(color, texel.a); // sin conversión de color: la hace OutputPass al final
    }
  `,
};

// Cadena de post-proceso: escena → brillo → gradación → OutputPass (tone mapping y sRGB).
// Se desactiva con ?nopost en la dirección, para comparar.
export function createPostProcessing(renderer, scene, camera) {
  const enabled = !new URLSearchParams(window.location.search).has('nopost');
  if (!enabled) {
    return {
      enabled,
      render: () => renderer.render(scene, camera),
      setSize: () => {},
    };
  }

  // Render target propio con MSAA: el antialias del canvas no se aplica dentro del composer.
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(buffer.x, buffer.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  // La escena siempre se dibuja en renderTarget2 (cada cuadro hay dos intercambios: gradación y OutputPass).
  // renderTarget1 solo recibe el rectángulo de la gradación: sin MSAA ni profundidad ahorra cientos de MB.
  // Si alguna de esas pasadas se vuelve opcional, la cantidad de intercambios cambia: darle MSAA a ambos.
  composer.renderTarget1.samples = 0;
  composer.renderTarget1.depthBuffer = false;
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold
  );
  composer.addPass(bloom);
  const grade = new ShaderPass(FilmGradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass()); // siempre al final
  composer.setSize(window.innerWidth, window.innerHeight); // usa el mismo pixelRatio que el renderer

  return {
    enabled,
    render(dt) {
      grade.uniforms.uTime.value += dt;
      composer.render(dt);
    },
    setSize(width, height) {
      composer.setSize(width, height);
    },
  };
}
