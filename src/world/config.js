import * as THREE from 'three';

// Semilla del mundo: cambiarla genera otro terreno y otra distribución de rocas.
export const WORLD_SEED = 2021;

// Posición del sol: elevación sobre el horizonte y ángulo alrededor del eje Y.
const SUN_ELEVATION = THREE.MathUtils.degToRad(13); // sol de tarde: sombras largas y luz dorada
// Casi de frente a la cámara inicial (que mira hacia ~219°): el sol entra en cuadro arriba a la derecha,
// el rover queda a contraluz y las sombras largas vienen hacia la cámara.
const SUN_AZIMUTH = THREE.MathUtils.degToRad(190);

// Dirección (normalizada) desde el suelo hacia el sol.
export const SUN_DIRECTION = new THREE.Vector3().setFromSphericalCoords(
  1,
  Math.PI / 2 - SUN_ELEVATION,
  SUN_AZIMUTH
);

// Color del horizonte: lo comparten el cielo y la niebla para que el terreno lejano se funda con el cielo.
const SKY_HORIZON = 0xdcab7e;

// Paleta de Marte.
export const COLORS = {
  // Cielo: caramelo polvoriento de tarde, con un halo apenas azulado alrededor del sol.
  skyZenith: 0x9a6448,
  skyHorizon: SKY_HORIZON,
  sunHalo: 0xdcd6cf,
  sunGlow: 0xffc27a, // resplandor cálido amplio alrededor del sol (polvo iluminado)
  fog: SKY_HORIZON,
  // Suelo
  soil: 0xa65f3c,
  soilDark: 0x6a3a26,
  dust: 0xc58a60,
  duneSand: 0x4f3428, // arena basáltica oscura de las dunas
  // Nubes de polvo en el aire: más claras que el suelo para que se distingan.
  dustCloud: 0xe3c09c,
  // Rocas (basalto oscuro con polvo encima)
  rockDark: 0x4a372c,
  rockLight: 0x7a5a46,
  // Luces
  sunLight: 0xffcf9a, // dorado de tarde
  skyLight: 0xdcb08a,
  groundLight: 0x6b3a24,
};
