import * as THREE from 'three';
import { BODY, DECK_TOP, WHEEL_X, ROCKER_PIVOT, DIFFERENTIAL } from './dimensions.js';
import { box, beam, cylinder, cylinderX, cylinderZ } from './parts.js';

// Par de cámaras de navegación de riesgos (Hazcams) en una barra.
function createHazcamBar(materials, z, facing) {
  const bar = new THREE.Group();
  const housing = box(0.9, 0.08, 0.08, materials.dark);
  bar.add(housing);
  for (const x of [-0.36, -0.12, 0.12, 0.36]) {
    const lens = cylinderZ(0.022, 0.03, materials.lens, 16);
    lens.position.set(x, 0, facing * 0.05);
    bar.add(lens);
  }
  bar.position.set(0, BODY.bottom + 0.06, z);
  return bar;
}

// Generador de radioisótopos (MMRTG) en la parte trasera, inclinado hacia arriba.
function createMMRTG(materials) {
  const rtg = new THREE.Group();
  rtg.name = 'mmrtg';

  rtg.add(cylinder(0.17, 0.17, 0.62, materials.dark, 24)); // núcleo

  // 8 aletas radiales que disipan el calor.
  const FIN_COUNT = 8;
  for (let i = 0; i < FIN_COUNT; i++) {
    const angle = (i / FIN_COUNT) * Math.PI * 2;
    const fin = box(0.15, 0.6, 0.012, materials.black);
    fin.rotation.y = angle;
    fin.position.set(Math.cos(angle) * 0.245, 0, -Math.sin(angle) * 0.245);
    rtg.add(fin);
  }

  // Tapas de los extremos.
  for (const y of [-0.32, 0.32]) {
    const cap = cylinder(0.19, 0.19, 0.04, materials.structure, 24);
    cap.position.y = y;
    rtg.add(cap);
  }

  // Eje inclinado 40° sobre la horizontal, hacia atrás y arriba.
  rtg.rotation.x = THREE.MathUtils.degToRad(-50);
  rtg.position.set(0, 1.157, BODY.back - 0.306);
  return rtg;
}

// Antena de alta ganancia (HGA): panel hexagonal sobre un soporte con cardán.
function createHighGainAntenna(materials) {
  const hga = new THREE.Group();
  hga.name = 'antena-alta-ganancia';
  const post = cylinder(0.04, 0.05, 0.18, materials.structure);
  post.position.y = 0.09;
  hga.add(post);

  const dish = cylinder(0.3, 0.3, 0.035, materials.dark, 6);
  dish.position.y = 0.22;
  dish.rotation.set(THREE.MathUtils.degToRad(-25), 0, THREE.MathUtils.degToRad(20));
  hga.add(dish);

  hga.position.set(0.45, DECK_TOP, -0.45);
  return hga;
}

// Chasis: caja de electrónica, cubierta, cámaras, antenas, MMRTG y ejes de los rockers.
export function createChassis(materials) {
  const chassis = new THREE.Group();
  chassis.name = 'chasis';

  const width = BODY.halfWidth * 2;
  const height = BODY.top - BODY.bottom;
  const depth = BODY.front - BODY.back;
  const centerZ = (BODY.front + BODY.back) / 2;

  const web = box(width, height, depth, materials.body);
  web.position.set(0, BODY.bottom + height / 2, centerZ);
  chassis.add(web);

  // Panel inferior con aislante dorado.
  const belly = box(width - 0.06, 0.02, depth - 0.06, materials.gold);
  belly.position.set(0, BODY.bottom - 0.01, centerZ);
  chassis.add(belly);

  // Cubierta superior.
  const deck = box(width + 0.04, 0.02, depth + 0.04, materials.body);
  deck.position.set(0, DECK_TOP - 0.01, centerZ);
  chassis.add(deck);

  // Equipos sobre la cubierta.
  const equipment = [
    { size: [0.5, 0.14, 0.38], position: [0.1, -0.35], material: materials.dark },
    { size: [0.34, 0.1, 0.3], position: [0.45, 0.55], material: materials.body },
    { size: [0.22, 0.08, 0.5], position: [-0.15, 0.55], material: materials.gold },
  ];
  for (const { size, position, material } of equipment) {
    const item = box(...size, material);
    item.position.set(position[0], DECK_TOP + size[1] / 2, position[1]);
    chassis.add(item);
  }

  const frontHazcams = createHazcamBar(materials, BODY.front + 0.04, 1);
  // Punto de referencia de las Hazcams delanteras (para su punto brillante), del lado opuesto al brazo.
  const hazcamAnchor = new THREE.Object3D();
  hazcamAnchor.name = 'hazcams_front';
  hazcamAnchor.position.set(0.24, 0, 0.09);
  frontHazcams.add(hazcamAnchor);
  chassis.add(frontHazcams);
  chassis.add(createHazcamBar(materials, BODY.back - 0.04, -1));
  chassis.add(createMMRTG(materials));
  chassis.add(createHighGainAntenna(materials));

  // Antena UHF (cilindro pequeño, trasera derecha).
  const uhf = cylinder(0.06, 0.07, 0.12, materials.body);
  uhf.position.set(-0.5, DECK_TOP + 0.06, -0.55);
  chassis.add(uhf);

  // Soportes del MMRTG.
  for (const x of [-0.12, 0.12]) {
    chassis.add(
      beam(new THREE.Vector3(x, 0.95, BODY.back), new THREE.Vector3(x, 1.05, BODY.back - 0.22), 0.015, materials.structure)
    );
  }

  // Ejes donde se apoyan los rockers, de cada lado del chasis.
  for (const side of [-1, 1]) {
    const axleLength = WHEEL_X - BODY.halfWidth;
    const axle = cylinderX(0.045, axleLength, materials.structure);
    axle.position.set(side * (BODY.halfWidth + axleLength / 2), ROCKER_PIVOT.y, ROCKER_PIVOT.z);
    chassis.add(axle);
  }

  // Poste de la barra diferencial.
  const post = cylinder(0.05, 0.06, DIFFERENTIAL.y - DECK_TOP, materials.dark);
  post.position.set(0, (DIFFERENTIAL.y + DECK_TOP) / 2, DIFFERENTIAL.z);
  chassis.add(post);

  return chassis;
}
