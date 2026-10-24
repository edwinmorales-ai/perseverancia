import { PHOTO_CAMERAS } from './cameraHotspots.js';

// Visor de fotos reales: obturador + flash al abrir, la foto se revela de a poco y queda grande
// hasta que se cierra con Esc. Clic amplía, ←/→ recorren las fotos de esa cámara.
//
// Estados (atributo data-state, lo usa `npm run check`): closed, shutter, revealing, shown, error.

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const time = (ms) => (REDUCED_MOTION ? 1 : ms);
const ZOOM = 2.2;

// "hoy", "ayer" o "hace N días", contando días de calendario en la hora local de quien mira.
export function daysAgo(takenUtc, now = new Date()) {
  const taken = new Date(takenUtc);
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfDay(now) - startOfDay(taken)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

// Sonido de obturador sin archivos: dos golpes cortos de ruido filtrado y un "thump" grave.
let audio = null;
function playShutterSound() {
  try {
    audio ??= new AudioContext();
    audio.resume();
    const now = audio.currentTime;
    const noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.05), audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    [[0, 3500], [0.07, 1600]].forEach(([delay, frequency]) => {
      const source = audio.createBufferSource();
      source.buffer = noise;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.6, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.04);
      source.connect(filter).connect(gain).connect(audio.destination);
      source.start(now + delay);
    });

    const thump = audio.createOscillator();
    thump.frequency.value = 110;
    const thumpGain = audio.createGain();
    thumpGain.gain.setValueAtTime(0.4, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    thump.connect(thumpGain).connect(audio.destination);
    thump.start(now);
    thump.stop(now + 0.03);
  } catch {
    // Sin audio (navegador sin permiso o sin WebAudio): la foto se muestra igual.
  }
}

// photos: contenido de src/photos/photos.json. onOpenChange(abierto) avisa para bloquear el juego.
export function createPhotoViewer({ photos, baseUrl, onOpenChange }) {
  const root = document.createElement('div');
  root.id = 'photo-viewer';
  root.hidden = true;
  root.dataset.state = 'closed';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'photo-caption');
  root.innerHTML = `
    <div class="photo-stage">
      <figure class="photo-frame">
        <img class="photo" alt="" />
        <div class="photo-blade photo-blade-top"></div>
        <div class="photo-blade photo-blade-bottom"></div>
      </figure>
      <figcaption id="photo-caption" aria-live="polite">
        <strong class="photo-title"></strong>
        <span class="photo-note"></span>
        <a class="photo-link" target="_blank" rel="noopener">Ver en la NASA</a>
      </figcaption>
    </div>
    <button type="button" class="photo-button photo-close" aria-label="Cerrar y volver al juego (Esc)">×</button>
    <button type="button" class="photo-button photo-prev" aria-label="Foto anterior (←)">‹</button>
    <button type="button" class="photo-button photo-next" aria-label="Foto siguiente (→)">›</button>
    <p class="photo-hint">Clic en la foto para ampliar · ← → más fotos de esta cámara · Esc para volver</p>
    <div class="photo-flash"></div>`;
  document.body.append(root);

  const image = root.querySelector('.photo');
  const frame = root.querySelector('.photo-frame');
  const title = root.querySelector('.photo-title');
  const note = root.querySelector('.photo-note');
  const link = root.querySelector('.photo-link');
  const flash = root.querySelector('.photo-flash');
  const blades = [root.querySelector('.photo-blade-top'), root.querySelector('.photo-blade-bottom')];
  const closeButton = root.querySelector('.photo-close');
  const prevButton = root.querySelector('.photo-prev');
  const nextButton = root.querySelector('.photo-next');

  let cameraKey = null;
  let index = 0;
  let opener = null; // botón que abrió el visor, para devolverle el foco al cerrar
  let token = 0; // para ignorar cargas viejas si se cambia de foto rápido

  const list = () => photos.cameras[cameraKey]?.photos ?? [];
  const setState = (state) => (root.dataset.state = state);

  function describe(photo) {
    const camera = photos.cameras[cameraKey];
    const position = list().length > 1 ? ` · Foto ${index + 1} de ${list().length}` : '';
    title.textContent = `${photo.cameraLabel ?? camera.label} · Sol ${photo.sol} · ${daysAgo(photo.takenUtc)}${position}`;
    note.textContent = photo.nota;
    link.href = photo.link;
    link.textContent = `Ver en la NASA · ${photo.credit}`;
    image.alt = photo.nota;
    prevButton.hidden = nextButton.hidden = list().length < 2;
  }

  async function load(photo) {
    image.src = `${baseUrl}${photo.src}`;
    await image.decode();
  }

  function setZoom(zoomed, event) {
    frame.classList.toggle('zoomed', zoomed);
    if (zoomed && event) {
      const box = image.getBoundingClientRect();
      image.style.transformOrigin = `${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`;
    }
    image.style.transform = zoomed ? `scale(${ZOOM})` : '';
  }

  // Abre una cámara: obturador, flash, carga y revelado.
  async function open(key, openerButton) {
    cameraKey = key;
    index = 0;
    opener = openerButton ?? null;
    const myToken = ++token;
    const photo = list()[0];

    root.hidden = false;
    onOpenChange(true);
    setZoom(false);
    image.getAnimations().forEach((animation) => animation.cancel());
    image.style.opacity = '0';
    setState('shutter');
    closeButton.focus();

    if (!photo) {
      title.textContent = `${PHOTO_CAMERAS[key].name}: todavía no hay fotos`;
      note.textContent = '';
      setState('error');
      return;
    }
    describe(photo);

    // Obturador (dos hojas que se cierran y abren) y flash; mientras tanto se descarga la foto.
    playShutterSound();
    const shutter = blades.map((blade, i) =>
      blade.animate(
        [{ transform: `translateY(${i ? 100 : -100}%)` }, { transform: 'translateY(0)' }, { transform: `translateY(${i ? 100 : -100}%)` }],
        { duration: time(220), easing: 'ease-in-out' }
      ).finished
    );
    if (!REDUCED_MOTION) {
      flash.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.12 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
    }

    try {
      await Promise.all([load(photo), ...shutter]);
    } catch {
      if (myToken !== token) return;
      title.textContent = 'No se pudo cargar la foto';
      setState('error');
      return;
    }
    if (myToken !== token) return;

    // Revelado: de oscura, borrosa y sin color a nítida, de arriba hacia abajo, como si llegara de Marte.
    setState('revealing');
    image.style.opacity = '1';
    await image.animate(
      [
        { filter: 'brightness(0.05) blur(18px) saturate(0)', clipPath: 'inset(0 0 100% 0)' },
        { filter: 'brightness(1) blur(0) saturate(1)', clipPath: 'inset(0 0 0% 0)' },
      ],
      { duration: time(1600), easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
    ).finished.catch(() => {});
    if (myToken === token) setState('shown');
  }

  // Otra foto de la misma cámara, con un fundido corto (sin flash).
  async function show(step) {
    if (root.hidden || list().length < 2) return;
    index = (index + step + list().length) % list().length;
    const photo = list()[index];
    const myToken = ++token;
    setZoom(false);
    describe(photo);
    setState('revealing');
    await image.animate([{ opacity: 1 }, { opacity: 0 }], { duration: time(120), fill: 'forwards' }).finished;
    try {
      await load(photo);
    } catch {
      if (myToken === token) setState('error');
      return;
    }
    if (myToken !== token) return;
    image.getAnimations().forEach((animation) => animation.cancel());
    // Por si se cambió de foto antes de que terminara el obturador o tras un error (la foto seguía en opacidad 0).
    image.style.opacity = '1';
    await image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: time(250) }).finished.catch(() => {});
    if (myToken === token) setState('shown');
  }

  function close() {
    if (root.hidden) return;
    token++;
    setZoom(false);
    root.hidden = true;
    setState('closed');
    onOpenChange(false);
    opener?.focus();
  }

  // Solo con la foto ya mostrada: así un doble clic en el punto no la abre ampliada.
  image.addEventListener('click', (event) => {
    if (root.dataset.state !== 'shown') return;
    setZoom(!frame.classList.contains('zoomed'), event);
  });
  closeButton.addEventListener('click', close);
  prevButton.addEventListener('click', () => show(-1));
  nextButton.addEventListener('click', () => show(1));

  window.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') close();
    // Una flecha que quedó apretada de manejar repite sola: no debe pasar fotos.
    else if (event.key === 'ArrowRight') !event.repeat && show(1);
    else if (event.key === 'ArrowLeft') !event.repeat && show(-1);
    else if (event.key === 'Tab') {
      // El foco no sale del visor mientras está abierto.
      const focusable = [...root.querySelectorAll('button:not([hidden]), a[href]')];
      const position = focusable.indexOf(document.activeElement);
      const next = (position + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next]?.focus();
    } else return;
    event.preventDefault();
  });

  return {
    open,
    close,
    get isOpen() {
      return !root.hidden;
    },
  };
}
