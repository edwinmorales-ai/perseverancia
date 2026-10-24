// Revisión automática: abre la simulación en un Chrome invisible (el Chrome instalado, sin descargar
// navegadores), guarda capturas en checks/ y lista los errores de consola.
//
//   npm run check             → servidor de desarrollo de Vite
//   npm run check -- --build  → compila y revisa el build de producción
//
// Código de salida: 0 = todo bien, 1 = la página tiene problemas, 2 = falló la herramienta.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer, build, preview } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'checks');
const USE_BUILD = process.argv.includes('--build');
const VIEWPORT = { width: 1440, height: 900 };
const TIMEOUT = { load: 30_000, ready: 60_000, total: 300_000 };

const problems = []; // hacen fallar la revisión
const warnings = []; // se informan, pero no fallan
const shots = [];

// Si algo se cuelga, no esperar para siempre.
const watchdog = setTimeout(() => {
  console.error('✗ La revisión tardó demasiado.');
  process.exit(2);
}, TIMEOUT.total);
watchdog.unref();

async function startServer() {
  if (USE_BUILD) {
    await build({ root: ROOT, logLevel: 'warn' });
    const server = await preview({ root: ROOT, logLevel: 'warn', preview: { host: '127.0.0.1', port: 5198 } });
    return { url: server.resolvedUrls.local[0], close: () => server.close() };
  }
  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    cacheDir: 'node_modules/.vite-check', // caché propia: no choca con el servidor de desarrollo abierto
    server: { host: '127.0.0.1', port: 5199, hmr: false },
  });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

// Escucha todo lo que puede salir mal en la página.
function watchPage(page) {
  page.on('console', (message) => {
    const text = `[consola] ${message.text()}`;
    if (message.type() === 'error') problems.push(text);
    else if (message.type() === 'warning') warnings.push(text);
  });
  page.on('pageerror', (error) => problems.push(`[error de página] ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (reason.includes('ERR_ABORTED')) return; // cambiar la imagen a mitad de carga no es un error
    problems.push(`[petición fallida] ${request.url()} — ${reason}`);
  });
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? '';
    if (response.status() >= 400) problems.push(`[HTTP ${response.status()}] ${response.url()}`);
    // Vite responde 200 con index.html cuando un archivo no existe: una imagen nunca debería ser HTML.
    else if (response.request().resourceType() === 'image' && type.includes('text/html')) {
      problems.push(`[imagen inexistente] ${response.url()}`);
    }
  });
}

const nextFrames = (page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

const CAMERAS = ['Mastcam_Z_cams', 'NavCams', 'hazcams_front', 'WATSON'];
const viewerState = (page) => page.locator('#photo-viewer').getAttribute('data-state');

// Cámaras con fotos reales: nombre al pasar el mouse y, para cada una, clic real en su punto,
// esperar a que la foto termine de revelarse y comprobar que es una imagen de verdad con su rótulo.
async function checkCameras(page) {
  const hotspot = (camera) => page.locator(`.hotspot[data-camera="${camera}"]`);

  await hotspot('NavCams').hover();
  await page.waitForTimeout(300);
  await screenshot(page, 'hover.png');
  const tooltip = await hotspot('NavCams').locator('.hotspot-name').evaluate((element) => getComputedStyle(element).opacity);
  if (Number(tooltip) < 0.9) problems.push('[cámaras] el nombre no aparece al pasar el mouse por NavCams');

  for (const camera of CAMERAS) {
    const box = await hotspot(camera).boundingBox();
    const hiddenSpot = await hotspot(camera).evaluate((element) => element.classList.contains('off'));
    if (!box || hiddenSpot) {
      problems.push(`[cámaras] el punto de ${camera} no se ve en la vista inicial`);
      continue;
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    try {
      await page.waitForFunction(() => document.querySelector('#photo-viewer')?.dataset.state === 'shown', null, { timeout: 30_000 });
    } catch {
      problems.push(`[cámaras] ${camera}: la foto no terminó de mostrarse (estado "${await viewerState(page)}")`);
      await page.keyboard.press('Escape');
      continue;
    }

    const photo = await page.evaluate(() => {
      const image = document.querySelector('#photo-viewer .photo');
      return { loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, src: image.getAttribute('src') };
    });
    const caption = await page.locator('#photo-caption .photo-title').innerText();
    if (!photo.loaded) problems.push(`[cámaras] ${camera}: la imagen no cargó (${photo.src})`);
    if (!/Sol \d+/.test(caption) || !/(hoy|ayer|hace \d+ días)/.test(caption)) {
      problems.push(`[cámaras] ${camera}: al rótulo le falta el sol o los días ("${caption}")`);
    }
    await nextFrames(page);
    await screenshot(page, `foto-${camera}.png`);
    console.log(`  ${camera}: ${caption} — ${photo.width}px`);

    // Flecha derecha: otra foto de la misma cámara (si hay más de una).
    const hasMore = await page.locator('#photo-viewer .photo-next').isVisible();
    if (hasMore) {
      await page.keyboard.press('ArrowRight');
      try {
        await page.waitForFunction(
          (before) => {
            const viewer = document.querySelector('#photo-viewer');
            return viewer.dataset.state === 'shown' && viewer.querySelector('.photo').getAttribute('src') !== before;
          },
          photo.src,
          { timeout: 15_000 }
        );
      } catch {
        problems.push(`[cámaras] ${camera}: la flecha derecha no cambió la foto`);
      }
    }

    await page.keyboard.press('Escape');
    try {
      await page.waitForFunction(() => document.querySelector('#photo-viewer')?.dataset.state === 'closed', null, { timeout: 5_000 });
    } catch {
      problems.push(`[cámaras] ${camera}: Esc no cerró el visor`);
    }
    await page.waitForTimeout(300); // que los puntos vuelvan a ubicarse
  }
}

async function screenshot(page, name) {
  const path = resolve(OUT, name);
  await page.screenshot({ path });
  shots.push(path);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  let server;
  let browser;
  try {
    server = await startServer();
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  } catch (error) {
    console.error(`✗ No se pudo arrancar Vite o Chrome: ${error.message}`);
    await server?.close();
    process.exit(2);
  }

  let gpu = 'desconocido';
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watchPage(page);

    await page.goto(server.url, { waitUntil: 'load', timeout: TIMEOUT.load });
    gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'sin WebGL2';
    });

    try {
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: TIMEOUT.ready });
    } catch {
      problems.push('[escena] la página nunca avisó que estaba lista (¿falló algún módulo?)');
    }
    await page.waitForTimeout(500); // dejar que la cámara y las sombras se asienten
    await nextFrames(page);
    await screenshot(page, 'escena.png');

    console.log('Cámaras con fotos reales:');
    await checkCameras(page);

    await context.close();
  } catch (error) {
    problems.push(`[revisión] ${error.message}`);
  } finally {
    await browser.close();
    await server.close();
  }

  const report = [
    `Página: ${USE_BUILD ? 'build de producción' : 'servidor de desarrollo'}`,
    `GPU de Chrome: ${gpu}`,
    '',
    `Errores (${problems.length}):`,
    ...(problems.length ? problems : ['—']),
    '',
    `Avisos (${warnings.length}):`,
    ...(warnings.length ? warnings : ['—']),
  ].join('\n');
  await writeFile(resolve(OUT, 'consola.txt'), `${report}\n`);

  console.log(report);
  console.log('\nCapturas:');
  for (const shot of shots) console.log(`  ${shot}`);
  console.log(problems.length ? `\n✗ ${problems.length} problema(s).` : '\n✓ Sin errores.');
  process.exit(problems.length ? 1 : 0);
}

main();
