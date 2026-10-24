import * as THREE from 'three';
import { WHEEL_RADIUS } from '../rover/dimensions.js';

// Huellas de las ruedas: cada rueda deja una cinta de tramos cortos pegada al suelo.
const MAX_SEGMENTS = 600; // por rueda; al llenarse se reemplazan los tramos más viejos (~48 m)
const MIN_STEP = 0.08; // m que debe avanzar la rueda para agregar un tramo
const MAX_STEP = 1.0; // un salto mayor (teletransporte) corta la huella
const TRACK_WIDTH = 0.32;
const PATTERN_LENGTH = 0.25; // m que ocupa un ciclo del dibujo de los tacos
const LIFT = 0.012; // separación del suelo para que no parpadee
const ON_GROUND = 0.03; // si la rueda está más alta que esto sobre la arena, no marca

// Dibujo de la huella: marcas en V de los tacos y bordes suaves (se usa como transparencia).
function createTrackTexture() {
  const width = 64;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1); // a lo ancho
      const v = y / height; // a lo largo
      const edge = THREE.MathUtils.smoothstep(u, 0, 0.12) * THREE.MathUtils.smoothstep(1 - u, 0, 0.12);
      // Chevrón: la marca se desplaza hacia los bordes formando una V.
      const phase = (v + Math.abs(u - 0.5) * 0.35) % 1;
      const grouser = phase < 0.3 ? 1 : 0.45;
      const value = Math.round(edge * grouser * 255);
      const i = (y * width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// wheels: lista con { root } de cada rueda.
// ground.heightAt(x, z): arena; ground.rockHeightAt(x, z): rocas (sobre las rocas no queda huella).
export function createWheelTracks(wheels, ground) {
  const group = new THREE.Group();
  group.name = 'huellas';

  const material = new THREE.MeshStandardMaterial({
    color: 0x3a1d10,
    alphaMap: createTrackTexture(),
    transparent: true,
    opacity: 0.3,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const center = new THREE.Vector3();
  const trails = wheels.map((wheel) => {
    const positions = new Float32Array(MAX_SEGMENTS * 6 * 3);
    const uvs = new Float32Array(MAX_SEGMENTS * 6 * 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
    // Normales hacia arriba: la huella es casi plana y así se ilumina como el suelo.
    const normals = new Float32Array(MAX_SEGMENTS * 6 * 3);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // la huella crece por todo el mapa
    mesh.receiveShadow = true;
    group.add(mesh);
    return { wheel, geometry, positions, uvs, last: null, distance: 0, written: 0 };
  });

  // Agrega el tramo entre dos puntos (x, z) en el lugar libre (o el más viejo) del búfer.
  function addSegment(trail, from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    // Vector a lo ancho de la huella (perpendicular al avance).
    const sideX = (-dz / length) * (TRACK_WIDTH / 2);
    const sideZ = (dx / length) * (TRACK_WIDTH / 2);

    const corner = (x, z) => [x, ground.heightAt(x, z) + LIFT, z];
    const a0 = corner(from.x - sideX, from.z - sideZ);
    const b0 = corner(from.x + sideX, from.z + sideZ);
    const a1 = corner(to.x - sideX, to.z - sideZ);
    const b1 = corner(to.x + sideX, to.z + sideZ);

    const v0 = trail.distance / PATTERN_LENGTH;
    const v1 = (trail.distance + length) / PATTERN_LENGTH;
    trail.distance += length;

    const slot = trail.written % MAX_SEGMENTS;
    trail.positions.set([...a0, ...b0, ...a1, ...a1, ...b0, ...b1], slot * 18);
    trail.uvs.set([0, v0, 1, v0, 0, v1, 0, v1, 1, v0, 1, v1], slot * 12);
    trail.written++;

    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.uv.needsUpdate = true;
    trail.geometry.setDrawRange(0, Math.min(trail.written, MAX_SEGMENTS) * 6);
  }

  function update() {
    for (const trail of trails) {
      trail.wheel.root.getWorldPosition(center);
      const point = { x: center.x, z: center.z };
      if (!trail.last) {
        trail.last = point;
        continue;
      }

      const moved = Math.hypot(point.x - trail.last.x, point.z - trail.last.z);
      if (moved < MIN_STEP) continue;

      // Solo marca si la rueda apoya sobre la arena (no sobre una roca ni en el aire).
      const sand = ground.heightAt(point.x, point.z);
      const onSand = center.y - WHEEL_RADIUS < sand + ON_GROUND && ground.rockHeightAt(point.x, point.z) < sand + 0.02;
      if (moved <= MAX_STEP && onSand) addSegment(trail, trail.last, point);
      trail.last = point;
    }
  }

  return { group, update };
}
