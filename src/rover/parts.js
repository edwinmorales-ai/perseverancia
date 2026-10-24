import * as THREE from 'three';

// Ayudas para crear piezas: todas proyectan y reciben sombra.

const UP = new THREE.Vector3(0, 1, 0);
const _direction = new THREE.Vector3();

function withShadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function box(width, height, depth, material) {
  return withShadows(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material));
}

// Cilindro con el eje en Y (usar rotateOnAxis o rotation para orientarlo).
export function cylinder(radiusTop, radiusBottom, height, material, segments = 24) {
  return withShadows(
    new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material)
  );
}

// Cilindro con el eje en X (ejes de giro, motores de rueda).
export function cylinderX(radius, length, material, segments = 24) {
  const mesh = cylinder(radius, radius, length, material, segments);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

// Cilindro con el eje en Z (lentes, tubos hacia adelante).
export function cylinderZ(radius, length, material, segments = 24) {
  const mesh = cylinder(radius, radius, length, material, segments);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

// Tubo recto entre dos puntos (vigas de suspensión, varillas).
export function beam(start, end, radius, material) {
  const length = start.distanceTo(end);
  const mesh = cylinder(radius, radius, length, material, 12);
  mesh.userData.baseLength = length;
  placeBeam(mesh, start, end);
  return mesh;
}

// Reubica un tubo creado con beam() para que vaya de start a end (lo estira si cambia el largo).
export function placeBeam(mesh, start, end) {
  _direction.subVectors(end, start);
  const length = _direction.length();
  mesh.position.copy(start).addScaledVector(_direction, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _direction.divideScalar(length));
  mesh.scale.y = length / mesh.userData.baseLength;
}
