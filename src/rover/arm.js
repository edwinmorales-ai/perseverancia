import * as THREE from 'three';
import { box, cylinder, cylinderX, cylinderZ } from './parts.js';

// Medidas del brazo (m). Las usa también la cinemática inversa (armController.js).
export const ARM_GEOMETRY = {
  upperArm: 1.0,
  forearm: 0.88,
  elbowOffset: 0.13, // el antebrazo va desplazado hacia arriba para plegarse sobre el brazo
  turretOffset: 0.06, // de la muñeca al centro de la torreta
  toolPlane: 0.08, // del centro de la torreta al plano donde salen las herramientas
  drillTip: 0.52, // del eje de la torreta a la punta de la broca
};
const UPPER_ARM_LENGTH = ARM_GEOMETRY.upperArm;
const FOREARM_LENGTH = ARM_GEOMETRY.forearm;
const ELBOW_OFFSET = ARM_GEOMETRY.elbowOffset;

// Pose de transporte: brazo cruzado delante del chasis, antebrazo plegado encima
// y la torreta colgando hacia el suelo, girada para que ninguna herramienta toque el chasis.
export const ARM_STOWED_POSE = {
  shoulderAzimuth: Math.PI / 2,
  shoulderElevation: 0,
  elbow: Math.PI,
  wrist: -Math.PI / 2,
  turret: THREE.MathUtils.degToRad(-15),
};

// Ángulo de cada herramienta alrededor del eje de la torreta. Ocupan un arco de ~200°
// (como en la torreta real) y dejan libre el lado que queda contra el chasis.
const TOOL_ANGLES = { drill: 0, pixl: 55, sherloc: 110, gdrt: 160, sensor: 210 };

// Herramientas de la torreta, repartidas alrededor del eje de giro.
function createTurret(materials) {
  const turret = new THREE.Group();

  const hub = cylinderZ(0.11, 0.16, materials.body, 24);
  hub.position.z = ARM_GEOMETRY.toolPlane;
  turret.add(hub);

  const tools = new THREE.Group();
  tools.position.z = ARM_GEOMETRY.toolPlane;
  turret.add(tools);
  const drillParts = {};

  // Cada herramienta apunta hacia afuera (eje +Y local) desde el centro de la torreta.
  const addTool = (angleDegrees, build) => {
    const holder = new THREE.Group();
    holder.rotation.z = THREE.MathUtils.degToRad(angleDegrees);
    const tool = build();
    holder.add(tool);
    tools.add(holder);
  };

  // Taladro de muestras (coring drill): cuerpo largo y broca.
  addTool(TOOL_ANGLES.drill, () => {
    const drill = new THREE.Group();
    const body = cylinder(0.055, 0.06, 0.3, materials.body);
    body.position.y = 0.25;
    drill.add(body);

    // Broca: gira sobre su eje (Y). Las aletas hacen visible el giro.
    const bit = new THREE.Group();
    bit.position.y = 0.46;
    bit.add(cylinder(0.014, 0.014, 0.12, materials.structure, 12));
    for (const angle of [0, Math.PI / 2]) {
      const flute = box(0.034, 0.1, 0.006, materials.dark);
      flute.rotation.y = angle;
      bit.add(flute);
    }
    drill.add(bit);

    // Punta de la broca: punto de referencia para apuntar al suelo.
    const tip = new THREE.Object3D();
    tip.position.y = ARM_GEOMETRY.drillTip;
    drill.add(tip);

    // Núcleo de roca que aparece en la broca después de perforar.
    const core = cylinder(0.011, 0.011, 0.05, materials.sample, 10);
    core.position.y = ARM_GEOMETRY.drillTip + 0.015;
    core.visible = false;
    drill.add(core);

    Object.assign(drillParts, { bit, tip, core });
    return drill;
  });

  // PIXL: espectrómetro de rayos X (caja con patas de contacto).
  addTool(TOOL_ANGLES.pixl, () => {
    const pixl = box(0.15, 0.16, 0.13, materials.body);
    pixl.position.y = 0.19;
    return pixl;
  });

  // SHERLOC + WATSON: espectrómetro y cámara de primer plano.
  addTool(TOOL_ANGLES.sherloc, () => {
    const sherloc = new THREE.Group();
    const body = box(0.12, 0.2, 0.1, materials.dark);
    body.position.y = 0.2;
    sherloc.add(body);
    const lens = cylinder(0.025, 0.025, 0.04, materials.lens, 16);
    lens.position.y = 0.32;
    sherloc.add(lens);
    // Punto de referencia de la cámara WATSON (para su punto brillante), justo pasando el lente.
    const watson = new THREE.Object3D();
    watson.name = 'WATSON';
    watson.position.y = 0.37;
    sherloc.add(watson);
    return sherloc;
  });

  // GDRT: herramienta para limpiar polvo de las rocas.
  addTool(TOOL_ANGLES.gdrt, () => {
    const gdrt = cylinder(0.035, 0.04, 0.12, materials.structure, 16);
    gdrt.position.y = 0.17;
    return gdrt;
  });

  // Sensor de contacto / cámara auxiliar.
  addTool(TOOL_ANGLES.sensor, () => {
    const sensor = box(0.07, 0.1, 0.07, materials.gold);
    sensor.position.y = 0.15;
    return sensor;
  });

  return { turret, drill: drillParts };
}

// Brazo robótico de 5 articulaciones.
//
// Jerarquía (cada grupo es una articulación):
//   root (se fija al frente del chasis)
//   └── shoulderAzimuth (Y)
//       └── shoulderElevation (X) → brazo
//           └── elbow (X) → antebrazo
//               └── wrist (X)
//                   └── turret (Z: gira las herramientas)
export function createArm(materials) {
  const root = new THREE.Group();
  root.name = 'brazo';

  // Soporte que une el hombro con el frente del chasis.
  const mount = box(0.16, 0.14, 0.16, materials.dark);
  mount.position.z = -0.08;
  root.add(mount);

  const shoulderAzimuth = new THREE.Group();
  root.add(shoulderAzimuth);
  shoulderAzimuth.add(cylinder(0.075, 0.075, 0.14, materials.dark));

  const shoulderElevation = new THREE.Group();
  shoulderAzimuth.add(shoulderElevation);
  shoulderElevation.add(cylinderX(0.07, 0.16, materials.dark));

  const upperArm = box(0.075, 0.075, UPPER_ARM_LENGTH - 0.1, materials.body);
  upperArm.position.z = UPPER_ARM_LENGTH / 2;
  shoulderElevation.add(upperArm);

  const elbowRiser = box(0.06, ELBOW_OFFSET, 0.08, materials.body);
  elbowRiser.position.set(0, ELBOW_OFFSET / 2, UPPER_ARM_LENGTH);
  shoulderElevation.add(elbowRiser);

  const elbow = new THREE.Group();
  elbow.position.set(0, ELBOW_OFFSET, UPPER_ARM_LENGTH);
  shoulderElevation.add(elbow);
  elbow.add(cylinderX(0.065, 0.15, materials.dark));

  const forearm = box(0.065, 0.065, FOREARM_LENGTH - 0.1, materials.body);
  forearm.position.z = FOREARM_LENGTH / 2;
  elbow.add(forearm);

  const wrist = new THREE.Group();
  wrist.position.z = FOREARM_LENGTH;
  elbow.add(wrist);
  wrist.add(cylinderX(0.06, 0.14, materials.dark));

  const { turret, drill } = createTurret(materials);
  turret.position.z = ARM_GEOMETRY.turretOffset;
  wrist.add(turret);

  const joints = { shoulderAzimuth, shoulderElevation, elbow, wrist, turret };

  // Aplica una pose: shoulderAzimuth rota en Y, turret en Z y el resto en X.
  function setPose(pose) {
    shoulderAzimuth.rotation.y = pose.shoulderAzimuth;
    shoulderElevation.rotation.x = pose.shoulderElevation;
    elbow.rotation.x = pose.elbow;
    wrist.rotation.x = pose.wrist;
    turret.rotation.z = pose.turret;
  }

  setPose(ARM_STOWED_POSE);
  // drill: { bit (gira en Y), tip (punta), core (muestra de roca, oculta) }
  return { root, joints, setPose, drill };
}
