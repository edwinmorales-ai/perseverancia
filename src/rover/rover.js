import * as THREE from 'three';
import { BODY, DECK_TOP, DIFFERENTIAL } from './dimensions.js';
import { createRoverMaterials } from './materials.js';
import { createChassis } from './body.js';
import { createSuspensionSide } from './suspension.js';
import { createMast } from './mast.js';
import { createArm } from './arm.js';
import { box, beam } from './parts.js';

// Barra diferencial: gira en Y sobre la cubierta y une los dos rockers con varillas.
function createDifferential(materials, left, right) {
  const bar = new THREE.Group();
  bar.name = 'diferencial';
  bar.position.set(0, DIFFERENTIAL.y, DIFFERENTIAL.z);
  bar.add(box(DIFFERENTIAL.halfLength * 2, 0.05, 0.06, materials.structure));

  // Varillas de la punta de la barra a la palanca de cada rocker.
  // Por ahora son fijas; en la Fase 3 se recalculan cuando los rockers se muevan.
  const links = new THREE.Group();
  for (const [side, suspension] of [[1, left], [-1, right]]) {
    const barEnd = new THREE.Vector3(side * DIFFERENTIAL.halfLength, DIFFERENTIAL.y, DIFFERENTIAL.z);
    links.add(beam(barEnd, suspension.leverTop, 0.015, materials.structure));
  }

  return { bar, links };
}

// Crea el rover completo. Devuelve el grupo raíz y referencias a las piezas que se animan.
export function createRover({ envMap = null } = {}) {
  const materials = createRoverMaterials(envMap);

  const root = new THREE.Group();
  root.name = 'rover';

  root.add(createChassis(materials));

  const left = createSuspensionSide(materials, 1);
  const right = createSuspensionSide(materials, -1);
  root.add(left.rocker, right.rocker);

  const differential = createDifferential(materials, left, right);
  root.add(differential.bar, differential.links);

  // Mástil: delante a la derecha de la cubierta (derecha del rover = -X).
  const mast = createMast(materials);
  mast.root.position.set(-0.55, DECK_TOP, 0.72);
  root.add(mast.root);

  // Brazo: en el frente del chasis, lado derecho.
  const arm = createArm(materials);
  arm.root.position.set(-0.5, 0.88, BODY.front + 0.17);
  root.add(arm.root);

  // Puntos de referencia de las cámaras que toman fotos reales (los crean mast.js, body.js y arm.js).
  const cameras = Object.fromEntries(
    ['Mastcam_Z_cams', 'NavCams', 'hazcams_front', 'WATSON'].map((name) => [name, root.getObjectByName(name)])
  );

  return {
    root,
    parts: {
      suspension: { left, right },
      differential,
      mast,
      arm,
      cameras,
    },
  };
}
