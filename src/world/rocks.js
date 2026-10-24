import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { createRandom } from './random.js';
import { heightAt, duneMask } from './terrain.js';
import { WORLD_SEED, COLORS } from './config.js';

// Cantidad de formas base distintas por grupo. Cada roca usa una de ellas con su propia escala y giro.
const SHAPE_COUNT = 6;

// Grupos de rocas: cuántas, rango de tamaño (m), radio donde se reparten, zona libre en el centro,
// nivel de detalle de la malla, si proyectan sombra (las piedritas no, por rendimiento)
// y si las ruedas las sienten al pasar por encima (las piedritas son solo decorativas).
// drawRadius: más allá de esa distancia al origen no se dibujan (se generan igual para no cambiar el mundo).
const ROCK_GROUPS = [
  { name: 'piedritas', count: 1500, minSize: 0.04, maxSize: 0.15, radius: 70, clearRadius: 0, detail: 1, castShadow: false, solid: false, drawRadius: 45 },
  { name: 'rocas', count: 350, minSize: 0.15, maxSize: 0.5, radius: 80, clearRadius: 2, detail: 2, castShadow: true, solid: true },
  { name: 'bloques', count: 30, minSize: 0.6, maxSize: 1.8, radius: 85, clearRadius: 10, detail: 3, castShadow: true, solid: true },
];

// Altura máxima (m) que el rover puede trepar: rocas más altas son obstáculos que lo frenan.
// El Perseverance real supera rocas del tamaño de sus ruedas (~0.5 m).
export const MAX_CLIMB_HEIGHT = 0.5;

// Tamaño (m) de cada celda de la grilla que acelera la búsqueda de rocas cercanas.
const GRID_CELL = 4;

// Mapa del "techo" de cada forma de roca: altura de la superficie superior en una grilla sobre su planta.
// Las formas caben en [-EXTENT, EXTENT] (esfera unitaria deformada como máximo ~45 %).
const TOP_MAP_SIZE = 24;
const TOP_MAP_EXTENT = 1.5;
const TOP_MAP_STEP = (2 * TOP_MAP_EXTENT) / (TOP_MAP_SIZE - 1);

// Crea una forma de roca deformando una esfera facetada con ruido.
function createRockShape(noise, index, detail) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const offset = index * 17.3;

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const bump =
      noise.noise3d(vertex.x * 0.9 + offset, vertex.y * 0.9, vertex.z * 0.9) * 0.35 +
      noise.noise3d(vertex.x * 2.5, vertex.y * 2.5 + offset, vertex.z * 2.5) * 0.1;
    vertex.multiplyScalar(1 + bump);
    // Base aplanada para que se asiente en el suelo.
    if (vertex.y < -0.3) vertex.y = -0.3 + (vertex.y + 0.3) * 0.3;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  // La geometría no está indexada: cada cara recibe su propia normal y se ve facetada.
  geometry.computeVertexNormals();
  return geometry;
}

// Calcula el techo de una forma "rasterizando" sus triángulos vistos desde arriba:
// en cada punto de la grilla se guarda la altura más alta de los triángulos que lo cubren.
function createTopMap(geometry) {
  const heights = new Float32Array(TOP_MAP_SIZE * TOP_MAP_SIZE).fill(-Infinity);
  const p = geometry.attributes.position;
  const toGrid = (value) => (value + TOP_MAP_EXTENT) / TOP_MAP_STEP;

  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), ay = p.getY(t), az = p.getZ(t);
    const bx = p.getX(t + 1), by = p.getY(t + 1), bz = p.getZ(t + 1);
    const cx = p.getX(t + 2), cy = p.getY(t + 2), cz = p.getZ(t + 2);
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-9) continue; // triángulo vertical: no aporta techo

    const minI = Math.max(0, Math.ceil(toGrid(Math.min(ax, bx, cx))));
    const maxI = Math.min(TOP_MAP_SIZE - 1, Math.floor(toGrid(Math.max(ax, bx, cx))));
    const minJ = Math.max(0, Math.ceil(toGrid(Math.min(az, bz, cz))));
    const maxJ = Math.min(TOP_MAP_SIZE - 1, Math.floor(toGrid(Math.max(az, bz, cz))));

    for (let i = minI; i <= maxI; i++) {
      const x = -TOP_MAP_EXTENT + i * TOP_MAP_STEP;
      for (let j = minJ; j <= maxJ; j++) {
        const z = -TOP_MAP_EXTENT + j * TOP_MAP_STEP;
        // Coordenadas baricéntricas del punto (x, z) dentro del triángulo.
        const w1 = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / area;
        const w2 = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        const k = i * TOP_MAP_SIZE + j;
        if (y > heights[k]) heights[k] = y;
      }
    }
  }

  let maxHeight = -Infinity;
  for (const h of heights) maxHeight = Math.max(maxHeight, h);
  return { heights, maxHeight };
}

// Altura del techo en (u, v) de la forma, interpolando entre los 4 puntos vecinos de la grilla.
// Devuelve -Infinity fuera de la roca.
function sampleTopMap({ heights }, u, v) {
  const gi = (u + TOP_MAP_EXTENT) / TOP_MAP_STEP;
  const gj = (v + TOP_MAP_EXTENT) / TOP_MAP_STEP;
  const i0 = Math.floor(gi);
  const j0 = Math.floor(gj);
  if (i0 < 0 || j0 < 0 || i0 >= TOP_MAP_SIZE - 1 || j0 >= TOP_MAP_SIZE - 1) return -Infinity;

  const fi = gi - i0;
  const fj = gj - j0;
  let sum = 0;
  let weight = 0;
  for (const [di, dj, w] of [[0, 0, (1 - fi) * (1 - fj)], [1, 0, fi * (1 - fj)], [0, 1, (1 - fi) * fj], [1, 1, fi * fj]]) {
    const h = heights[(i0 + di) * TOP_MAP_SIZE + (j0 + dj)];
    if (h === -Infinity) continue;
    sum += h * w;
    weight += w;
  }
  // En el borde de la roca, solo se cuenta si la mayor parte del área vecina es roca.
  return weight > 0.5 ? sum / weight : -Infinity;
}

// Grilla de rocas sólidas para encontrar rápido las que hay cerca de un punto.
function createColliderGrid() {
  const cells = new Map();
  const key = (ix, iz) => `${ix},${iz}`;
  const local = new THREE.Vector3();

  function add(rock) {
    const { x, z, radius } = rock;
    for (let ix = Math.floor((x - radius) / GRID_CELL); ix <= Math.floor((x + radius) / GRID_CELL); ix++) {
      for (let iz = Math.floor((z - radius) / GRID_CELL); iz <= Math.floor((z + radius) / GRID_CELL); iz++) {
        const k = key(ix, iz);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(rock);
      }
    }
  }

  function nearby(x, z) {
    return cells.get(key(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL))) ?? [];
  }

  // Altura del techo de una roca en (x, z) del mundo: se pasa el punto a coordenadas de la roca,
  // se lee su mapa de techo y se vuelve al mundo.
  function rockTop(rock, x, z) {
    if ((x - rock.x) ** 2 + (z - rock.z) ** 2 > rock.radius ** 2) return -Infinity;
    local.set(x, rock.centerY, z).applyMatrix4(rock.inverse);
    const top = sampleTopMap(rock.topMap, local.x, local.z);
    if (top === -Infinity) return -Infinity;
    local.y = top;
    return local.applyMatrix4(rock.matrix).y;
  }

  // Altura de la superficie de roca en (x, z), o -Infinity si no hay roca.
  function heightAt(x, z) {
    let height = -Infinity;
    for (const rock of nearby(x, z)) height = Math.max(height, rockTop(rock, x, z));
    return height;
  }

  // true si (x, z) cae sobre una roca demasiado alta para trepar.
  function isObstacle(x, z) {
    return nearby(x, z).some((rock) => rock.tooTall && rockTop(rock, x, z) !== -Infinity);
  }

  return { add, heightAt, isObstacle };
}

export function createRocks() {
  const rng = createRandom(WORLD_SEED + 1);
  const noise = new SimplexNoise(rng);
  const dummy = new THREE.Object3D();
  const rockDark = new THREE.Color(COLORS.rockDark);
  const rockLight = new THREE.Color(COLORS.rockLight);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });

  const rocks = new THREE.Group();
  rocks.name = 'rocas';
  const colliders = createColliderGrid();

  for (const group of ROCK_GROUPS) {
    // Cada forma acumula las transformaciones y colores de todas las rocas que la usan.
    const instances = Array.from({ length: SHAPE_COUNT }, () => []);
    let placed = 0;
    let attempts = 0;
    while (placed < group.count && attempts < group.count * 20) {
      attempts++;

      // Punto uniforme dentro de un círculo.
      const angle = rng.random() * Math.PI * 2;
      const distance = Math.sqrt(rng.random()) * group.radius;
      if (distance < group.clearRadius) continue;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;

      // Las rocas se agrupan en manchas en vez de repartirse parejo.
      const density = noise.noise(x / 14, z / 14) * 0.5 + 0.5;
      if (rng.random() > density * density * 1.6) continue;

      // Muchas rocas chicas y pocas grandes.
      const size = group.minSize * (group.maxSize / group.minSize) ** (rng.random() ** 2);
      const height = size * rng.range(0.45, 0.85);

      dummy.scale.set(size * rng.range(0.8, 1.3), height, size * rng.range(0.8, 1.3));
      dummy.rotation.set(rng.range(-0.2, 0.2), rng.random() * Math.PI * 2, rng.range(-0.2, 0.2));
      // Se hunden en el suelo para que no parezcan apoyadas encima ni floten en las pendientes.
      const ground = heightAt(x, z);
      dummy.position.set(x, ground - height * 0.25, z);
      dummy.updateMatrix();

      const color = rockDark.clone().lerp(rockLight, rng.random());
      const shape = Math.floor(rng.random() * SHAPE_COUNT);
      // Sobre las dunas no hay rocas (quedarían flotando en las pendientes). Se descarta DESPUÉS de usar
      // todos sus números aleatorios, así el resto de las rocas queda igual que antes.
      if (duneMask(x, z) > 0.35) {
        placed++;
        continue;
      }
      instances[shape].push({
        matrix: dummy.matrix.clone(),
        color,
        x,
        z,
        ground,
        centerY: dummy.position.y,
        scale: dummy.scale.clone(),
      });
      placed++;
    }

    instances.forEach((allInShape, shapeIndex) => {
      // Piedritas lejanas: a más de ~45 m miden menos de un píxel y la niebla las tapa.
      const list = group.drawRadius
        ? allInShape.filter((rock) => Math.hypot(rock.x, rock.z) < group.drawRadius)
        : allInShape;
      const geometry = createRockShape(noise, shapeIndex, group.detail);
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = `${group.name}-${shapeIndex}`;
      list.forEach(({ matrix, color }, i) => {
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, color);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = group.castShadow;
      mesh.receiveShadow = true;
      rocks.add(mesh);

      if (!group.solid) return;
      const topMap = createTopMap(geometry);
      for (const rock of list) {
        const top = rock.centerY + topMap.maxHeight * rock.scale.y;
        colliders.add({
          x: rock.x,
          z: rock.z,
          radius: Math.max(rock.scale.x, rock.scale.z) * TOP_MAP_EXTENT,
          centerY: rock.centerY,
          matrix: rock.matrix,
          inverse: rock.matrix.clone().invert(),
          topMap,
          tooTall: top - rock.ground > MAX_CLIMB_HEIGHT,
        });
      }
    });
  }

  // group: mallas para la escena.
  // heightAt(x, z): altura de la roca sólida en ese punto (o -Infinity).
  // isObstacle(x, z): true si ahí hay una roca demasiado alta para trepar.
  return { group: rocks, heightAt: colliders.heightAt, isObstacle: colliders.isObstacle };
}
