import * as THREE from 'three';
import { SUN_DIRECTION, COLORS } from './config.js';

// Distancia (m) entre el sol y el punto que ilumina. Solo afecta al cálculo de sombras.
const SUN_DISTANCE = 80;
// Mitad del lado (m) del área con sombras alrededor del punto de interés.
const SHADOW_EXTENT = 30;

export function createLights() {
  const group = new THREE.Group();
  group.name = 'luces';

  // Luz ambiente: cielo cálido arriba, rebote rojizo del suelo abajo.
  // Con el sol bajo, el suelo recibe la mitad de luz directa: se compensa con más intensidad.
  const hemiLight = new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 1.25);

  const sunLight = new THREE.DirectionalLight(COLORS.sunLight, 4.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -SHADOW_EXTENT;
  sunLight.shadow.camera.right = SHADOW_EXTENT;
  sunLight.shadow.camera.top = SHADOW_EXTENT;
  sunLight.shadow.camera.bottom = -SHADOW_EXTENT;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_DISTANCE * 2;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.06; // con sol bajo hace falta más para evitar rayas en el suelo
  sunLight.shadow.radius = 4;
  sunLight.shadow.intensity = 0.85; // sombras suaves: el polvo del aire rellena con luz

  group.add(hemiLight, sunLight, sunLight.target);

  // Mueve el sol junto con el punto de interés: así las sombras siempre tienen
  // buena resolución donde está mirando la cámara (y luego, donde esté el rover).
  function follow(point) {
    sunLight.target.position.copy(point);
    sunLight.position.copy(point).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
  }

  return { group, follow };
}
