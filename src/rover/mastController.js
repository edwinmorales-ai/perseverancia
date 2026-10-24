import * as THREE from 'three';
import { createSequencePlayer } from './sequence.js';

const deg = THREE.MathUtils.degToRad;

// Rango de las articulaciones del mástil (radianes). azimuth positivo = mira a la izquierda,
// elevation positivo = mira hacia arriba.
export const MAST_LIMITS = {
  azimuth: [deg(-180), deg(180)],
  elevation: [deg(-80), deg(60)],
};

// Controla la cabeza del mástil: ángulos manuales y movimientos animados (mirar a un punto, al frente).
export function createMastController(rover) {
  const mast = rover.parts.mast;
  const state = { azimuth: 0, elevation: 0 };
  // Rotación positiva en X baja la vista, por eso el signo menos en la elevación.
  const apply = () => {
    mast.azimuth.rotation.y = state.azimuth;
    mast.elevation.rotation.x = -state.elevation;
  };
  const player = createSequencePlayer(state, apply);
  const pivot = new THREE.Vector3();

  // Ángulos para que la cabeza apunte a un punto del mundo.
  function anglesToward(point) {
    rover.root.updateMatrixWorld(true);
    const local = mast.root.worldToLocal(point.clone());
    pivot.set(0, mast.azimuth.position.y + mast.elevation.position.y, 0); // articulación de elevación
    const dx = local.x - pivot.x;
    const dy = local.y - pivot.y;
    const dz = local.z - pivot.z;
    return {
      azimuth: THREE.MathUtils.clamp(Math.atan2(dx, dz), ...MAST_LIMITS.azimuth),
      elevation: THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), ...MAST_LIMITS.elevation),
    };
  }

  return {
    state,
    setAngle(joint, angle) {
      player.stop();
      state[joint] = THREE.MathUtils.clamp(angle, ...MAST_LIMITS[joint]);
      apply();
    },
    lookAt(point, duration = 1.5) {
      player.play([{ to: () => anglesToward(point), duration }]);
    },
    lookForward(duration = 1.5) {
      player.play([{ to: { azimuth: 0, elevation: 0 }, duration }]);
    },
    update(dt) {
      player.update(dt);
    },
  };
}
