import * as THREE from 'three';
import GUI from 'lil-gui';
import { ARM_JOINTS, ARM_LIMITS } from '../rover/armController.js';
import { MAST_LIMITS } from '../rover/mastController.js';
import { CAMERA_MODES, CAMERA_LABELS } from '../camera/cameraRig.js';

const toDegrees = THREE.MathUtils.radToDeg;
const toRadians = THREE.MathUtils.degToRad;

// Nombre de cada articulación en el panel. sign = -1 invierte el sentido para mostrar "+ arriba".
const ARM_LABELS = {
  shoulderAzimuth: { label: 'Hombro · giro', sign: 1 },
  shoulderElevation: { label: 'Hombro · elevación (+ arriba)', sign: -1 },
  elbow: { label: 'Codo', sign: 1 },
  wrist: { label: 'Muñeca', sign: 1 },
  turret: { label: 'Torreta', sign: 1 },
};

const MAST_LABELS = {
  azimuth: 'Giro (+ izquierda)',
  elevation: 'Elevación (+ arriba)',
};

// Agrega a "target" una propiedad en grados que lee y escribe un ángulo guardado en radianes.
// Así lil-gui muestra grados y el panel se actualiza solo durante las animaciones (listen).
function degreesProperty(target, name, read, write) {
  Object.defineProperty(target, name, {
    get: () => Math.round(toDegrees(read()) * 10) / 10,
    set: (value) => write(toRadians(value)),
    enumerable: true,
  });
}

function degreesRange([min, max], sign = 1) {
  const a = toDegrees(min) * sign;
  const b = toDegrees(max) * sign;
  return [Math.min(a, b), Math.max(a, b)];
}

// Panel de instrumentos: cámara, articulaciones del brazo y del mástil, y acciones (tomar muestra, plegar…).
export function createControlPanel({ arm, mast, cameraRig, ingenuity }) {
  const gui = new GUI({ title: 'Instrumentos' });

  // --- Cámara ---
  const cameraFolder = gui.addFolder('Cámara (tecla C o 1/2/3)');
  const cameraOptions = Object.fromEntries(CAMERA_MODES.map((mode) => [CAMERA_LABELS[mode], mode]));
  cameraFolder.add(cameraRig, 'mode', cameraOptions).name('Vista').listen();

  // --- Brazo ---
  const armFolder = gui.addFolder('Brazo robótico');
  const armValues = {};
  for (const joint of ARM_JOINTS) {
    const { label, sign } = ARM_LABELS[joint];
    degreesProperty(armValues, label, () => arm.pose[joint] * sign, (angle) => arm.setJoint(joint, angle * sign));
    armFolder.add(armValues, label, ...degreesRange(ARM_LIMITS[joint], sign), 1).listen();
  }

  const armActions = {
    'Tomar muestra': () => arm.takeSample(),
    Desplegar: () => arm.deploy(),
    'Plegar (transporte)': () => arm.stow(),
  };
  const sampleButton = armFolder.add(armActions, 'Tomar muestra');
  const deployButton = armFolder.add(armActions, 'Desplegar');
  armFolder.add(armActions, 'Plegar (transporte)');

  const counters = {
    get 'Muestras tomadas'() {
      return arm.samples;
    },
  };
  armFolder.add(counters, 'Muestras tomadas').disable().listen();

  // --- Mástil ---
  const mastFolder = gui.addFolder('Mástil (cámaras)');
  const mastValues = {};
  for (const joint of ['azimuth', 'elevation']) {
    degreesProperty(mastValues, MAST_LABELS[joint], () => mast.state[joint], (angle) => mast.setAngle(joint, angle));
    mastFolder.add(mastValues, MAST_LABELS[joint], ...degreesRange(MAST_LIMITS[joint]), 1).listen();
  }
  mastFolder.add({ 'Mirar al frente': () => mast.lookForward() }, 'Mirar al frente');

  // --- Ingenuity ---
  const ingenuityFolder = gui.addFolder('Ingenuity');
  const flyButton = ingenuityFolder.add({ 'Volar (ida y vuelta)': () => ingenuity.fly() }, 'Volar (ida y vuelta)');
  const ingenuityInfo = {
    get Estado() {
      return ingenuity.status;
    },
  };
  ingenuityFolder.add(ingenuityInfo, 'Estado').disable().listen();

  // Mientras una secuencia está en curso, no se puede empezar otra igual (el brazo sí se puede plegar).
  let wasBusy = null;
  let wasFlying = null;
  function update() {
    if (arm.busy !== wasBusy) {
      wasBusy = arm.busy;
      sampleButton.disable(wasBusy);
      deployButton.disable(wasBusy);
    }
    if (ingenuity.busy !== wasFlying) {
      wasFlying = ingenuity.busy;
      flyButton.disable(wasFlying);
    }
  }

  // Cerrado al inicio para dejar ver el paisaje (con un clic en «Instrumentos» se abre).
  gui.close();

  return { gui, update };
}
