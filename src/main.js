import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from './world/config.js';
import { createTerrain, heightAt } from './world/terrain.js';
import { createRocks } from './world/rocks.js';
import { createSky } from './world/sky.js';
import { createMoons } from './world/moons.js';
import { createPostProcessing } from './render/postprocessing.js';
import { createLights } from './world/lights.js';
import { createEnvironmentMap } from './world/environment.js';
import { createRover } from './rover/rover.js';
import { createDriveController } from './rover/drive.js';
import { createKeyboardInput, listenCameraKeys } from './controls/keyboard.js';
import { createArmController } from './rover/armController.js';
import { createMastController } from './rover/mastController.js';
import { createControlPanel } from './ui/panel.js';
import { createCameraRig, CAMERA_MODES, CAMERA_LABELS } from './camera/cameraRig.js';
import { createWheelTracks } from './effects/tracks.js';
import { createDust } from './effects/dust.js';
import { createIngenuity } from './ingenuity/ingenuity.js';
import { createTelemetry } from './ui/telemetry.js';
import { createCameraHotspots } from './ui/cameraHotspots.js';
import { createPhotoViewer } from './ui/photoViewer.js';
import photos from './photos/photos.json';

// Convenciones de la escena:
// - 1 unidad = 1 metro.
// - Eje Y hacia arriba.
// - El rover mira hacia +Z (como Object3D.lookAt), su ancho va en X.

const container = document.getElementById('app');

// Escena con niebla de polvo: el color coincide con el horizonte del cielo.
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.fog, 12, 150);

// Cámara: baja y casi horizontal, para que entren el suelo, las dunas, el sol y las lunas.
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5.5, 1.7, 6.8);

// Renderer
// Con post-proceso, el suavizado de bordes (MSAA) lo hace su render target: el canvas no lo necesita.
const renderer = new THREE.WebGLRenderer({ antialias: new URLSearchParams(window.location.search).has('nopost') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // con post-proceso hay varias pasadas: se reinicia a mano en cada cuadro
container.appendChild(renderer.domElement);
const post = createPostProcessing(renderer, scene, camera);

// Mundo
const sky = createSky();
const moons = createMoons();
const lights = createLights();
scene.add(sky, moons, lights.group);
scene.add(createTerrain({ anisotropy: renderer.capabilities.getMaxAnisotropy() }));
const rocks = createRocks();
scene.add(rocks.group);
const surfaceHeight = (x, z) => Math.max(heightAt(x, z), rocks.heightAt(x, z));
const envMap = createEnvironmentMap(renderer);

// Polvo (ruedas, taladro y rotores de Ingenuity).
const dust = createDust(camera, renderer);
scene.add(dust.points);

// Ingenuity, estacionado detrás del rover a la izquierda, mirando hacia afuera.
const ingenuity = createIngenuity({
  home: { x: 4, z: -2.5, yaw: Math.atan2(1, -0.5) },
  envMap,
  world: { surfaceHeight, dust },
});
scene.add(ingenuity.group);

// Rover y manejo
const rover = createRover({ envMap });
scene.add(rover.root);

const drive = createDriveController(rover, {
  heightAt,
  rockHeightAt: rocks.heightAt,
  isObstacle: (x, z) => rocks.isObstacle(x, z) || ingenuity.isObstacle(x, z),
});
// El teclado se bloquea mientras el visor de fotos está abierto (sus flechas cambian de foto).
let inputLocked = false;
const isLocked = () => inputLocked;
const readInput = createKeyboardInput({ isLocked });
const IDLE_INPUT = { throttle: 0, steer: 0, turnInPlace: 0, boost: false };
drive.update(0, IDLE_INPUT); // apoyar en el suelo

// Huellas de las 6 ruedas.
const tracks = createWheelTracks(drive.wheels, { heightAt, rockHeightAt: rocks.heightAt });
scene.add(tracks.group);

// Instrumentos: mástil y brazo (con la secuencia de muestra).
const marks = new THREE.Group(); // marcas que deja el taladro en el suelo
marks.name = 'marcas';
scene.add(marks);
const mast = createMastController(rover);
const arm = createArmController(rover, { surfaceHeight, marks, dust }, mast);

// Cámaras: orbital (OrbitControls), tercera persona y Mastcam-Z.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update();

const cameraRig = createCameraRig({ camera, controls, rover, mast, heightAt, domElement: renderer.domElement });
listenCameraKeys(cameraRig, CAMERA_MODES, { isLocked });

// Cámaras que toman fotos reales de Marte: puntos brillantes sobre el modelo y visor de fotos.
const hotspots = createCameraHotspots({
  camera,
  rover,
  cameraRig,
  onSelect: (key, button) => viewer.open(key, button),
});
const viewer = createPhotoViewer({
  photos,
  baseUrl: import.meta.env.BASE_URL,
  onOpenChange: (open) => {
    inputLocked = open;
    hotspots.setHidden(open);
  },
});

const panel = createControlPanel({ arm, mast, cameraRig, ingenuity });
const telemetry = createTelemetry(document.getElementById('telemetry'), { drive, rover, arm, ingenuity });

// HUD: estado del brazo, modo de cámara y mira de Mastcam-Z.
const statusElement = document.getElementById('status');
const cameraModeElement = document.getElementById('camera-mode');
const mastcamOverlay = document.getElementById('mastcam-overlay');
const mastcamZoomElement = document.getElementById('mastcam-zoom');
const shown = {};
function showText(element, key, text) {
  if (shown[key] === text) return;
  shown[key] = text;
  element.textContent = text;
  element.hidden = !text;
}
function updateHud() {
  showText(statusElement, 'status', arm.status || (arm.stowed ? '' : 'Brazo desplegado: pliégalo para manejar'));
  showText(cameraModeElement, 'camera', `Cámara: ${CAMERA_LABELS[cameraRig.mode]}`);
  mastcamOverlay.hidden = cameraRig.mode !== 'mastcam';
  if (!mastcamOverlay.hidden) showText(mastcamZoomElement, 'zoom', `Zoom ${cameraRig.mastcamZoom.toFixed(1)}×`);
}

// Acceso desde la consola del navegador para depurar (solo en desarrollo).
if (import.meta.env.DEV) {
  window.perseverancia = {
    scene, camera, renderer, controls, heightAt, rover, drive, rocks, arm, mast, cameraRig, dust, tracks, ingenuity,
    viewer,
  };
}

// Ajuste al tamaño de la ventana
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// Bucle de render. dt se limita para que una pausa larga (pestaña oculta) no haga saltar al rover.
const MAX_STEP = 0.05;
// Tras unos cuadros (shaders compilados), la página avisa que está lista: lo usa `npm run check`.
const READY_AFTER_FRAMES = 10;
let frames = 0;
let lastTime = null;
renderer.setAnimationLoop((time) => {
  if (++frames === READY_AFTER_FRAMES) document.documentElement.dataset.ready = '1';
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_STEP);
  lastTime = time;

  // Con una foto abierta, el juego queda en pausa y no se dibuja (el visor tapa la escena).
  if (viewer.isOpen) return;

  // Como el rover real, solo se maneja con el brazo plegado.
  drive.update(dt, arm.stowed && !arm.busy ? readInput() : IDLE_INPUT);
  arm.update(dt);
  mast.update(dt);
  ingenuity.update(dt);
  tracks.update();
  dust.fromWheels(drive.wheels, dt);
  dust.update(dt);
  cameraRig.update(dt); // después de mover rover y mástil, para que la cámara use su pose final
  hotspots.update(renderer.domElement.clientWidth, renderer.domElement.clientHeight);
  panel.update();
  updateHud();
  telemetry.update(dt);

  sky.position.copy(camera.position);
  moons.position.copy(camera.position);
  lights.follow(cameraRig.focus);
  renderer.info.reset(); // contar triángulos y llamadas de todo el cuadro (todas las pasadas)
  post.render(dt);
});
