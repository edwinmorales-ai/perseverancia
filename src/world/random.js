// Generador pseudoaleatorio con semilla (mulberry32).
// Misma semilla = mismo terreno y mismas rocas en cada carga.
export function createRandom(seed) {
  let state = seed >>> 0;

  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Número aleatorio entre min y max.
  function range(min, max) {
    return min + random() * (max - min);
  }

  return { random, range };
}
