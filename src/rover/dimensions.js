// Medidas del rover en metros, en el sistema del rover:
// origen en el suelo bajo el centro, +Z hacia adelante, +Y arriba, +X hacia la izquierda del rover.
// Las medidas generales son oficiales (3 m × 2.7 m × 2.2 m, ruedas de 52.6 cm);
// las posiciones internas (ejes, pivotes, alturas) son estimadas a partir de fotos.

export const WHEEL_RADIUS = 0.263;
export const WHEEL_WIDTH = 0.36;

// Distancia lateral del centro del rover al centro de cada rueda (y a las vigas de suspensión).
export const WHEEL_X = 1.13;

// Posición Z de cada par de ruedas.
export const WHEEL_Z = { front: 1.05, middle: 0.18, rear: -1.05 };

// Pivotes de la suspensión rocker-bogie (y, z). El rocker gira sobre el chasis y lleva la rueda
// trasera; el bogie gira en la punta delantera del rocker y lleva las ruedas delantera y media.
export const ROCKER_PIVOT = { y: 0.8, z: -0.15 };
export const BOGIE_PIVOT = { y: 0.66, z: 0.62 };

// Altura donde las vigas se unen a cada rueda (encima de la rueda).
export const STEER_TOP_Y = 0.66;
export const MIDDLE_MOUNT_Y = 0.6;

// Caja del chasis (WEB, "warm electronics box").
export const BODY = { halfWidth: 0.78, bottom: 0.62, top: 1.12, front: 1.0, back: -0.75 };
export const DECK_TOP = BODY.top + 0.02;

// Barra diferencial sobre la cubierta: une los dos rockers para que giren en sentidos opuestos.
export const DIFFERENTIAL = { y: DECK_TOP + 0.06, z: 0.15, halfLength: 0.95 };
