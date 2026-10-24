import * as THREE from 'three';
import { createSky } from './sky.js';
import { COLORS } from './config.js';

// Mapa de entorno con el cielo marciano y un suelo rojizo, para los reflejos de los metales del rover.
export function createEnvironmentMap(renderer) {
  const envScene = new THREE.Scene();
  envScene.add(createSky());

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(400, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: COLORS.soil })
  );
  ground.position.y = -1;
  envScene.add(ground);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
  pmrem.dispose();
  return target.texture;
}
