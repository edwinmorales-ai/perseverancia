import * as THREE from 'three';
import { ARM_GEOMETRY, ARM_STOWED_POSE } from './arm.js';
import { createSequencePlayer } from './sequence.js';

const deg = THREE.MathUtils.degToRad;

export const ARM_JOINTS = ['shoulderAzimuth', 'shoulderElevation', 'elbow', 'wrist', 'turret'];

// Rango de cada articulación (radianes). shoulderElevation positivo = el brazo baja.
export const ARM_LIMITS = {
  shoulderAzimuth: [deg(-110), deg(110)],
  shoulderElevation: [deg(-60), deg(90)],
  elbow: [deg(-10), deg(190)],
  wrist: [deg(-200), deg(110)],
  turret: [deg(-190), deg(190)],
};

// Pose intermedia para desplegar y plegar sin chocar con el chasis: brazo levantado y codo a medio abrir.
const UNFOLD_POSE = {
  shoulderAzimuth: deg(55),
  shoulderElevation: deg(-30),
  elbow: deg(120),
  wrist: deg(-60),
  turret: deg(-90),
};

// Dónde se toma la muestra, en coordenadas del rover: delante del chasis, a la izquierda del centro.
// Del lado opuesto al mástil, para que Mastcam-Z vea la broca sin que el antebrazo la tape.
const SAMPLE_SITE = new THREE.Vector3(0.35, 0, 2.2);
const HOVER_HEIGHT = 0.25; // m sobre el suelo antes de bajar
const DEPLOY_HEIGHT = 0.45; // m sobre el suelo en la pose "desplegado"
const DRILL_DEPTH = 0.05; // m que baja la broca al perforar
const DRILL_SPIN = 25; // rad/s de la broca
const DRILL_DUST_RATE = 30; // partículas de polvo por segundo al perforar con toda la fuerza
const STOWED_TOLERANCE = deg(2);

// Cinemática inversa: ángulos para que la punta de la broca quede en "target" (coordenadas del soporte
// del brazo) apuntando hacia abajo. Con la torreta girada 180°, la broca apunta hacia -Y de la muñeca.
//
// El hombro gira hacia el objetivo y el resto trabaja en un plano vertical (z adelante, y arriba):
// - La muñeca debe quedar drillTip por encima de la punta y (turretOffset + toolPlane) por detrás.
// - Hombro → codo (con su desplazamiento) y codo → muñeca forman un brazo de 2 tramos (ley del coseno).
// - La muñeca compensa para que la torreta quede horizontal y la broca vertical.
function solveDrillPose(target) {
  const { upperArm, forearm, elbowOffset, turretOffset, toolPlane, drillTip } = ARM_GEOMETRY;
  const azimuth = Math.atan2(target.x, target.z);
  const reach = Math.hypot(target.x, target.z);

  const wristZ = reach - (turretOffset + toolPlane);
  const wristY = target.y + drillTip;

  const l1 = Math.hypot(upperArm, elbowOffset);
  const l1Angle = Math.atan2(elbowOffset, upperArm);
  const l2 = forearm;
  const distance = THREE.MathUtils.clamp(Math.hypot(wristZ, wristY), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const cosBend = THREE.MathUtils.clamp((distance ** 2 - l1 ** 2 - l2 ** 2) / (2 * l1 * l2), -1, 1);
  const bend = -Math.acos(cosBend); // negativo: codo por arriba

  // Ángulos medidos desde la horizontal hacia arriba.
  const upperAngle = Math.atan2(wristY, wristZ) - Math.atan2(l2 * Math.sin(bend), l1 + l2 * Math.cos(bend));
  const forearmAngle = upperAngle + bend;

  const shoulderElevation = l1Angle - upperAngle;
  const elbow = -forearmAngle - shoulderElevation;
  return { shoulderAzimuth: azimuth, shoulderElevation, elbow, wrist: forearmAngle, turret: -Math.PI };
}

// Controla el brazo: ángulos manuales, desplegar, plegar y la secuencia de tomar muestra.
// world.surfaceHeight(x, z): altura del suelo o de la roca; world.marks: grupo donde dejar las marcas;
// world.dust (opcional): sistema de polvo para la perforación.
export function createArmController(rover, world, mast) {
  const arm = rover.parts.arm;
  const pose = { ...ARM_STOWED_POSE };
  const apply = () => arm.setPose(pose);
  const player = createSequencePlayer(pose, apply);
  const { bit, core } = arm.drill;

  let status = '';
  let samples = 0;
  let site = null; // punto del suelo (mundo) donde se perfora
  let dustBudget = 0; // fracción de partícula de polvo acumulada entre cuadros

  const isStowed = () => ARM_JOINTS.every((joint) => Math.abs(pose[joint] - ARM_STOWED_POSE[joint]) < STOWED_TOLERANCE);

  // Punto del suelo frente al rover donde se toma la muestra.
  function findSite() {
    const point = rover.root.localToWorld(SAMPLE_SITE.clone());
    point.y = world.surfaceHeight(point.x, point.z);
    return point;
  }

  // Pose con la punta de la broca "height" metros sobre el punto del suelo.
  function poseAbove(point, height) {
    rover.root.updateMatrixWorld(true);
    const target = arm.root.worldToLocal(point.clone().setY(point.y + height));
    return solveDrillPose(target);
  }

  // Marca circular que deja la abrasión y el agujero de la perforación, apoyada según la pendiente.
  function leaveDrillMark(point) {
    const e = 0.05;
    const normal = new THREE.Vector3(
      world.surfaceHeight(point.x - e, point.z) - world.surfaceHeight(point.x + e, point.z),
      2 * e,
      world.surfaceHeight(point.x, point.z - e) - world.surfaceHeight(point.x, point.z + e)
    ).normalize();

    const mark = new THREE.Group();
    const decal = (radius, color) =>
      new THREE.Mesh(
        new THREE.CircleGeometry(radius, 24),
        new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
      );
    mark.add(decal(0.045, 0x8f7d6c)); // roca limpia, más gris que el polvo
    const hole = decal(0.014, 0x1a0f0a);
    hole.position.z = 0.001;
    mark.add(hole);

    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mark.position.copy(point).addScaledVector(normal, 0.006);
    world.marks.add(mark);
  }

  const say = (text) => () => {
    status = text;
  };

  function unfoldSteps() {
    return isStowed() ? [{ to: UNFOLD_POSE, duration: 1.6, onStart: say('Desplegando brazo…') }] : [];
  }

  function stowSteps() {
    return [
      { to: UNFOLD_POSE, duration: 2.0, onStart: say('Plegando brazo…') },
      { to: ARM_STOWED_POSE, duration: 1.8, onEnd: say('') },
    ];
  }

  return {
    pose,
    get busy() {
      return player.busy;
    },
    get stowed() {
      return isStowed();
    },
    get status() {
      return status;
    },
    get samples() {
      return samples;
    },

    // Mueve una articulación a mano (desde el panel). Cancela cualquier animación.
    setJoint(joint, angle) {
      player.stop();
      status = '';
      const [min, max] = ARM_LIMITS[joint];
      pose[joint] = THREE.MathUtils.clamp(angle, min, max);
      apply();
    },

    deploy() {
      if (player.busy) return;
      player.play([
        ...unfoldSteps(),
        {
          to: () => poseAbove(findSite(), DEPLOY_HEIGHT),
          duration: 2.0,
          onStart: say('Desplegando brazo…'),
          onEnd: say(''),
        },
      ]);
    },

    stow() {
      player.stop();
      core.visible = false;
      player.play(stowSteps());
    },

    // Secuencia completa: desplegar, acercarse, perforar, levantar la muestra y volver a plegar.
    takeSample() {
      if (player.busy) return;
      player.play([
        ...unfoldSteps(),
        {
          onStart: () => {
            status = 'Apuntando al sitio de muestra…';
            site = findSite();
            mast?.lookAt(site);
          },
          to: () => poseAbove(site, HOVER_HEIGHT),
          duration: 2.2,
        },
        { to: () => poseAbove(site, 0), duration: 1.4, onStart: say('Apoyando la broca…') },
        {
          to: () => poseAbove(site, -DRILL_DEPTH),
          duration: 3.0,
          onStart: say('Perforando…'),
          during: (t, dt) => {
            // La broca acelera, gira y frena al final, levantando polvo fino alrededor.
            const effort = Math.sin(Math.PI * t);
            bit.rotation.y += DRILL_SPIN * effort * dt;
            dustBudget += effort * DRILL_DUST_RATE * dt;
            const puffs = Math.floor(dustBudget);
            dustBudget -= puffs;
            if (puffs > 0) world.dust?.burst(site, puffs, { spread: 0.03, speed: 0.25, up: 0.15, startSize: 0.04, endSize: 0.25, life: 1.4, opacity: 0.4 });
          },
          onEnd: () => leaveDrillMark(site),
        },
        {
          to: () => poseAbove(site, HOVER_HEIGHT),
          duration: 1.4,
          onStart: () => {
            status = 'Muestra extraída';
            core.visible = true;
          },
        },
        { duration: 1.2 }, // pausa para ver el núcleo de roca
        ...stowSteps().map((step, i) =>
          i === 1
            ? {
                ...step,
                onEnd: () => {
                  core.visible = false; // guardada en su tubo
                  samples++;
                  status = '';
                  mast?.lookForward();
                },
              }
            : step
        ),
      ]);
    },

    update(dt) {
      player.update(dt);
    },
  };
}
