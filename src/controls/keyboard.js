// Teclado para manejar el rover.
//   W / ↑  avanzar        S / ↓  retroceder
//   A / ←  girar a la izquierda (en arco)   D / →  girar a la derecha
//   Q      girar en el lugar a la izquierda  E      girar en el lugar a la derecha
//   Shift  ir más rápido
const DRIVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

// isLocked(): true mientras otra parte de la página usa el teclado (por ejemplo, el visor de fotos).
const notLocked = () => false;

// Teclas de cámara: C pasa al modo siguiente; 1, 2 y 3 eligen un modo directamente.
export function listenCameraKeys(rig, modes, { isLocked = notLocked, target = window } = {}) {
  const DIGITS = ['Digit1', 'Digit2', 'Digit3'];
  target.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // Cmd+C es copiar, no cambiar de cámara
    if (event.repeat || event.target instanceof HTMLInputElement || isLocked()) return;
    if (event.code === 'KeyC') rig.cycle();
    const index = DIGITS.indexOf(event.code);
    if (index >= 0 && modes[index]) rig.setMode(modes[index]);
  });
}

export function createKeyboardInput({ isLocked = notLocked, target = window } = {}) {
  const pressed = new Set();

  target.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // atajos del navegador, no manejo
    if (!DRIVE_KEYS.has(event.code)) return;
    if (event.target instanceof HTMLInputElement) return; // escribiendo en el panel, no manejando
    if (isLocked()) return;
    pressed.add(event.code);
    if (event.code.startsWith('Arrow')) event.preventDefault(); // que las flechas no muevan la página
  });
  // En macOS, una tecla que se suelta mientras Cmd sigue apretado no avisa: al soltar Cmd se olvidan todas.
  target.addEventListener('keyup', (event) => {
    if (event.key === 'Meta') pressed.clear();
    else pressed.delete(event.code);
  });
  // Si la ventana pierde el foco con una tecla apretada, no queda "pegada".
  window.addEventListener('blur', () => pressed.clear());

  const isDown = (...codes) => codes.some((code) => pressed.has(code));
  const axis = (positive, negative) => (positive ? 1 : 0) - (negative ? 1 : 0);

  // Estado actual de los controles. Si el teclado está bloqueado, el rover no recibe nada
  // y se olvidan las teclas apretadas (para que no arranque solo al desbloquear).
  return function read() {
    if (isLocked()) pressed.clear();
    return {
      throttle: axis(isDown('KeyW', 'ArrowUp'), isDown('KeyS', 'ArrowDown')), // -1..1
      steer: axis(isDown('KeyA', 'ArrowLeft'), isDown('KeyD', 'ArrowRight')), // +1 = izquierda
      turnInPlace: axis(isDown('KeyQ'), isDown('KeyE')), // +1 = izquierda
      boost: isDown('ShiftLeft', 'ShiftRight'),
    };
  };
}
