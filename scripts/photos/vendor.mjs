// Copia al proyecto las fotos elegidas (versión de 1200 px) y genera src/photos/photos.json.
//
//   node scripts/photos/vendor.mjs <candidates.json> <seleccion.json>
//
// seleccion.json: { "<camara>": [{ "id": "...", "nota": "texto corto que describe la foto" }, ...], ... }
// en el orden en que se quieren mostrar. Las fotos quedan en public/photos/<camara>/<id>.jpg,
// así la página funciona sin depender de que las direcciones de la NASA sigan iguales.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const [candidatesPath, selectionPath] = process.argv.slice(2);
if (!candidatesPath || !selectionPath) {
  console.error('Uso: node scripts/photos/vendor.mjs <candidates.json> <seleccion.json>');
  process.exit(2);
}

const CAMERA_LABELS = {
  Mastcam_Z_cams: 'Mastcam-Z',
  NavCams: 'NavCams',
  hazcams_front: 'Hazcams delanteras',
  WATSON: 'WATSON',
};
const INSTRUMENT_LABELS = {
  MCZ_LEFT: 'Mastcam-Z izquierda',
  MCZ_RIGHT: 'Mastcam-Z derecha',
  NAVCAM_LEFT: 'NavCam izquierda',
  FRONT_HAZCAM_LEFT_A: 'Hazcam delantera izquierda',
  SHERLOC_WATSON: 'WATSON',
};

const { candidates } = JSON.parse(await readFile(candidatesPath, 'utf8'));
const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

const output = {
  curatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020',
  cameras: {},
};

// 1) Bajar todo a memoria. Si falta un id o falla una descarga, se corta acá sin tocar las fotos actuales.
const downloads = [];
for (const [camera, picks] of Object.entries(selection)) {
  const photos = [];
  for (const { id, nota } of picks) {
    const candidate = byId.get(id);
    if (!candidate) throw new Error(`No está entre las candidatas: ${id}`);
    const response = await fetch(candidate.files.large);
    if (!response.ok) throw new Error(`HTTP ${response.status} al bajar ${candidate.files.large}`);
    downloads.push({ camera, id, data: Buffer.from(await response.arrayBuffer()) });
    photos.push({
      id,
      cameraLabel: INSTRUMENT_LABELS[candidate.instrument] ?? CAMERA_LABELS[camera],
      sol: candidate.sol,
      takenUtc: candidate.takenUtc,
      src: `photos/${camera}/${id}.jpg`,
      fullRes: candidate.files.full_res,
      link: candidate.link,
      credit: candidate.credit,
      nota,
    });
  }
  output.cameras[camera] = { label: CAMERA_LABELS[camera], photos };
  console.log(`${camera}: ${photos.length} fotos`);
}

// 2) Recién ahora reemplazar las fotos del proyecto y el índice.
await rm(resolve(ROOT, 'public/photos'), { recursive: true, force: true });
for (const { camera, id, data } of downloads) {
  const dir = resolve(ROOT, 'public/photos', camera);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, `${id}.jpg`), data);
}
await mkdir(resolve(ROOT, 'src/photos'), { recursive: true });
await writeFile(resolve(ROOT, 'src/photos/photos.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log('Listo: src/photos/photos.json');
