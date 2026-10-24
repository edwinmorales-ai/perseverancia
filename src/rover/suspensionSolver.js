import { WHEEL_RADIUS, WHEEL_X, WHEEL_Z, ROCKER_PIVOT, BOGIE_PIVOT } from './dimensions.js';

// Resuelve la suspensión rocker-bogie a partir de la altura a la que debe quedar el centro
// de cada rueda para tocar el suelo. Se trabaja en el plano lateral de cada lado (z adelante, y arriba).
//
// Todos los ángulos son de "cabeceo": positivos cuando la parte delantera sube.

// Pivote del bogie visto desde el centro de la rueda media (en reposo).
const BOGIE_FROM_MIDDLE = { z: BOGIE_PIVOT.z - WHEEL_Z.middle, y: BOGIE_PIVOT.y - WHEEL_RADIUS };
// Pivote del rocker visto desde el centro de la rueda trasera (en reposo).
const ROCKER_FROM_REAR = { z: ROCKER_PIVOT.z - WHEEL_Z.rear, y: ROCKER_PIVOT.y - WHEEL_RADIUS };
// Distancia fija entre los centros de las ruedas delantera y media (largo del bogie).
const BOGIE_SPAN = WHEEL_Z.front - WHEEL_Z.middle;
// Distancia fija y ángulo en reposo entre el centro de la rueda trasera y el pivote del bogie.
const REAR_TO_BOGIE = { z: BOGIE_PIVOT.z - WHEEL_Z.rear, y: BOGIE_PIVOT.y - WHEEL_RADIUS };
const REAR_TO_BOGIE_LENGTH = Math.hypot(REAR_TO_BOGIE.z, REAR_TO_BOGIE.y);
const REAR_TO_BOGIE_REST = Math.atan2(REAR_TO_BOGIE.y, REAR_TO_BOGIE.z);

function rotate({ z, y }, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { z: z * cos - y * sin, y: z * sin + y * cos };
}

// Ángulo de una pieza rígida de largo "length" cuyos extremos deben tener una diferencia de altura "rise".
function tiltFor(rise, length) {
  return Math.asin(Math.min(1, Math.max(-1, rise / length)));
}

// Un lado: { front, middle, rear } = altura del centro de cada rueda.
function solveSide({ front, middle, rear }) {
  // El bogie es rígido: se inclina hasta que sus dos ruedas quedan a la altura pedida.
  const bogie = tiltFor(front - middle, BOGIE_SPAN);
  const bogiePivotHeight = middle + rotate(BOGIE_FROM_MIDDLE, bogie).y;

  // El rocker es rígido entre la rueda trasera y el pivote del bogie.
  const rocker = tiltFor(bogiePivotHeight - rear, REAR_TO_BOGIE_LENGTH) - REAR_TO_BOGIE_REST;
  const pivotHeight = rear + rotate(ROCKER_FROM_REAR, rocker).y;

  return { bogie, rocker, pivotHeight };
}

// centers = { left: { front, middle, rear }, right: { ... } }
// Devuelve la pose del chasis y el ángulo de cada rocker y bogie relativo a su pieza padre.
export function solveSuspension(centers) {
  const left = solveSide(centers.left);
  const right = solveSide(centers.right);

  // La barra diferencial deja el chasis en el promedio de los dos rockers.
  const pitch = (left.rocker + right.rocker) / 2;
  const roll = Math.atan2(left.pivotHeight - right.pivotHeight, 2 * WHEEL_X);

  return {
    pitch,
    roll,
    pivotHeight: (left.pivotHeight + right.pivotHeight) / 2, // altura media de los pivotes de los rockers
    rocker: { left: left.rocker - pitch, right: right.rocker - pitch },
    bogie: { left: left.bogie - left.rocker, right: right.bogie - right.rocker },
  };
}
