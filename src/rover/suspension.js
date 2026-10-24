import * as THREE from 'three';
import {
  WHEEL_RADIUS,
  WHEEL_X,
  WHEEL_Z,
  ROCKER_PIVOT,
  BOGIE_PIVOT,
  STEER_TOP_Y,
  MIDDLE_MOUNT_Y,
  DIFFERENTIAL,
} from './dimensions.js';
import { beam, cylinder, cylinderX } from './parts.js';
import { createWheel, createWheelBracket } from './wheel.js';

const TUBE_RADIUS = 0.032;

// Rueda de esquina (delantera o trasera): tiene actuador de dirección y gira sobre Y.
function createSteerableWheel(materials, side) {
  const steer = new THREE.Group();
  const wheel = createWheel(materials, side);
  steer.add(wheel.root);

  const topHeight = STEER_TOP_Y - WHEEL_RADIUS;
  steer.add(createWheelBracket(materials, side, topHeight));

  // Actuador de dirección sobre el eje vertical de la rueda.
  const actuator = cylinder(0.06, 0.06, 0.1, materials.dark);
  actuator.position.y = topHeight;
  steer.add(actuator);

  return { steer, wheel };
}

// Rueda media: fija, sin dirección.
function createFixedWheel(materials, side) {
  const mount = new THREE.Group();
  const wheel = createWheel(materials, side);
  mount.add(wheel.root);
  mount.add(createWheelBracket(materials, side, MIDDLE_MOUNT_Y - WHEEL_RADIUS));
  return { mount, wheel };
}

// Un lado de la suspensión rocker-bogie. side = +1 (izquierda, +X) o -1 (derecha).
//
// Jerarquía (cada grupo gira sobre su pivote):
//   rocker (gira en X sobre el chasis)
//   ├── rueda trasera (steer gira en Y → spin gira en X)
//   └── bogie (gira en X en la punta delantera del rocker)
//       ├── rueda delantera (steer → spin)
//       └── rueda media (spin)
export function createSuspensionSide(materials, side) {
  const x = side * WHEEL_X;
  // Puntos en coordenadas del rover.
  const rockerPivot = new THREE.Vector3(x, ROCKER_PIVOT.y, ROCKER_PIVOT.z);
  const bogiePivot = new THREE.Vector3(x, BOGIE_PIVOT.y, BOGIE_PIVOT.z);
  const rearTop = new THREE.Vector3(x, STEER_TOP_Y, WHEEL_Z.rear);
  const frontTop = new THREE.Vector3(x, STEER_TOP_Y, WHEEL_Z.front);
  const middleTop = new THREE.Vector3(x, MIDDLE_MOUNT_Y, WHEEL_Z.middle);
  // Punta de la palanca que conecta el rocker con la barra diferencial.
  const leverTop = new THREE.Vector3(x, DIFFERENTIAL.y, ROCKER_PIVOT.z);

  // --- Rocker ---
  const rocker = new THREE.Group();
  rocker.name = side > 0 ? 'rocker-izquierdo' : 'rocker-derecho';
  rocker.position.copy(rockerPivot);
  const toRocker = (point) => point.clone().sub(rockerPivot);

  rocker.add(cylinderX(0.07, 0.14, materials.dark)); // pivote
  rocker.add(beam(toRocker(rockerPivot), toRocker(bogiePivot), TUBE_RADIUS, materials.structure));
  rocker.add(beam(toRocker(rockerPivot), toRocker(rearTop), TUBE_RADIUS, materials.structure));
  rocker.add(beam(toRocker(rockerPivot), toRocker(leverTop), TUBE_RADIUS * 0.8, materials.structure));

  const rear = createSteerableWheel(materials, side);
  rear.steer.position.copy(toRocker(new THREE.Vector3(x, WHEEL_RADIUS, WHEEL_Z.rear)));
  rocker.add(rear.steer);

  // --- Bogie ---
  const bogie = new THREE.Group();
  bogie.name = side > 0 ? 'bogie-izquierdo' : 'bogie-derecho';
  bogie.position.copy(toRocker(bogiePivot));
  rocker.add(bogie);
  const toBogie = (point) => point.clone().sub(bogiePivot);

  bogie.add(cylinderX(0.06, 0.12, materials.dark)); // pivote
  bogie.add(beam(toBogie(bogiePivot), toBogie(frontTop), TUBE_RADIUS, materials.structure));
  bogie.add(beam(toBogie(bogiePivot), toBogie(middleTop), TUBE_RADIUS, materials.structure));

  const front = createSteerableWheel(materials, side);
  front.steer.position.copy(toBogie(new THREE.Vector3(x, WHEEL_RADIUS, WHEEL_Z.front)));
  bogie.add(front.steer);

  const middle = createFixedWheel(materials, side);
  middle.mount.position.copy(toBogie(new THREE.Vector3(x, WHEEL_RADIUS, WHEEL_Z.middle)));
  bogie.add(middle.mount);

  return {
    rocker,
    bogie,
    leverTop, // posición inicial (coordenadas del rover) para la varilla del diferencial
    steering: { front: front.steer, rear: rear.steer },
    wheels: { front: front.wheel, middle: middle.wheel, rear: rear.wheel },
  };
}
