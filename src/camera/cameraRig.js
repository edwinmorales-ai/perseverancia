import * as THREE from 'three';

// Modos de cámara, en el orden en que se recorren con la tecla C.
export const CAMERA_MODES = ['orbital', 'chase', 'mastcam'];
export const CAMERA_LABELS = { orbital: 'Orbital', chase: 'Tercera persona', mastcam: 'Mastcam-Z' };

const DEFAULT_FOV = 50;
const TRANSITION_TIME = 0.7; // s para pasar suave de un modo a otro
const MIN_HEIGHT_ABOVE_GROUND = 0.5;

// Orbital: posición al entrar, relativa al rover (adelante a la izquierda, como la vista inicial de main.js).
const ORBITAL_OFFSET = new THREE.Vector3(5.5, 1.7, 6.8);
const ORBITAL_TARGET_HEIGHT = 1.1;

// Tercera persona: detrás y arriba del rover, mirando un poco por delante de él.
const CHASE_HEIGHT = 2.8;
const CHASE_DISTANCE = { initial: 7, min: 4, max: 16 };
const CHASE_LOOK = new THREE.Vector3(0, 1.0, 1.5);
const CHASE_SMOOTHING = 0.3; // s; más alto = la cámara tarda más en alcanzar al rover

// Mastcam-Z: zoom aproximado de la cámara real (campo de visión horizontal de ~26° a ~6°).
const MASTCAM_FOV = { wide: 26, tele: 6 };
const MASTCAM_LOOK_SPEED = 0.004; // rad por píxel arrastrado con zoom al mínimo

// Controla la cámara en tres modos:
// - orbital: OrbitControls alrededor del rover, que lo acompaña cuando se mueve.
// - chase (tercera persona): detrás del rover, gira con él.
// - mastcam: desde la cabeza del mástil; el mouse mueve el mástil y la rueda hace zoom.
export function createCameraRig({ camera, controls, rover, mast, heightAt, domElement }) {
  let mode = 'orbital';
  let transition = null; // { fromPosition, fromQuaternion, fromFov, elapsed }
  let orbitalEntry = null; // pose a la que se llega al volver al modo orbital
  let chaseDistance = CHASE_DISTANCE.initial;
  let mastcamFov = MASTCAM_FOV.wide;

  // Punto de vista de Mastcam-Z: delante de los lentes, mirando hacia donde apunta la cabeza.
  // (Una cámara mira hacia -Z, la cabeza hacia +Z: por eso se gira 180°.)
  const mastcamAnchor = new THREE.Object3D();
  mastcamAnchor.position.set(0, 0, 0.21);
  mastcamAnchor.rotation.y = Math.PI;
  rover.parts.mast.head.add(mastcamAnchor);

  // Vectores reutilizables.
  const desiredPosition = new THREE.Vector3();
  const desiredQuaternion = new THREE.Quaternion();
  const lookTarget = new THREE.Vector3();
  const chasePosition = new THREE.Vector3();
  const chaseLook = new THREE.Vector3();
  const lastRoverPosition = rover.root.position.clone();
  const roverDelta = new THREE.Vector3();
  const lookMatrix = new THREE.Matrix4();

  const roverYaw = () => rover.root.rotation.y; // el rover usa orden 'YXZ': rotation.y es su rumbo

  // Punto relativo al rover que gira con su rumbo (sin cabeceo ni alabeo, para que no se maree).
  function aroundRover(offset, target) {
    return target.copy(offset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, roverYaw()).add(rover.root.position);
  }

  function quaternionLookingAt(eye, target, out) {
    lookMatrix.lookAt(eye, target, camera.up);
    return out.setFromRotationMatrix(lookMatrix);
  }

  function chaseOffset() {
    return new THREE.Vector3(0, CHASE_HEIGHT, -chaseDistance);
  }

  function setMode(next) {
    if (next === mode || !CAMERA_MODES.includes(next)) return;
    transition = {
      fromPosition: camera.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      fromFov: camera.fov,
      elapsed: 0,
    };
    controls.enabled = false;

    if (next === 'orbital') {
      const position = aroundRover(ORBITAL_OFFSET, new THREE.Vector3());
      const target = rover.root.position.clone().add(new THREE.Vector3(0, ORBITAL_TARGET_HEIGHT, 0));
      orbitalEntry = { position, target };
    }
    if (next === 'chase') {
      aroundRover(chaseOffset(), chasePosition);
      aroundRover(CHASE_LOOK, chaseLook);
    }
    mode = next;
  }

  // Pose que pide el modo actual en este cuadro (posición, orientación y campo de visión).
  function desiredPose(dt) {
    if (mode === 'orbital') {
      desiredPosition.copy(orbitalEntry.position);
      quaternionLookingAt(desiredPosition, orbitalEntry.target, desiredQuaternion);
      return DEFAULT_FOV;
    }

    if (mode === 'chase') {
      const k = 1 - Math.exp(-dt / CHASE_SMOOTHING);
      chasePosition.lerp(aroundRover(chaseOffset(), desiredPosition), k);
      chaseLook.lerp(aroundRover(CHASE_LOOK, lookTarget), k);
      desiredPosition.copy(chasePosition);
      keepAboveGround(desiredPosition);
      quaternionLookingAt(desiredPosition, chaseLook, desiredQuaternion);
      return DEFAULT_FOV;
    }

    // mastcam
    mastcamAnchor.updateWorldMatrix(true, false);
    mastcamAnchor.matrixWorld.decompose(desiredPosition, desiredQuaternion, lookTarget);
    return mastcamFov;
  }

  function keepAboveGround(position) {
    const ground = heightAt(position.x, position.z) + MIN_HEIGHT_ABOVE_GROUND;
    if (position.y < ground) position.y = ground;
  }

  function setFov(fov) {
    if (Math.abs(camera.fov - fov) < 1e-4) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  function update(dt) {
    // El rover se movió: en modo orbital la cámara y su centro lo acompañan.
    roverDelta.subVectors(rover.root.position, lastRoverPosition);
    lastRoverPosition.copy(rover.root.position);

    if (mode === 'orbital' && !transition) {
      camera.position.add(roverDelta);
      controls.target.add(roverDelta);
      controls.update();
      keepAboveGround(camera.position);
      setFov(DEFAULT_FOV);
      return;
    }
    if (mode === 'orbital') {
      // Mientras dura la transición, el punto de llegada sigue al rover.
      orbitalEntry.position.add(roverDelta);
      orbitalEntry.target.add(roverDelta);
    }

    const fov = desiredPose(dt);

    if (transition) {
      transition.elapsed += dt;
      const t = Math.min(transition.elapsed / TRANSITION_TIME, 1);
      const eased = THREE.MathUtils.smootherstep(t, 0, 1);
      camera.position.lerpVectors(transition.fromPosition, desiredPosition, eased);
      camera.quaternion.slerpQuaternions(transition.fromQuaternion, desiredQuaternion, eased);
      setFov(THREE.MathUtils.lerp(transition.fromFov, fov, eased));

      if (t >= 1) {
        transition = null;
        if (mode === 'orbital') {
          controls.target.copy(orbitalEntry.target);
          controls.enabled = true;
          controls.update();
        }
      }
      return;
    }

    camera.position.copy(desiredPosition);
    camera.quaternion.copy(desiredQuaternion);
    setFov(fov);
  }

  // --- Mouse en los modos sin OrbitControls ---
  let dragging = null;
  domElement.addEventListener('pointerdown', (event) => {
    if (mode !== 'mastcam' || event.button !== 0) return;
    dragging = { x: event.clientX, y: event.clientY };
    domElement.setPointerCapture(event.pointerId);
  });
  domElement.addEventListener('pointermove', (event) => {
    if (!dragging || mode !== 'mastcam') return;
    // Con más zoom, el mismo arrastre mueve menos (para apuntar con precisión).
    const speed = MASTCAM_LOOK_SPEED * (mastcamFov / MASTCAM_FOV.wide);
    mast.setAngle('azimuth', mast.state.azimuth - (event.clientX - dragging.x) * speed);
    mast.setAngle('elevation', mast.state.elevation - (event.clientY - dragging.y) * speed);
    dragging = { x: event.clientX, y: event.clientY };
  });
  domElement.addEventListener('pointerup', () => {
    dragging = null;
  });

  domElement.addEventListener(
    'wheel',
    (event) => {
      if (mode === 'mastcam') {
        mastcamFov = THREE.MathUtils.clamp(mastcamFov * Math.exp(event.deltaY * 0.001), MASTCAM_FOV.tele, MASTCAM_FOV.wide);
      } else if (mode === 'chase') {
        chaseDistance = THREE.MathUtils.clamp(chaseDistance * Math.exp(event.deltaY * 0.001), CHASE_DISTANCE.min, CHASE_DISTANCE.max);
      } else {
        return; // en orbital la rueda la maneja OrbitControls
      }
      event.preventDefault();
    },
    { passive: false }
  );

  return {
    get mode() {
      return mode;
    },
    set mode(next) {
      setMode(next);
    },
    setMode,
    cycle() {
      setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length]);
    },
    // Aumento de Mastcam-Z respecto del zoom mínimo (1× a ~4.3×).
    get mastcamZoom() {
      return MASTCAM_FOV.wide / mastcamFov;
    },
    // Punto alrededor del cual conviene calcular sombras.
    get focus() {
      return mode === 'orbital' && !transition ? controls.target : rover.root.position;
    },
    update,
  };
}
