import * as THREE from 'three';

// Las 4 cámaras que toman fotos reales, en el orden en que se recorren con Tab.
// offset: desplazamiento del punto (px) respecto de la cámara real, para que no se encimen;
// una línea fina une el punto con la cámara.
export const PHOTO_CAMERAS = {
  Mastcam_Z_cams: { name: 'Mastcam-Z', description: 'cámaras con zoom del mástil', offset: [-34, -22] },
  NavCams: { name: 'NavCams', description: 'cámaras de navegación del mástil', offset: [30, 14] },
  hazcams_front: { name: 'Hazcams delanteras', description: 'cámaras de riesgos, abajo al frente', offset: [-10, 30] },
  WATSON: { name: 'WATSON', description: 'cámara de primer plano del brazo', offset: [26, 24] },
};

const OCCLUSION_EVERY = 6; // cuadros entre cada revisión de si algo tapa la cámara
const MAST_CAMERAS = ['Mastcam_Z_cams', 'NavCams'];

// Puntos que brillan sobre las cámaras del modelo. Son botones del DOM (accesibles con teclado y fáciles
// de probar) que se ubican cada cuadro donde se ve la cámara en pantalla.
export function createCameraHotspots({ camera, rover, cameraRig, onSelect }) {
  const layer = document.createElement('div');
  layer.id = 'hotspots';
  document.body.append(layer);

  const raycaster = new THREE.Raycaster();
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let frame = 0;
  let hidden = false;

  const spots = Object.entries(PHOTO_CAMERAS).map(([key, info]) => {
    const leader = document.createElement('div');
    leader.className = 'hotspot-leader';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot';
    button.dataset.camera = key;
    button.setAttribute('aria-label', `${info.name}, ${info.description}: ver una foto real de Marte`);
    button.innerHTML = `<span class="hotspot-glow"></span><span class="hotspot-name">${info.name}</span>`;
    button.addEventListener('click', () => onSelect(key, button));

    layer.append(leader, button);
    return { key, info, anchor: rover.parts.cameras[key], button, leader, occluded: false };
  });

  function place(spot, width, height) {
    spot.anchor.getWorldPosition(world);
    projected.copy(world).project(camera);
    const behind = projected.z > 1;
    const inMastcam = cameraRig.mode === 'mastcam' && MAST_CAMERAS.includes(spot.key); // la cámara está ahí mismo
    const ax = Math.round((projected.x * 0.5 + 0.5) * width);
    const ay = Math.round((-projected.y * 0.5 + 0.5) * height);
    const offscreen = ax < 0 || ay < 0 || ax > width || ay > height;
    const visible = !hidden && !behind && !offscreen && !inMastcam;

    spot.button.classList.toggle('off', !visible);
    spot.leader.classList.toggle('off', !visible);
    if (!visible) return;

    // ¿Hay alguna pieza del rover entre la cámara del jugador y esta cámara? Se atenúa, pero sigue clicable.
    if (frame % OCCLUSION_EVERY === 0) {
      direction.subVectors(world, camera.position);
      const distance = direction.length();
      raycaster.set(camera.position, direction.normalize());
      raycaster.far = distance - 0.03;
      spot.occluded = raycaster.intersectObject(rover.root, true).length > 0;
    }
    spot.button.classList.toggle('occluded', spot.occluded);

    const [dx, dy] = spot.info.offset;
    spot.button.style.transform = `translate(${ax + dx}px, ${ay + dy}px)`;
    spot.leader.style.width = `${Math.hypot(dx, dy)}px`;
    spot.leader.style.transform = `translate(${ax}px, ${ay}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  return {
    update(width, height) {
      // project() usa la matriz de la cámara, que el renderer recién actualiza al dibujar:
      // sin esto, los puntos irían un cuadro atrasados cuando la cámara se mueve.
      camera.updateMatrixWorld();
      frame++;
      for (const spot of spots) place(spot, width, height);
    },
    setHidden(value) {
      hidden = value;
    },
  };
}
