import * as THREE from 'three';

// Reproduce una secuencia de pasos que llevan articulaciones de un ángulo a otro.
//
// state: objeto con los ángulos actuales (radianes), por ejemplo { elbow: 0, wrist: 0 }.
// apply(): copia "state" a las piezas 3D.
//
// Cada paso: {
//   to: { articulación: ángulo } o una función que lo devuelve (se calcula al empezar el paso),
//   duration: segundos,
//   onStart(), during(t, dt) con t de 0 a 1, onEnd()   (todos opcionales)
// }
export function createSequencePlayer(state, apply) {
  let queue = [];
  let current = null;

  function start(step) {
    step.onStart?.();
    const to = typeof step.to === 'function' ? step.to() : step.to ?? {};
    const from = {};
    for (const key of Object.keys(to)) from[key] = state[key];
    current = { step, from, to, elapsed: 0 };
  }

  function update(dt) {
    if (!current) {
      if (queue.length === 0) return;
      start(queue.shift());
    }

    const { step, from, to } = current;
    current.elapsed += dt;
    const t = step.duration > 0 ? Math.min(current.elapsed / step.duration, 1) : 1;
    const eased = THREE.MathUtils.smootherstep(t, 0, 1); // arranca y frena suave, como un motor real

    for (const key of Object.keys(to)) state[key] = from[key] + (to[key] - from[key]) * eased;
    apply();
    step.during?.(t, dt);

    if (t >= 1) {
      current = null;
      step.onEnd?.();
    }
  }

  return {
    play(steps) {
      queue = [...steps];
      current = null;
    },
    stop() {
      queue = [];
      current = null;
    },
    update,
    get busy() {
      return current !== null || queue.length > 0;
    },
  };
}
