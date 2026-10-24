import * as THREE from 'three';

const UPDATE_INTERVAL = 0.1; // s entre actualizaciones del panel (no hace falta cada cuadro)
const REAL_MAX_SPEED_CM = 4.2; // velocidad máxima del Perseverance real (cm/s)
const MMRTG_POWER_W = 110; // potencia aproximada del generador al lanzamiento

const toDegrees = THREE.MathUtils.radToDeg;

// Panel de telemetría: datos del rover actualizados en vivo.
// sources: { drive, rover, arm, ingenuity }
export function createTelemetry(element, { drive, rover, arm, ingenuity }) {
  const rows = {};
  const list = document.createElement('dl');
  const addRow = (key, label) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    list.append(dt, dd);
    rows[key] = dd;
  };

  const title = document.createElement('strong');
  title.textContent = 'Telemetría';
  element.append(title, list);

  addRow('state', 'Estado');
  addRow('speed', 'Velocidad');
  addRow('odometer', 'Recorrido');
  addRow('heading', 'Rumbo');
  addRow('attitude', 'Cabeceo / alabeo');
  addRow('position', 'Posición');
  addRow('samples', 'Muestras');
  addRow('power', 'Energía');
  addRow('ingenuity', 'Ingenuity');
  addRow('clock', 'Tiempo');

  const set = (key, text) => {
    if (rows[key].textContent !== text) rows[key].textContent = text;
  };

  function describeState() {
    if (arm.busy) return arm.status || 'Moviendo el brazo';
    if (!arm.stowed) return 'Brazo desplegado';
    if (drive.blocked) return 'Detenido: roca alta';
    const moving = drive.wheels.some((wheel) => Math.abs(wheel.rolling) > 0.01);
    if (!moving) return 'Detenido';
    if (drive.speed > 0.01) return 'Avanzando';
    if (drive.speed < -0.01) return 'Retrocediendo';
    return 'Girando en el lugar';
  }

  let elapsed = 0;
  let sinceUpdate = UPDATE_INTERVAL;

  function update(dt) {
    elapsed += dt;
    sinceUpdate += dt;
    if (sinceUpdate < UPDATE_INTERVAL) return;
    sinceUpdate = 0;

    // Rumbo: 0° = dirección inicial, crece al girar a la derecha (como una brújula).
    const heading = (((-toDegrees(drive.pose.yaw)) % 360) + 360) % 360;
    const pitch = -toDegrees(rover.root.rotation.x);
    const roll = toDegrees(rover.root.rotation.z);
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);

    set('state', describeState());
    set('speed', `${(Math.abs(drive.speed) * 100).toFixed(1)} cm/s (real máx. ${REAL_MAX_SPEED_CM})`);
    set('odometer', `${drive.odometer.toFixed(1)} m`);
    set('heading', `${heading.toFixed(0)}°`);
    set('attitude', `${pitch.toFixed(1)}° / ${roll.toFixed(1)}°`);
    set('position', `x ${drive.pose.x.toFixed(1)} · z ${drive.pose.z.toFixed(1)} m`);
    set('samples', String(arm.samples));
    set('power', `MMRTG ~${MMRTG_POWER_W} W`);
    set('ingenuity', ingenuity ? ingenuity.status : '—');
    set('clock', `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }

  return { update };
}
