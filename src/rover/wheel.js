import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHEEL_RADIUS, WHEEL_WIDTH } from './dimensions.js';
import { cylinderX, box } from './parts.js';

const GROUSER_COUNT = 48; // tacos de tracción en la banda
const SPOKE_COUNT = 6; // rayos curvos de titanio

// Rueda modelo con la cara exterior hacia +X. Se crea una vez y se clona para las 6 ruedas.
let template = null;

function createTemplate(materials) {
  const wheel = new THREE.Group();
  const half = WHEEL_WIDTH / 2;

  // Banda de rodadura: cilindro abierto de aluminio.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_RADIUS - 0.012, WHEEL_RADIUS - 0.012, WHEEL_WIDTH, 48, 1, true),
    materials.aluminum
  );
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);

  // Tacos (grousers): láminas en forma de V suave, unidas en una sola geometría.
  const grousers = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < GROUSER_COUNT; i++) {
    const angle = (i / GROUSER_COUNT) * Math.PI * 2;
    for (const sideSign of [-1, 1]) {
      const piece = new THREE.BoxGeometry(half, 0.014, 0.008);
      // Cada mitad se inclina un poco para formar la V.
      piece.applyMatrix4(matrix.makeRotationY(sideSign * 0.12));
      piece.applyMatrix4(matrix.makeTranslation(sideSign * half / 2, WHEEL_RADIUS - 0.005, 0));
      piece.applyMatrix4(matrix.makeRotationX(angle));
      grousers.push(piece);
    }
  }
  const grouserMesh = new THREE.Mesh(mergeGeometries(grousers), materials.aluminum);
  wheel.add(grouserMesh);

  // Bordes de la llanta.
  for (const sideSign of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.02, 0.01, 8, 48), materials.aluminum);
    lip.rotation.y = Math.PI / 2;
    lip.position.x = sideSign * (half - 0.005);
    wheel.add(lip);
  }

  // Rayos curvos en la cara exterior, del cubo a la llanta.
  const spokes = [];
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const angle = (i / SPOKE_COUNT) * Math.PI * 2;
    const point = (radius, offset) =>
      new THREE.Vector3(half - 0.03, Math.cos(angle + offset) * radius, Math.sin(angle + offset) * radius);
    const curve = new THREE.QuadraticBezierCurve3(point(0.06, 0), point(0.15, 0.35), point(WHEEL_RADIUS - 0.03, 0.2));
    spokes.push(new THREE.TubeGeometry(curve, 10, 0.011, 6));
  }
  wheel.add(new THREE.Mesh(mergeGeometries(spokes), materials.structure));

  // Cubo central y tapa exterior.
  const hub = cylinderX(0.065, 0.06, materials.structure);
  hub.position.x = half - 0.03;
  wheel.add(hub);
  const cap = cylinderX(0.035, 0.03, materials.dark);
  cap.position.x = half;
  wheel.add(cap);

  wheel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return wheel;
}

// Crea una rueda. side = +1 (lado izquierdo, +X) o -1 (lado derecho).
// Devuelve:
// - root: centro de la rueda (se ubica en la suspensión).
// - spin: grupo que gira sobre X al rodar (mismo sentido en ambos lados gracias al espejo).
export function createWheel(materials, side) {
  if (!template) template = createTemplate(materials);

  const root = new THREE.Group();
  const spin = new THREE.Group();
  const mirror = template.clone();
  mirror.scale.x = side; // espejo para que la cara exterior quede hacia afuera
  spin.add(mirror);
  root.add(spin);

  // Motor de tracción en la cara interior (no gira con la rueda).
  const motor = cylinderX(0.085, 0.12, materials.dark);
  motor.position.x = -side * (WHEEL_WIDTH / 2 + 0.04);
  root.add(motor);

  return { root, spin };
}

// Soporte que baja desde la viga de suspensión hasta el motor de la rueda, por el lado interior.
export function createWheelBracket(materials, side, topHeight) {
  const bracket = new THREE.Group();
  const innerX = -side * (WHEEL_WIDTH / 2 + 0.11); // justo por dentro del motor
  const plate = box(0.03, topHeight, 0.09, materials.structure);
  plate.position.set(innerX, topHeight / 2, 0);
  bracket.add(plate);
  const arm = box(Math.abs(innerX), 0.05, 0.09, materials.structure);
  arm.position.set(innerX / 2, topHeight, 0);
  bracket.add(arm);
  return bracket;
}
