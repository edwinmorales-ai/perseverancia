// Baja de la API de la NASA las fotos crudas recientes de Perseverance que PUEDEN servir,
// para revisarlas a ojo antes de elegir. No toca el proyecto: guarda todo en la carpeta indicada.
//
//   node scripts/photos/fetch-candidates.mjs <carpeta-de-salida> [soles-hacia-atrás=14]
//
// Deja <carpeta>/<camara>/<id>.jpg (versión de 800 px) y <carpeta>/candidates.json con los datos de cada foto.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=100&order=sol+desc';
const MAX_PAGES = 30; // por instrumento, por si hay muchos soles con muchas fotos
const MAX_PER_CAMERA = 40;
const MAX_PER_SEQUENCE = 2; // para que una panorámica no llene todo

const outDir = resolve(process.argv[2] ?? '');
const solsBack = Number(process.argv[3] ?? 14);
if (!process.argv[2]) {
  console.error('Falta la carpeta de salida.');
  process.exit(2);
}

const size = (image) => (image.extended?.dimension ?? '').match(/\d+/g)?.map(Number) ?? [0, 0];
const mastElevation = (image) => Number(image.extended?.mastEl); // NaN si es "UNK"
const fullFrame = (image) => image.extended?.scaleFactor === '4'; // 1280×960 = campo completo; "1" son recortes

// Cómo reconocer una foto EN COLOR (medido con la saturación de las imágenes, no supuesto):
// - Mastcam-Z y WATSON: el producto "EBY" viene en color; su gemelo "ECM" es gris (R = G = B).
// - Navcam y Hazcam: la tercera letra del id es "F" (NLF, FLF) en color y "M" (NLM, FLM) en gris.
const isEbyProduct = (image) => /_\d{3}EBY_/.test(image.imageid);
const isFullColorEngineering = (image) => image.imageid[2] === 'F';

// Qué instrumentos sirven para cada cámara del modelo y qué fotos se aceptan.
const CAMERAS = {
  Mastcam_Z_cams: {
    instruments: ['MCZ_LEFT', 'MCZ_RIGHT'],
    accept: (image) => {
      const [width] = size(image);
      const filter = image.camera.filter_name;
      const elevation = mastElevation(image);
      // L0/R0 RGB = color real (RGB_ND6 es el filtro para mirar el sol).
      return isEbyProduct(image) && (filter === 'ZCAM_L0_RGB' || filter === 'ZCAM_R0_RGB') && width >= 1200 && !(elevation > 10);
    },
  },
  NavCams: {
    instruments: ['NAVCAM_LEFT'],
    perSequence: 3,
    solsBack: 30, // en 14 soles hay muy pocas tomas completas a color
    accept: (image) => {
      const [width, height] = size(image);
      const elevation = mastElevation(image);
      // Hasta +25°: muchas tomas recientes apuntan al horizonte lejano (la revisión descarta las de cielo solo).
      return isFullColorEngineering(image) && fullFrame(image) && width === 1280 && height >= 900 &&
        !(elevation > 25) && !(elevation < -60);
    },
  },
  hazcams_front: {
    instruments: ['FRONT_HAZCAM_LEFT_A'],
    solsBack: 30,
    accept: (image) => {
      const [width, height] = size(image);
      return isFullColorEngineering(image) && fullFrame(image) && width === 1280 && height >= 600;
    },
  },
  WATSON: {
    instruments: ['SHERLOC_WATSON'],
    accept: (image) => isEbyProduct(image) && size(image)[0] >= 1584,
  },
};

async function getJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    await new Promise((done) => setTimeout(done, 1000 * attempt));
  }
  throw new Error(`No respondió: ${url}`);
}

async function latestSol() {
  const data = await getJson(`${API}&page=0`.replace('num=100', 'num=1'));
  return data.images[0].sol;
}

async function candidatesFor(cameraName, config, latest) {
  const { instruments, accept, perSequence: sequenceLimit = MAX_PER_SEQUENCE } = config;
  const minSol = latest - (config.solsBack ?? solsBack);
  const seenClock = new Set();
  const perSequence = new Map();
  const result = [];

  for (const instrument of instruments) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await getJson(`${API}&page=${page}&search=%7C${instrument}%7C`);
      if (!data.images?.length) break;
      for (const image of data.images) {
        if (image.sol < minSol) continue;
        if (!accept(image)) continue;
        // Sin repetidas: pares estéreo y gemelas comparten el reloj de a bordo (sclk).
        const clock = image.extended?.sclk;
        if (seenClock.has(clock)) continue;
        seenClock.add(clock);
        const sequence = image.imageid.match(/[A-Z]{4}\d{5}/)?.[0] ?? image.imageid;
        if ((perSequence.get(sequence) ?? 0) >= sequenceLimit) continue;
        perSequence.set(sequence, (perSequence.get(sequence) ?? 0) + 1);
        result.push({
          camera: cameraName,
          id: image.imageid,
          instrument: image.camera.instrument,
          filter: image.camera.filter_name,
          sol: image.sol,
          takenUtc: image.date_taken_utc.endsWith('Z') ? image.date_taken_utc : `${image.date_taken_utc}Z`,
          size: size(image),
          mastEl: image.extended?.mastEl,
          title: image.title,
          link: image.link,
          credit: image.credit,
          files: image.image_files,
        });
      }
      if (data.images.at(-1).sol < minSol) break;
    }
  }
  // Más recientes primero.
  return result.sort((a, b) => b.takenUtc.localeCompare(a.takenUtc)).slice(0, MAX_PER_CAMERA);
}

async function download(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

const latest = await latestSol();
console.log(`Último sol: ${latest}. Buscando ${solsBack} soles hacia atrás (más en las cámaras que lo indican).`);

const all = [];
for (const [cameraName, config] of Object.entries(CAMERAS)) {
  const list = await candidatesFor(cameraName, config, latest);
  const dir = resolve(outDir, cameraName);
  await mkdir(dir, { recursive: true });
  for (const candidate of list) {
    candidate.preview = resolve(dir, `${candidate.id}.jpg`);
    await download(candidate.files.medium, candidate.preview);
  }
  console.log(`${cameraName}: ${list.length} candidatas`);
  all.push(...list);
}

await writeFile(resolve(outDir, 'candidates.json'), JSON.stringify({ latestSol: latest, candidates: all }, null, 2));
console.log(`Listo: ${resolve(outDir, 'candidates.json')}`);
