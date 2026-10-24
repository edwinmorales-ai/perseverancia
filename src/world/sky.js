import * as THREE from 'three';
import { SUN_DIRECTION, COLORS } from './config.js';

const SKY_RADIUS = 500;

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenithColor;
  uniform vec3 horizonColor;
  uniform vec3 haloColor;
  uniform vec3 glowColor;
  uniform vec3 sunDirection;
  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);

    // Degradado del horizonte al cenit.
    float height = max(direction.y, 0.0);
    vec3 color = mix(horizonColor, zenithColor, pow(height, 0.9)); // bruma de polvo más alta

    // Resplandor cálido y amplio: el polvo del aire iluminado por el sol de tarde.
    float sunAmount = max(dot(direction, sunDirection), 0.0);
    color += glowColor * pow(sunAmount, 4.0) * 0.22;

    // Núcleo apenas azulado alrededor del sol, típico del cielo marciano.
    color = mix(color, haloColor, pow(sunAmount, 24.0) * 0.45);

    // Disco solar (agrandado para que se vea: el real, desde Marte, mide ~0.35°).
    color += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sunAmount);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Esfera grande vista desde adentro con un degradado de cielo marciano.
// Hay que moverla con la cámara para que nunca se alcance su borde.
export function createSky() {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      zenithColor: { value: new THREE.Color(COLORS.skyZenith) },
      horizonColor: { value: new THREE.Color(COLORS.skyHorizon) },
      haloColor: { value: new THREE.Color(COLORS.sunHalo) },
      glowColor: { value: new THREE.Color(COLORS.sunGlow) },
      sunDirection: { value: SUN_DIRECTION },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  sky.name = 'cielo';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
