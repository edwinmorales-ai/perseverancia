import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { createRandom } from './random.js';
import { WORLD_SEED, COLORS } from './config.js';

// Tamaño del terreno (m) y cantidad de divisiones: 600 divisiones = un vértice cada 0.5 m.
export const TERRAIN_SIZE = 300;
const SEGMENTS = 600;

// Radio (m) donde están las colinas que cierran el horizonte.
const HILLS_RADIUS = 105;

const noise = new SimplexNoise(createRandom(WORLD_SEED));

// Ruido fractal: suma varias capas de ruido, cada una con el doble de detalle y la mitad de fuerza.
function fbm(x, z, octaves) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise.noise(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

// Zona de aterrizaje: alrededor del origen el relieve grande se aplana para que el rover
// arranque en suelo parejo. Entre LANDING_RADIUS y LANDING_RADIUS + LANDING_BLEND vuelve el relieve.
const LANDING_RADIUS = 5;
const LANDING_BLEND = 12;

// Campo de dunas de arena oscura, en la dirección que mira la cámara inicial (13 a 57 m del origen).
const DUNES = { x: -22, z: -27, radius: 22, wavelength: 18, height: 2.4, rippleWavelength: 2.5, rippleHeight: 0.05 };
// El viento sopla hacia la cámara inicial, así las caras empinadas (sotavento) quedan de este lado.
const DUNE_WIND = new THREE.Vector2(22, 27).normalize();
const SLIP_FACE = 0.2; // fracción de cada duna que ocupa la cara empinada (~33° de pendiente)

// Cuánto "es duna" un punto: 0 fuera del campo y 1 en el centro. Borde irregular y lejos del aterrizaje.
export function duneMask(x, z) {
  const wobble = noise.noise(x / 15 + 600, z / 15) * 4;
  const distance = Math.hypot(x - DUNES.x, z - DUNES.z) + wobble;
  const field = 1 - THREE.MathUtils.smoothstep(distance, DUNES.radius * 0.55, DUNES.radius);
  return field * THREE.MathUtils.smoothstep(Math.hypot(x, z), 16, 20);
}

// Alto de las dunas: diente de sierra a lo largo del viento, que sube suave (barlovento) y cae empinado.
function duneHeight(x, z, mask) {
  if (mask <= 0) return 0;
  // Coordenada a lo largo del viento, ondulada para que las crestas no sean rectas.
  const s = x * DUNE_WIND.x + z * DUNE_WIND.y + noise.noise(x / 30 + 700, z / 30) * 6;
  const phase = (((s / DUNES.wavelength) % 1) + 1) % 1;
  const profile = phase < 1 - SLIP_FACE ? phase / (1 - SLIP_FACE) : (1 - phase) / SLIP_FACE;
  const amplitude = DUNES.height * (0.75 + 0.25 * noise.noise(x / 25 + 800, z / 25));
  // Ondulitas de arena sobre las dunas (más largas que la malla de 0.5 m, para que no hagan moiré).
  const ripples = Math.sin((s / DUNES.rippleWavelength) * Math.PI * 2) * DUNES.rippleHeight;
  return mask * (amplitude * profile + ripples);
}

// Relieve grande: lomas, crestas, montículos, dunas y colinas del horizonte.
function largeHeight(x, z, mask = duneMask(x, z)) {
  // Lomas suaves del fondo del cráter.
  let h = fbm(x / 70, z / 70, 4) * 3;
  // Crestas alargadas (ruido "ridged": 1 - |ruido|).
  h += (1 - Math.abs(noise.noise(x / 35 + 40, z / 55))) * 1.2;
  // Montículos medianos.
  h += noise.noise(x / 12 + 100, z / 12) * 0.4;
  h += duneHeight(x, z, mask);

  // Anillo de colinas en el horizonte (simula el borde erosionado del cráter Jezero):
  // formas anchas y redondeadas, sin picos.
  const r = Math.hypot(x, z);
  const hills = Math.exp(-(((r - HILLS_RADIUS) / 26) ** 2));
  h += hills * (11 + fbm(x / 50 + 200, z / 50, 2) * 6);

  return h;
}

// Irregularidades pequeñas (~6 cm) que sentirá la suspensión del rover. Están en todo el terreno.
function smallHeight(x, z) {
  return noise.noise(x / 2.5, z / 2.5 + 50) * 0.06;
}

const ORIGIN_LARGE = largeHeight(0, 0);
const ORIGIN_SMALL = smallHeight(0, 0);

// Altura del suelo (m) en cualquier punto (x, z); el origen queda en 0.
// La usan las rocas, la cámara, la colocación del rover y, más adelante, su suspensión.
export function heightAt(x, z) {
  const landing = THREE.MathUtils.smoothstep(Math.hypot(x, z), LANDING_RADIUS, LANDING_RADIUS + LANDING_BLEND);
  const mask = duneMask(x, z);
  // La arena de las dunas es lisa: casi sin irregularidades pequeñas.
  return (largeHeight(x, z, mask) - ORIGIN_LARGE) * landing + smallHeight(x, z) * (1 - 0.8 * mask) - ORIGIN_SMALL;
}

// El terreno se divide en CHUNKS × CHUNKS bloques: así la cámara y las sombras
// descartan los bloques que no ven en vez de dibujar siempre los 720 k triángulos.
const CHUNKS = 6;

// Textura de detalle: 512 px repetidos cada DETAIL_TILE metros (~6 mm por píxel, nítida con zoom).
const DETAIL_SIZE = 512;
const DETAIL_TILE = 3;

// Textura de detalle en escala de grises (granos y piedritas). Se repite sobre el terreno
// y se multiplica por los colores de vértice.
function createDetailTexture(anisotropy) {
  const size = DETAIL_SIZE;
  const detailNoise = new SimplexNoise(createRandom(WORLD_SEED + 2));
  const TAU = Math.PI * 2;

  // Ruido 4D sobre un toro: la textura se repite sin costuras.
  const sample = (u, v, frequency) => {
    const r = frequency / TAU;
    return detailNoise.noise4d(
      Math.cos(u * TAU) * r,
      Math.sin(u * TAU) * r,
      Math.cos(v * TAU) * r,
      Math.sin(v * TAU) * r
    );
  };

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let value = 0.82 + sample(u, v, 3) * 0.08 + sample(u, v, 12) * 0.06 + sample(u, v, 40) * 0.05;
      // Piedritas: manchas pequeñas más oscuras.
      const pebble = sample(u, v, 28);
      if (pebble > 0.55) value -= (pebble - 0.55) * 0.9;

      const shade = THREE.MathUtils.clamp(value, 0, 1) * 255;
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(TERRAIN_SIZE / DETAIL_TILE, TERRAIN_SIZE / DETAIL_TILE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

// Grilla con la altura, la normal y el color de cada vértice de todo el terreno.
// Se calcula una vez y los bloques leen de ella: así las normales coinciden en los bordes
// entre bloques y no se ven costuras de iluminación.
function createTerrainGrid() {
  const count = SEGMENTS + 1;
  const step = TERRAIN_SIZE / SEGMENTS;
  const half = TERRAIN_SIZE / 2;
  const heights = new Float32Array(count * count);
  const normals = new Float32Array(count * count * 3);
  const colors = new Float32Array(count * count * 3);
  const index = (i, j) => j * count + i; // i recorre x, j recorre z

  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) heights[index(i, j)] = heightAt(-half + i * step, -half + j * step);
  }

  const soil = new THREE.Color(COLORS.soil);
  const soilDark = new THREE.Color(COLORS.soilDark);
  const dust = new THREE.Color(COLORS.dust);
  const duneSand = new THREE.Color(COLORS.duneSand);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const h = (i, j) => heights[index(THREE.MathUtils.clamp(i, 0, count - 1), THREE.MathUtils.clamp(j, 0, count - 1))];

  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      // Normal por diferencias centrales de la altura.
      normal.set(h(i - 1, j) - h(i + 1, j), 2 * step, h(i, j - 1) - h(i, j + 1)).normalize();
      normal.toArray(normals, index(i, j) * 3);

      // Color: manchas de polvo claro y suelo más oscuro en las pendientes.
      const x = -half + i * step;
      const z = -half + j * step;
      const dustPatch = noise.noise(x / 18 + 300, z / 18) * 0.5 + 0.5;
      const slope = 1 - normal.y;
      color.copy(soil).lerp(dust, dustPatch * 0.7);
      color.lerp(duneSand, duneMask(x, z) * 0.7); // arena basáltica oscura de las dunas
      color.lerp(soilDark, THREE.MathUtils.smoothstep(slope, 0.04, 0.3) * 0.8);
      color.multiplyScalar(0.94 + noise.noise(x / 1.5, z / 1.5 + 500) * 0.06);
      color.toArray(colors, index(i, j) * 3);
    }
  }

  return { count, step, half, heights, normals, colors, index };
}

// Geometría de un bloque: copia su parte de la grilla.
function createChunkGeometry(grid, chunkI, chunkJ) {
  const per = SEGMENTS / CHUNKS; // divisiones por bloque
  const verts = per + 1;
  const positions = new Float32Array(verts * verts * 3);
  const normals = new Float32Array(verts * verts * 3);
  const colors = new Float32Array(verts * verts * 3);
  const uvs = new Float32Array(verts * verts * 2);

  for (let b = 0; b < verts; b++) {
    for (let a = 0; a < verts; a++) {
      const i = chunkI * per + a;
      const j = chunkJ * per + b;
      const source = grid.index(i, j);
      const target = b * verts + a;
      positions.set([-grid.half + i * grid.step, grid.heights[source], -grid.half + j * grid.step], target * 3);
      normals.set(grid.normals.subarray(source * 3, source * 3 + 3), target * 3);
      colors.set(grid.colors.subarray(source * 3, source * 3 + 3), target * 3);
      uvs.set([i / SEGMENTS, j / SEGMENTS], target * 2);
    }
  }

  // Dos triángulos por celda, en sentido antihorario visto desde arriba.
  const indices = [];
  for (let b = 0; b < per; b++) {
    for (let a = 0; a < per; a++) {
      const v0 = b * verts + a;
      const v1 = v0 + 1;
      const v2 = v0 + verts;
      const v3 = v2 + 1;
      indices.push(v0, v2, v1, v1, v2, v3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTerrain({ anisotropy = 1 } = {}) {
  const grid = createTerrainGrid();
  const detail = createDetailTexture(anisotropy);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detail,
    bumpMap: detail,
    bumpScale: 1,
    roughness: 0.95,
    metalness: 0,
  });

  const terrain = new THREE.Group();
  terrain.name = 'terreno';
  for (let chunkJ = 0; chunkJ < CHUNKS; chunkJ++) {
    for (let chunkI = 0; chunkI < CHUNKS; chunkI++) {
      const mesh = new THREE.Mesh(createChunkGeometry(grid, chunkI, chunkJ), material);
      mesh.name = `terreno-${chunkI}-${chunkJ}`;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      terrain.add(mesh);
    }
  }
  return terrain;
}
