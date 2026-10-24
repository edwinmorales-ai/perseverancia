import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRandom } from './random.js';
import { WORLD_SEED, SUN_DIRECTION } from './config.js';

// Distancia (m) a la que se dibujan: dentro de la cúpula del cielo (500 m) y del alcance de la cámara.
const DISTANCE = 450;

// Fobos y Deimos. Formas irregulares con sus proporciones reales (Fobos 27×22×18 km, Deimos 15×12×11 km),
// pero tamaños EXAGERADOS para que se vean: desde Marte, Fobos mide ~0.2° y Deimos ~0.03°.
// Ubicadas a la izquierda de la vista inicial, en el cielo libre entre el HUD y las colinas.
const MOONS = [
  { name: 'fobos', azimuth: 236, elevation: 10.5, angularSize: 3.2, proportions: [1, 0.81, 0.67], bumpiness: 0.22 },
  { name: 'deimos', azimuth: 226, elevation: 12.5, angularSize: 1.3, proportions: [1, 0.8, 0.73], bumpiness: 0.12 },
];

const vertexShader = /* glsl */ `
  varying vec3 vNormal;

  void main() {
    // Normal en el mundo (con escala no uniforme hace falta la inversa transpuesta).
    vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 moonColor;
  uniform vec3 darkSideColor;
  varying vec3 vNormal;

  void main() {
    // Solo la luz del sol: la fase sale sola de la posición del sol.
    float lit = max(dot(normalize(vNormal), sunDirection), 0.0);
    float day = smoothstep(0.0, 0.25, lit);
    // La cara oscura se ve apenas más oscura que el cielo (licencia de película: así se reconoce la luna).
    vec3 color = mix(darkSideColor, moonColor * (0.45 + 0.55 * lit), day);
    gl_FragColor = vec4(color, mix(0.22, 1.0, day));
    #include <colorspace_fragment>
  }
`;

function createMoonGeometry(noise, bumpiness, offset) {
  let geometry = new THREE.IcosahedronGeometry(1, 4);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry); // vértices compartidos: superficie suave, no facetada

  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const bump =
      noise.noise3d(vertex.x * 1.2 + offset, vertex.y * 1.2, vertex.z * 1.2) * bumpiness +
      noise.noise3d(vertex.x * 4 + offset, vertex.y * 4, vertex.z * 4) * bumpiness * 0.3;
    vertex.multiplyScalar(1 + bump);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Grupo con las dos lunas. Hay que moverlo con la cámara (como el cielo) para que queden "en el infinito".
export function createMoons() {
  const rng = createRandom(WORLD_SEED + 3);
  const noise = new SimplexNoise(rng);
  const group = new THREE.Group();
  group.name = 'lunas';

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      sunDirection: { value: SUN_DIRECTION },
      moonColor: { value: new THREE.Color(0xf4e6d4) },
      darkSideColor: { value: new THREE.Color(0x5a3b2b) },
    },
    transparent: true,
    depthWrite: false, // las colinas (dibujadas antes) sí las tapan
  });

  MOONS.forEach((moon, index) => {
    const mesh = new THREE.Mesh(createMoonGeometry(noise, moon.bumpiness, index * 31.7), material);
    mesh.name = moon.name;
    mesh.position.setFromSphericalCoords(
      DISTANCE,
      THREE.MathUtils.degToRad(90 - moon.elevation),
      THREE.MathUtils.degToRad(moon.azimuth)
    );
    const radius = DISTANCE * Math.tan(THREE.MathUtils.degToRad(moon.angularSize / 2));
    mesh.scale.set(...moon.proportions.map((p) => p * radius));
    mesh.rotation.set(rng.random() * Math.PI, rng.random() * Math.PI, rng.random() * Math.PI);
    mesh.frustumCulled = false; // el grupo se mueve con la cámara
    group.add(mesh);
  });

  return group;
}
