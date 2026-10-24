import * as THREE from 'three';
import { WHEEL_RADIUS, WHEEL_X, WHEEL_Z, ROCKER_PIVOT, DIFFERENTIAL } from './dimensions.js';
import { solveSuspension } from './suspensionSolver.js';
import { placeBeam } from './parts.js';

const deg = THREE.MathUtils.degToRad;

// Velocidades de la simulación. El rover real anda a ~4.2 cm/s; aquí se acelera para que sea manejable.
const CRUISE_SPEED = 0.6; // m/s
const BOOST_SPEED = 1.5; // m/s con Shift
const ACCELERATION = 0.8; // m/s²
const BRAKING = 1.6; // m/s²
const MIN_TURN_RADIUS = 2.2; // m, radio del giro en arco más cerrado
const TURN_IN_PLACE_RATE = deg(25); // rad/s
const ANGULAR_ACCELERATION = deg(45); // rad/s²
const STEER_RATE = deg(70); // rad/s, velocidad de los actuadores de dirección
// Al pasar de manejar en arco a girar en el lugar (o al revés), el rover frena hasta que las ruedas
// estén alineadas: va más lento si alguna está a más de esto de su ángulo objetivo.
const STEER_TOLERANCE = deg(20);
const ALIGNED = deg(2);
// Suavizado (s) de la altura de cada rueda. Sube casi al instante (para no atravesar el borde de una
// roca) y baja más despacio (para no "caer" de golpe al bajar de ella).
const WHEEL_RISE_TIME = 0.015;
const WHEEL_DROP_TIME = 0.06;
// Distancia máxima al origen: más allá empiezan las colinas del horizonte.
const MAX_DISTANCE = 80;

// Las ruedas medias no tienen dirección, así que el centro de giro cae en la línea de sus ejes.
const PIVOT_Z = WHEEL_Z.middle;
const LEVER_LENGTH = DIFFERENTIAL.y - ROCKER_PIVOT.y;

// Puntos de cada rueda donde se mide el suelo: a lo largo (adelante/atrás, casi todo el radio) y a lo ancho.
// lift = altura del centro sobre ese punto si la rueda se apoya justo ahí.
const CONTACT_SAMPLES = [];
for (const along of [-0.25, -0.18, -0.1, 0, 0.1, 0.18, 0.25]) {
  for (const across of [-0.12, 0, 0.12]) {
    CONTACT_SAMPLES.push({ along, across, lift: Math.sqrt(WHEEL_RADIUS ** 2 - along ** 2) });
  }
}

// Puntos (coordenadas del rover) que no pueden entrar en una roca alta: ruedas (centro y bordes) y chasis.
const COLLISION_POINTS = [];
for (const side of [-1, 1]) {
  for (const z of Object.values(WHEEL_Z)) {
    for (const edge of [-WHEEL_RADIUS, 0, WHEEL_RADIUS]) COLLISION_POINTS.push({ x: side * WHEEL_X, z: z + edge });
  }
  for (const z of [-0.75, 0, 1.0]) COLLISION_POINTS.push({ x: side * 0.7, z });
}

function approach(current, target, maxStep) {
  return current + THREE.MathUtils.clamp(target - current, -maxStep, maxStep);
}

// Controla el manejo del rover: dirección, avance, giro de ruedas, suspensión y barra diferencial.
// ground.heightAt(x, z): altura del terreno; ground.rockHeightAt / ground.isObstacle: rocas.
export function createDriveController(rover, ground) {
  const { root, parts } = rover;
  const pose = { x: root.position.x, z: root.position.z, yaw: 0 };
  let speed = 0; // m/s, medida en el centro de giro
  let yawRate = 0; // rad/s
  let blocked = false;
  let wasPointTurn = false;
  let aligning = false; // cambiando de modo: esperar a que las ruedas lleguen a su ángulo
  let odometer = 0; // m recorridos

  root.rotation.order = 'YXZ'; // rumbo, luego cabeceo, luego alabeo

  // Lista plana de ruedas con su posición en el rover.
  const wheels = [];
  for (const [sideName, side] of [['left', 1], ['right', -1]]) {
    const suspension = parts.suspension[sideName];
    for (const name of ['front', 'middle', 'rear']) {
      wheels.push({
        sideName,
        name,
        x: side * WHEEL_X,
        z: WHEEL_Z[name],
        root: suspension.wheels[name].root, // centro de la rueda
        spin: suspension.wheels[name].spin,
        steer: suspension.steering[name] ?? null, // las ruedas medias no tienen dirección
        angle: 0,
        rolling: 0, // m/s de avance de la rueda sobre el suelo (negativo = hacia atrás)
        height: 0, // altura suavizada del centro de la rueda
        // Corrimiento horizontal real de la rueda respecto de su posición en reposo
        // (al inclinarse el bogie o el rocker, la rueda se mueve adelante o atrás).
        shift: { x: 0, z: 0 },
      });
    }
  }

  const surfaceHeight = (x, z) => Math.max(ground.heightAt(x, z), ground.rockHeightAt(x, z));

  // Pasa un punto del rover (x, z) a coordenadas del mundo con una pose dada.
  function toWorld(x, z, { x: px, z: pz, yaw }) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return { x: px + x * cos + z * sin, z: pz - x * sin + z * cos };
  }

  // Ángulo de dirección para que la rueda quede tangente a un giro con centro en (centerX, PIVOT_Z).
  function steerAngleFor(wheel, centerX) {
    return Math.atan((wheel.z - PIVOT_Z) / (centerX - wheel.x));
  }

  function isPoseBlocked(candidate) {
    if (Math.hypot(candidate.x, candidate.z) > MAX_DISTANCE) return true;
    return COLLISION_POINTS.some(({ x, z }) => {
      const p = toWorld(x, z, candidate);
      return ground.isObstacle(p.x, p.z);
    });
  }

  // --- Suspensión ---
  let suspensionReady = false;
  const pivotLocal = new THREE.Vector3();
  const wheelWorld = new THREE.Vector3();

  function updateSuspension(dt) {
    // Altura a la que debe quedar el centro de cada rueda para apoyarse en el suelo (o en una roca).
    const riseK = 1 - Math.exp(-dt / WHEEL_RISE_TIME);
    const dropK = 1 - Math.exp(-dt / WHEEL_DROP_TIME);

    // Dos pasadas: la primera ubica las ruedas donde realmente quedan con la nueva inclinación,
    // la segunda mide el suelo en esa posición y deja la pose final.
    for (let pass = 0; pass < 2; pass++) {
      const final = pass === 1;
      const centers = { left: {}, right: {} };
      for (const wheel of wheels) {
        let height = contactHeight(wheel);
        if (suspensionReady) height = wheel.height + (height - wheel.height) * (height > wheel.height ? riseK : dropK);
        if (final) wheel.height = height;
        centers[wheel.sideName][wheel.name] = height;
      }
      applySuspension(solveSuspension(centers));
    }
    suspensionReady = true;
  }

  // Altura que necesita el centro de la rueda para apoyarse en el punto más alto bajo ella.
  function contactHeight(wheel) {
    const rest = toWorld(wheel.x, wheel.z, pose);
    const center = { x: rest.x + wheel.shift.x, z: rest.z + wheel.shift.z };
    const heading = pose.yaw + wheel.angle;
    const forward = { x: Math.sin(heading), z: Math.cos(heading) };
    let height = -Infinity;
    for (const { along, across, lift } of CONTACT_SAMPLES) {
      const x = center.x + forward.x * along + forward.z * across;
      const z = center.z + forward.z * along - forward.x * across;
      height = Math.max(height, surfaceHeight(x, z) + lift);
    }
    return height;
  }

  function applySuspension(solved) {

    // Chasis: rumbo, cabeceo y alabeo; altura para que los pivotes de los rockers queden donde corresponde.
    root.rotation.set(-solved.pitch, pose.yaw, solved.roll);
    pivotLocal.set(0, ROCKER_PIVOT.y, ROCKER_PIVOT.z).applyEuler(root.rotation);
    root.position.set(pose.x, solved.pivotHeight - pivotLocal.y, pose.z);

    // Rotación positiva en X baja la parte delantera, por eso el signo menos.
    for (const side of ['left', 'right']) {
      parts.suspension[side].rocker.rotation.x = -solved.rocker[side];
      parts.suspension[side].bogie.rotation.x = -solved.bogie[side];
    }

    // Guardar dónde quedó realmente cada rueda para medir el suelo ahí en la próxima pasada.
    root.updateMatrixWorld(true);
    for (const wheel of wheels) {
      const rest = toWorld(wheel.x, wheel.z, pose);
      wheel.spin.parent.getWorldPosition(wheelWorld);
      wheel.shift.x = wheelWorld.x - rest.x;
      wheel.shift.z = wheelWorld.z - rest.z;
    }
  }

  // Barra diferencial: las palancas de los rockers empujan sus puntas por medio de las varillas.
  const leverTop = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  const barEnd = { left: new THREE.Vector3(), right: new THREE.Vector3() };

  function updateDifferential() {
    const { bar, links } = parts.differential;
    const shift = {};
    for (const [side, sign] of [['left', 1], ['right', -1]]) {
      const angle = parts.suspension[side].rocker.rotation.x;
      leverTop[side].set(
        sign * WHEEL_X,
        ROCKER_PIVOT.y + LEVER_LENGTH * Math.cos(angle),
        ROCKER_PIVOT.z + LEVER_LENGTH * Math.sin(angle)
      );
      shift[side] = LEVER_LENGTH * Math.sin(angle);
    }

    const half = DIFFERENTIAL.halfLength;
    const yaw = Math.asin(THREE.MathUtils.clamp((shift.right - shift.left) / (2 * half), -1, 1));
    bar.rotation.y = yaw;
    barEnd.left.set(half * Math.cos(yaw), DIFFERENTIAL.y, DIFFERENTIAL.z - half * Math.sin(yaw));
    barEnd.right.set(-half * Math.cos(yaw), DIFFERENTIAL.y, DIFFERENTIAL.z + half * Math.sin(yaw));

    placeBeam(links.children[0], barEnd.left, leverTop.left);
    placeBeam(links.children[1], barEnd.right, leverTop.right);
  }

  // --- Manejo ---
  function update(dt, input) {
    const pointTurn = input.turnInPlace !== 0 && input.throttle === 0;
    const curvature = pointTurn ? 0 : input.steer / MIN_TURN_RADIUS;

    // 1. Ángulo objetivo de cada rueda de esquina y movimiento de los actuadores.
    let steerError = 0;
    for (const wheel of wheels) {
      if (!wheel.steer) continue;
      let target = 0;
      if (pointTurn) target = steerAngleFor(wheel, 0);
      else if (curvature !== 0) target = steerAngleFor(wheel, 1 / curvature);
      wheel.angle = approach(wheel.angle, target, STEER_RATE * dt);
      wheel.steer.rotation.y = wheel.angle;
      steerError = Math.max(steerError, Math.abs(target - wheel.angle));
    }
    // Al cambiar entre arco y giro en el lugar, el rover va más lento hasta que las ruedas se alinean.
    if (pointTurn !== wasPointTurn) aligning = true;
    wasPointTurn = pointTurn;
    if (steerError < ALIGNED) aligning = false;
    const readiness = aligning ? THREE.MathUtils.clamp(1 - steerError / STEER_TOLERANCE, 0, 1) : 1;

    // 2. Velocidad de avance y de giro.
    const targetSpeed = pointTurn ? 0 : input.throttle * (input.boost ? BOOST_SPEED : CRUISE_SPEED) * readiness;
    const speedingUp = Math.abs(targetSpeed) > Math.abs(speed) && Math.sign(targetSpeed) !== -Math.sign(speed);
    speed = approach(speed, targetSpeed, (speedingUp ? ACCELERATION : BRAKING) * dt);

    const targetYawRate = pointTurn ? input.turnInPlace * TURN_IN_PLACE_RATE * readiness : speed * curvature;
    yawRate = approach(yawRate, targetYawRate, ANGULAR_ACCELERATION * dt);

    // 3. Mover el rover. Velocidad del origen en coordenadas del rover: el giro es alrededor de (0, PIVOT_Z).
    const localX = -yawRate * PIVOT_Z;
    const localZ = speed;
    const candidate = { yaw: pose.yaw + yawRate * dt };
    const moved = toWorld(localX * dt, localZ * dt, { x: pose.x, z: pose.z, yaw: pose.yaw });
    candidate.x = moved.x;
    candidate.z = moved.z;

    blocked = isPoseBlocked(candidate);
    if (blocked) {
      speed = 0;
      yawRate = 0;
    } else {
      odometer += Math.hypot(candidate.x - pose.x, candidate.z - pose.z);
      Object.assign(pose, candidate);
    }

    // 4. Girar cada rueda según la velocidad de su punto de apoyo en la dirección en que apunta.
    const rate = blocked ? 0 : yawRate;
    for (const wheel of wheels) {
      const vx = (blocked ? 0 : localX) + rate * wheel.z;
      const vz = (blocked ? 0 : localZ) - rate * wheel.x;
      const rolling = vx * Math.sin(wheel.angle) + vz * Math.cos(wheel.angle);
      wheel.spin.rotation.x += (rolling / WHEEL_RADIUS) * dt;
      wheel.rolling = rolling;
    }

    // 5. Apoyar sobre el relieve y mover la barra diferencial.
    updateSuspension(dt);
    updateDifferential();
  }

  return {
    update,
    pose,
    wheels, // cada rueda: { root, rolling, ... } (para huellas y polvo)
    get speed() {
      return speed;
    },
    get blocked() {
      return blocked;
    },
    get odometer() {
      return odometer;
    },
  };
}
