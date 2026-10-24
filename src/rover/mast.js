import * as THREE from 'three';
import { box, cylinder, cylinderZ } from './parts.js';

const BASE_HEIGHT = 0.12;
const COLUMN_HEIGHT = 0.66;

// Mástil de sensores remotos (RSM) con la cabeza de cámaras.
//
// Jerarquía:
//   root (se fija sobre la cubierta)
//   └── azimuth (gira en Y: mirar a los lados)
//       └── elevation (gira en X: mirar arriba/abajo)
//           └── head: Mastcam-Z, SuperCam y Navcams
export function createMast(materials) {
  const root = new THREE.Group();
  root.name = 'mastil';

  const base = cylinder(0.08, 0.1, BASE_HEIGHT, materials.body);
  base.position.y = BASE_HEIGHT / 2;
  root.add(base);

  const azimuth = new THREE.Group();
  azimuth.position.y = BASE_HEIGHT;
  root.add(azimuth);

  const column = cylinder(0.05, 0.055, COLUMN_HEIGHT, materials.body);
  column.position.y = COLUMN_HEIGHT / 2;
  azimuth.add(column);

  const elevation = new THREE.Group();
  elevation.position.y = COLUMN_HEIGHT;
  azimuth.add(elevation);

  // Articulación de elevación.
  const joint = cylinder(0.06, 0.06, 0.14, materials.dark);
  joint.rotation.z = Math.PI / 2;
  elevation.add(joint);

  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.03);
  elevation.add(head);

  // Barra de cámaras.
  head.add(box(0.44, 0.13, 0.2, materials.body));

  // Mastcam-Z: par de cámaras con zoom a los lados.
  for (const x of [-0.14, 0.14]) {
    const housing = box(0.1, 0.1, 0.06, materials.dark);
    housing.position.set(x, 0, 0.12);
    head.add(housing);
    const lens = cylinderZ(0.032, 0.04, materials.lens, 20);
    lens.position.set(x, 0, 0.16);
    head.add(lens);
  }

  // Navcams: dos cámaras pequeñas al centro, abajo.
  for (const x of [-0.045, 0.045]) {
    const lens = cylinderZ(0.016, 0.03, materials.lens, 12);
    lens.position.set(x, -0.035, 0.115);
    head.add(lens);
  }

  // SuperCam: caja grande arriba con su ventana circular (láser y telescopio).
  const superCam = box(0.22, 0.15, 0.28, materials.body);
  superCam.position.set(0, 0.14, 0.02);
  head.add(superCam);
  const window_ = cylinderZ(0.055, 0.02, materials.lens, 32);
  window_.position.set(0, 0.14, 0.17);
  head.add(window_);
  const rim = cylinderZ(0.07, 0.02, materials.dark, 32);
  rim.position.set(0, 0.14, 0.16);
  head.add(rim);

  // Puntos de referencia de las cámaras (para los puntos brillantes): un poco delante de cada lente.
  // +X de la cabeza es la izquierda del rover: ahí está la Mastcam-Z izquierda.
  head.add(createAnchor('Mastcam_Z_cams', 0.14, 0, 0.21));
  head.add(createAnchor('NavCams', 0, -0.035, 0.15));

  return { root, azimuth, elevation, head };
}

function createAnchor(name, x, y, z) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.set(x, y, z);
  return anchor;
}
