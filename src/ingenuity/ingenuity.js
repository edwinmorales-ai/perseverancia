import * as THREE from 'three';
import { createSequencePlayer } from '../rover/sequence.js';
import { box, beam, cylinder } from '../rover/parts.js';

// Medidas aproximadas del helicóptero Ingenuity: rotores coaxiales de 1.2 m de diámetro,
// ~0.49 m de alto, cuerpo de unos 14 × 16 × 19 cm sobre 4 patas.
const ROTOR_DIAMETER = 1.2;
const BODY = { width: 0.14, height: 0.16, depth: 0.19, bottom: 0.13 };
const FOOT_SPREAD = 0.24; // distancia de cada pie al centro en X y en Z
const ROTOR_LOW_Y = 0.36;
const ROTOR_HIGH_Y = 0.43;
const PANEL_Y = 0.49;

// Vuelo de demostración.
const FLIGHT_ALTITUDE = 5; // m sobre el suelo
const FLIGHT_DISTANCE = 14; // m de ida (y vuelta)
const MAX_DISTANCE_FROM_ORIGIN = 75;
// El rotor real gira a ~2400 rpm; en pantalla se muestra mucho más lento (si no, solo se vería parpadeo)
// y se suma un disco translúcido como "estela" de las palas.
const ROTOR_VISUAL_SPEED = 30; // rad/s
const TILT_PER_SPEED = 0.07; // rad de inclinación por cada m/s de avance
const ROTOR_DUST_HEIGHT = 3; // m: por debajo de esta altura el rotor levanta polvo
const FOOTPRINT = 0.35; // m de radio que ocupa en el suelo (el rover no lo puede pisar)

function createModel(envMap) {
  // Materiales poco espejados: con el sol de frente, las superficies brillantes reflejan un destello
  // que el post-proceso (bloom) convierte en una mancha de luz.
  const make = (params) => new THREE.MeshStandardMaterial({ envMap, envMapIntensity: 0.5, ...params });
  const materials = {
    foil: make({ color: 0xc9a24b, roughness: 0.7, metalness: 0.5 }), // aislante dorado del cuerpo
    structure: make({ color: 0xcfcfcf, roughness: 0.7, metalness: 0.3 }),
    carbon: make({ color: 0x1c1c1c, roughness: 0.75, metalness: 0.1 }), // palas de fibra de carbono
    // El panel solar real brilla mucho; aquí va mate porque el reflejo del sol de frente se volvía una mancha.
    solar: make({ color: 0x1d2a4a, roughness: 0.9, metalness: 0.05 }),
  };

  const group = new THREE.Group();
  group.name = 'ingenuity';
  const tilt = new THREE.Group(); // se inclina hacia donde avanza
  group.add(tilt);

  const body = box(BODY.width, BODY.height, BODY.depth, materials.foil);
  body.position.y = BODY.bottom + BODY.height / 2;
  tilt.add(body);

  // Patas: de las esquinas inferiores del cuerpo hacia afuera, con un pie pequeño.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hip = new THREE.Vector3(sx * BODY.width * 0.4, BODY.bottom + 0.02, sz * BODY.depth * 0.4);
      const foot = new THREE.Vector3(sx * FOOT_SPREAD, 0.015, sz * FOOT_SPREAD);
      tilt.add(beam(hip, foot, 0.006, materials.structure));
      const pad = cylinder(0.025, 0.025, 0.01, materials.structure, 12);
      pad.position.copy(foot).setY(0.005);
      tilt.add(pad);
    }
  }

  // Mástil con los dos rotores y el panel solar arriba.
  const mastBottom = BODY.bottom + BODY.height;
  tilt.add(beam(new THREE.Vector3(0, mastBottom, 0), new THREE.Vector3(0, PANEL_Y, 0), 0.012, materials.structure));

  const createRotor = (y) => {
    const rotor = new THREE.Group();
    rotor.position.y = y;
    rotor.add(cylinder(0.035, 0.035, 0.03, materials.structure, 16));
    for (const angle of [0, Math.PI]) {
      const blade = box(ROTOR_DIAMETER / 2, 0.006, 0.08, materials.carbon);
      blade.position.x = ROTOR_DIAMETER / 4;
      blade.rotation.x = 0.08; // ángulo de ataque
      const holder = new THREE.Group();
      holder.rotation.y = angle;
      holder.add(blade);
      rotor.add(holder);
    }
    tilt.add(rotor);
    return rotor;
  };
  const lowerRotor = createRotor(ROTOR_LOW_Y);
  const upperRotor = createRotor(ROTOR_HIGH_Y);

  // Estela de las palas: discos translúcidos que aparecen cuando los rotores giran rápido.
  const discMaterial = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  for (const y of [ROTOR_LOW_Y, ROTOR_HIGH_Y]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ROTOR_DIAMETER / 2, 40), discMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = y;
    tilt.add(disc);
  }

  const panel = box(0.425, 0.012, 0.165, materials.solar);
  panel.position.y = PANEL_Y + 0.01;
  tilt.add(panel);

  return { group, tilt, lowerRotor, upperRotor, discMaterial };
}

// Helicóptero Ingenuity: estacionado cerca del rover, hace un vuelo de demostración a pedido.
// world.surfaceHeight(x, z): altura del suelo o roca; world.dust: polvo que levanta el rotor.
export function createIngenuity({ home, envMap = null, world }) {
  const model = createModel(envMap);
  const ground = (x, z) => world.surfaceHeight(x, z);
  const state = { x: home.x, y: ground(home.x, home.z), z: home.z, yaw: home.yaw ?? 0, rotor: 0 };
  const apply = () => {
    model.group.position.set(state.x, state.y, state.z);
    model.group.rotation.y = state.yaw;
  };
  apply();
  const player = createSequencePlayer(state, apply);

  let phase = 'En tierra';
  let flights = 0;
  let dustBudget = 0;
  const previous = new THREE.Vector3().copy(model.group.position);
  const velocity = new THREE.Vector3();
  const tilt = { pitch: 0, roll: 0 };

  const say = (text) => () => {
    phase = text;
  };
  const altitude = () => state.y - ground(state.x, state.z);

  function fly() {
    if (player.busy) return;
    const start = { x: state.x, z: state.z };
    // Vuela hacia adelante (según su orientación), sin salir del área del mapa.
    let target = { x: start.x + Math.sin(state.yaw) * FLIGHT_DISTANCE, z: start.z + Math.cos(state.yaw) * FLIGHT_DISTANCE };
    const distance = Math.hypot(target.x, target.z);
    if (distance > MAX_DISTANCE_FROM_ORIGIN) {
      const scale = MAX_DISTANCE_FROM_ORIGIN / distance;
      target = { x: target.x * scale, z: target.z * scale };
    }
    const cruise = Math.max(ground(start.x, start.z), ground(target.x, target.z)) + FLIGHT_ALTITUDE;

    player.play([
      { to: { rotor: 1 }, duration: 2.5, onStart: say('Encendiendo rotores') },
      { to: { y: cruise }, duration: 4, onStart: say('Despegando') },
      { to: { x: target.x, z: target.z }, duration: 7, onStart: say('Volando') },
      { duration: 1.5, onStart: say('Sobrevolando') },
      { to: () => ({ yaw: state.yaw + Math.PI }), duration: 2.5, onStart: say('Girando') },
      { to: { x: start.x, z: start.z }, duration: 7, onStart: say('Regresando') },
      { to: () => ({ y: ground(start.x, start.z) }), duration: 4.5, onStart: say('Aterrizando') },
      {
        to: { rotor: 0 },
        duration: 2.5,
        onStart: say('Apagando rotores'),
        onEnd: () => {
          phase = 'En tierra';
          flights++;
        },
      },
    ]);
  }

  function update(dt) {
    player.update(dt);

    // Se inclina hacia donde avanza, como un helicóptero real.
    velocity.subVectors(model.group.position, previous).divideScalar(Math.max(dt, 1e-6));
    previous.copy(model.group.position);
    const forward = velocity.x * Math.sin(state.yaw) + velocity.z * Math.cos(state.yaw);
    const sideways = velocity.x * Math.cos(state.yaw) - velocity.z * Math.sin(state.yaw);
    const k = 1 - Math.exp(-dt / 0.3);
    tilt.pitch += (THREE.MathUtils.clamp(forward * TILT_PER_SPEED, -0.3, 0.3) - tilt.pitch) * k;
    // Rotación positiva en Z sube el lado +X: para inclinarse hacia +X el signo va invertido.
    tilt.roll += (THREE.MathUtils.clamp(-sideways * TILT_PER_SPEED, -0.3, 0.3) - tilt.roll) * k;
    model.tilt.rotation.set(tilt.pitch, 0, tilt.roll);

    // Rotores coaxiales: giran en sentidos opuestos.
    model.lowerRotor.rotation.y += ROTOR_VISUAL_SPEED * state.rotor * dt;
    model.upperRotor.rotation.y -= ROTOR_VISUAL_SPEED * state.rotor * dt;
    model.discMaterial.opacity = 0.18 * THREE.MathUtils.smoothstep(state.rotor, 0.4, 1);

    // Cerca del suelo, el aire de los rotores levanta polvo (más cuanto más bajo).
    const height = altitude();
    if (world.dust && state.rotor > 0.6 && height < ROTOR_DUST_HEIGHT) {
      dustBudget += 60 * state.rotor * (1 - height / ROTOR_DUST_HEIGHT) * dt;
      const puffs = Math.floor(dustBudget);
      dustBudget -= puffs;
      if (puffs > 0) {
        const point = { x: state.x, y: ground(state.x, state.z), z: state.z };
        world.dust.burst(point, puffs, { spread: 0.5, speed: 1.4, up: 0.15, startSize: 0.15, endSize: 0.9, life: 1.8, opacity: 0.25 });
      }
    }
  }

  return {
    group: model.group,
    fly,
    update,
    get busy() {
      return player.busy;
    },
    get flights() {
      return flights;
    },
    get altitude() {
      return altitude();
    },
    get status() {
      return phase === 'En tierra' ? phase : `${phase} · ${Math.max(0, altitude()).toFixed(1)} m`;
    },
    // El rover no puede pasar por encima del helicóptero cuando está en el suelo.
    isObstacle(x, z) {
      return altitude() < 0.5 && Math.hypot(x - state.x, z - state.z) < FOOTPRINT;
    },
  };
}
