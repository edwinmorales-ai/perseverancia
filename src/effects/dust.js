import * as THREE from 'three';
import { COLORS } from '../world/config.js';
import { WHEEL_RADIUS } from '../rover/dimensions.js';

// Polvo: partículas que nacen, crecen, se desvanecen y caen despacio (gravedad de Marte, aire muy fino).
const MAX_PARTICLES = 800;
const MARS_GRAVITY = 3.71; // m/s²
const SETTLE = 0.12; // fracción de la gravedad que sienten (el polvo fino flota)
const DRAG = 1.2; // frenado por el aire (1/s)
const WIND = new THREE.Vector3(0.25, 0, 0.1); // brisa suave, m/s
const WHEEL_DUST_RATE = 14; // partículas por segundo por cada m/s de una rueda

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale / -mvPosition.z; // tamaño en metros, se achica con la distancia
    vAlpha = aAlpha;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  #include <fog_pars_fragment>

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.05, d) * vAlpha; // nube redonda de borde suave
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createDust(camera, renderer) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    velocity: new THREE.Vector3(),
    age: 0,
    life: 0, // 0 = libre
    startSize: 0,
    endSize: 0,
    opacity: 0,
  }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(COLORS.dustCloud) }, uScale: { value: 1 } },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'polvo';
  points.frustumCulled = false;

  let cursor = 0; // próxima partícula a reutilizar
  let alive = 0;

  // Crea una partícula. Si no hay libres, reemplaza la más vieja (orden circular).
  function spawn(position, velocity, { life = 1.8, startSize = 0.12, endSize = 0.6, opacity = 0.35 } = {}) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    const particle = particles[i];
    positions.set([position.x, position.y, position.z], i * 3);
    particle.velocity.copy(velocity);
    particle.age = 0;
    particle.life = life;
    particle.startSize = startSize;
    particle.endSize = endSize;
    particle.opacity = opacity;
  }

  const spawnPoint = new THREE.Vector3();
  const spawnVelocity = new THREE.Vector3();
  const random = (min, max) => min + Math.random() * (max - min);

  // Nube que sale de un punto hacia afuera y arriba (perforación, despegue de Ingenuity).
  function burst(point, count, { spread = 0.15, speed = 0.4, up = 0.3, ...options } = {}) {
    for (let n = 0; n < count; n++) {
      const angle = Math.random() * Math.PI * 2;
      spawnPoint.set(point.x + Math.cos(angle) * spread, point.y + 0.02, point.z + Math.sin(angle) * spread);
      spawnVelocity.set(Math.cos(angle) * speed * random(0.5, 1), up * random(0.5, 1), Math.sin(angle) * speed * random(0.5, 1));
      spawn(spawnPoint, spawnVelocity, options);
    }
  }

  // Polvo que levantan las ruedas al rodar: más rápido = más polvo. "Acumula" fracciones entre cuadros.
  const wheelCenter = new THREE.Vector3();
  const wheelForward = new THREE.Vector3();
  const pending = new Map();
  function fromWheels(wheels, dt) {
    for (const wheel of wheels) {
      const amount = (pending.get(wheel) ?? 0) + Math.abs(wheel.rolling) * WHEEL_DUST_RATE * dt;
      const count = Math.floor(amount);
      pending.set(wheel, amount - count);
      if (count === 0) continue;

      wheel.root.getWorldPosition(wheelCenter);
      wheel.root.getWorldDirection(wheelForward); // +Z de la rueda = hacia donde rueda
      const behind = -Math.sign(wheel.rolling);
      for (let n = 0; n < count; n++) {
        spawnPoint
          .copy(wheelCenter)
          .addScaledVector(wheelForward, behind * random(0.1, 0.25))
          .add({ x: random(-0.15, 0.15), y: -WHEEL_RADIUS * 0.8, z: random(-0.15, 0.15) });
        spawnVelocity
          .copy(wheelForward)
          .multiplyScalar(behind * Math.abs(wheel.rolling) * random(0.1, 0.4))
          .add({ x: random(-0.12, 0.12), y: random(0.12, 0.35), z: random(-0.12, 0.12) });
        spawn(spawnPoint, spawnVelocity, { life: random(1.5, 2.8), startSize: 0.15, endSize: 0.9, opacity: 0.45 });
      }
    }
  }

  function update(dt) {
    // Escala para que aSize sea en metros: alto de pantalla / (2·tan(fov/2)).
    material.uniforms.uScale.value =
      renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    alive = 0;
    const damping = Math.exp(-DRAG * dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = particles[i];
      if (particle.life === 0) {
        alphas[i] = 0;
        continue;
      }
      particle.age += dt;
      const t = particle.age / particle.life;
      if (t >= 1) {
        particle.life = 0;
        alphas[i] = 0;
        continue;
      }
      alive++;

      const v = particle.velocity;
      v.multiplyScalar(damping);
      v.y -= MARS_GRAVITY * SETTLE * dt;
      positions[i * 3] += (v.x + WIND.x * t) * dt;
      positions[i * 3 + 1] += v.y * dt;
      positions[i * 3 + 2] += (v.z + WIND.z * t) * dt;

      sizes[i] = particle.startSize + (particle.endSize - particle.startSize) * t;
      // Aparece rápido y se desvanece despacio.
      alphas[i] = particle.opacity * Math.min(1, t * 8) * (1 - t) ** 1.5;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
  }

  return {
    points,
    burst,
    fromWheels,
    update,
    get alive() {
      return alive;
    },
  };
}
