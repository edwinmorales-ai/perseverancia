import * as THREE from 'three';

// Materiales compartidos por todas las piezas del rover.
// envMap: reflejo del cielo marciano para que los metales no se vean negros.
export function createRoverMaterials(envMap = null) {
  const make = (params) => new THREE.MeshStandardMaterial({ envMap, ...params });

  return {
    // Paneles del chasis, mástil y brazo: blanco ligeramente cálido.
    body: make({ color: 0xe9e5dc, roughness: 0.55, metalness: 0.05 }),
    // Tubos de suspensión (titanio).
    structure: make({ color: 0xc9c7c2, roughness: 0.35, metalness: 0.7 }),
    // Ruedas de aluminio mecanizado.
    aluminum: make({ color: 0xbfbfbf, roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide }),
    // Motores, articulaciones y equipos oscuros.
    dark: make({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.3 }),
    // Aletas del MMRTG y piezas negras.
    black: make({ color: 0x141414, roughness: 0.45, metalness: 0.2 }),
    // Aislante dorado y detalles de cobre.
    gold: make({ color: 0xc9a24b, roughness: 0.3, metalness: 0.9 }),
    // Lentes de cámaras.
    lens: make({ color: 0x0b1020, roughness: 0.08, metalness: 0.6 }),
    // Núcleo de roca extraído por el taladro.
    sample: make({ color: 0x9a5434, roughness: 0.9, metalness: 0 }),
  };
}
