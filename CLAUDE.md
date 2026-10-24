# CLAUDE.md

Guía para Claude Code en este proyecto. Este archivo también es la **bitácora oficial** del proceso de creación.

## Objetivo del proyecto

Construir una **simulación 3D del rover Perseverance** (misión Mars 2020 de la NASA), el robot que explora el cráter Jezero en Marte desde febrero de 2021.

La idea es modelar el rover y su entorno marciano, y poder verlo e interactuar con él en 3D: moverlo por el terreno, ver funcionar sus partes principales (ruedas, suspensión, brazo robótico, mástil) y explorar la escena.

## Referencia rápida del rover

- **Dimensiones:** ~3 m de largo, ~2.7 m de ancho, ~2.2 m de alto. Masa ~1,025 kg.
- **Movilidad:** 6 ruedas de aluminio (~52.5 cm de diámetro) con suspensión *rocker-bogie*. Velocidad máxima ~4.2 cm/s.
- **Brazo robótico:** ~2.1 m, 5 articulaciones, torreta con taladro de muestras, PIXL, SHERLOC y WATSON.
- **Mástil:** cámaras Mastcam-Z y SuperCam.
- **Energía:** generador de radioisótopos MMRTG en la parte trasera.
- **Otros:** sistema de recolección y almacenamiento de muestras; helicóptero Ingenuity (acompañó la misión).

## Reglas de trabajo para Claude

- Cada avance (decisión, archivo creado, problema encontrado, solución) se registra en la **Bitácora** de abajo, con fecha.
- Las entradas van en orden cronológico, la más reciente al final.
- Las decisiones técnicas importantes (stack, librerías, estructura) se anotan con el *porqué*.
- Mantener este archivo actualizado antes de cerrar cada sesión de trabajo.

## Stack técnico

- **Three.js** — motor 3D en el navegador. Corre sin instalar nada para el usuario final y tiene mucha documentación y ejemplos.
- **Vite** — servidor de desarrollo con recarga instantánea y build para publicar.
- **JavaScript (ES modules)** — sin TypeScript para mantener el proyecto simple y enfocado en el 3D.
- **bun** — gestor de paquetes y ejecutor de scripts (`bun install`, `bun run dev`).
- **lil-gui** — panel de controles para ajustar articulaciones, luces y parámetros mientras desarrollamos.
- **Modelo del rover:** se construye por código con primitivas de Three.js (cajas, cilindros, etc.) organizadas en una jerarquía de piezas, a escala real en metros (1 unidad = 1 m).

Versiones instaladas: `three@0.186.1`, `vite@8.3.5`, `lil-gui@0.21.0`.

## Comandos

- `bun install` — instalar dependencias.
- `bun run dev` — servidor de desarrollo en http://localhost:5173.
- `bun run build` — build de producción en `dist/`.
- `bun run preview` — servir el build localmente.
- `npm run check` — abre la página en un Chrome invisible (el Chrome instalado, vía `playwright-core`, sin descargar navegadores), guarda capturas en `checks/` (escena, nombre al pasar el mouse y una foto por cámara) y lista los errores de consola. Termina en 0 si no hay errores. `npm run check -- --build` revisa el build de producción.
- `node scripts/photos/fetch-candidates.mjs <carpeta>` y `node scripts/photos/vendor.mjs <candidates.json> <seleccion.json>` — bajar candidatas de la API de la NASA y copiar al proyecto las elegidas (ver la bitácora del pedido de fotos).

## Estructura

- `index.html` — página principal y HUD con la ayuda de controles.
- `src/main.js` — arma la escena: cámara, renderer, controles, mundo y bucle de render.
- `src/style.css` — estilos de página y HUD.
- `src/world/config.js` — semilla del mundo, dirección del sol y paleta de colores de Marte.
- `src/world/random.js` — generador pseudoaleatorio con semilla (mismo mundo en cada carga).
- `src/world/terrain.js` — relieve del terreno y `heightAt(x, z)`. La malla se arma en 6×6 bloques con colores y textura de detalle.
- `src/world/rocks.js` — rocas procedurales repartidas con `InstancedMesh`.
- `src/world/sky.js` — cúpula de cielo con shader (degradado + halo azulado + disco solar).
- `src/world/lights.js` — luz ambiente y sol con sombras que siguen al punto de interés.
- `src/world/environment.js` — mapa de entorno (cielo + suelo) para los reflejos de los metales del rover.
- `src/rover/dimensions.js` — medidas y posiciones del rover (ruedas, pivotes, chasis).
- `src/rover/materials.js` — materiales compartidos (paneles, titanio, aluminio, lentes…).
- `src/rover/parts.js` — ayudas para crear cajas, cilindros y tubos entre dos puntos.
- `src/rover/wheel.js` — rueda (llanta, tacos en V, rayos curvos) y su soporte.
- `src/rover/suspension.js` — un lado del rocker-bogie con sus 3 ruedas.
- `src/rover/body.js` — chasis, cubierta, Hazcams, MMRTG, antenas y ejes de los rockers.
- `src/rover/mast.js` — mástil con articulaciones y cabeza de cámaras.
- `src/rover/arm.js` — brazo de 5 articulaciones, torreta y pose de transporte.
- `src/rover/rover.js` — arma el rover completo y devuelve las piezas animables.
- `src/rover/drive.js` — manejo: dirección de las ruedas, avance y giro, giro de las ruedas, choque con rocas altas, apoyo en el relieve y barra diferencial.
- `src/rover/suspensionSolver.js` — calcula rocker, bogie, cabeceo, alabeo y altura del chasis a partir de la altura de cada rueda.
- `src/controls/keyboard.js` — lee el teclado (W/A/S/D, flechas, Q/E, Shift).
- `src/rover/sequence.js` — reproductor de secuencias: lleva articulaciones de un ángulo a otro con arranque y frenado suaves.
- `src/rover/armController.js` — brazo: cinemática inversa del taladro, desplegar, plegar y tomar muestra.
- `src/rover/mastController.js` — mástil: ángulos manuales, mirar a un punto y mirar al frente.
- `src/ui/panel.js` — panel «Instrumentos» (lil-gui): cámara, articulaciones y acciones.
- `src/camera/cameraRig.js` — modos de cámara (orbital, tercera persona y Mastcam-Z), transiciones, mouse y zoom.
- `src/effects/tracks.js` — huellas de las 6 ruedas (cintas pegadas al suelo con el dibujo de los tacos).
- `src/effects/dust.js` — partículas de polvo (ruedas, taladro y rotores de Ingenuity).
- `src/ingenuity/ingenuity.js` — modelo del helicóptero Ingenuity y su vuelo de demostración.
- `src/ui/telemetry.js` — panel de telemetría (abajo a la derecha).
- `src/world/moons.js` — Fobos y Deimos (tamaño exagerado), iluminadas solo por el sol, siguen a la cámara.
- `src/render/postprocessing.js` — post-proceso de película: brillo (bloom), gradación cálida, viñeta y grano. `?nopost` lo desactiva.
- `src/ui/cameraHotspots.js` — puntos brillantes sobre las 4 cámaras que toman fotos reales.
- `src/ui/photoViewer.js` — visor de fotos: obturador, flash, revelado, zoom, ←/→ y Esc.
- `src/photos/photos.json` y `public/photos/` — fotos reales elegidas (copias de 1200 px de la API de la NASA).
- `scripts/check.mjs`, `scripts/photos/*.mjs` — revisión automática y curación de fotos.
- `mapa-del-repo.html` — página explicativa de Open MCT y de cómo conectarle la telemetría de Percy.
- `.claude/launch.json` — configuraciones para abrir en el panel del navegador el servidor de desarrollo (`perseverancia-dev`) y el build de producción (`perseverancia-preview`).
- `vite.config.js` — rutas relativas (`base: './'`) para que el build funcione en cualquier subruta, y dos páginas de entrada (simulación y mapa de Open MCT).
- `.github/workflows/deploy.yml` — compila con bun y publica `dist/` en GitHub Pages en cada push a `main`.
- `README.md` — presentación del repositorio público, enlaces y créditos de las fotos de la NASA.

## Depuración

- En modo desarrollo, `window.perseverancia` expone `scene`, `camera`, `renderer`, `controls`, `heightAt`, `rover`, `drive`, `rocks`, `arm`, `mast`, `cameraRig`, `dust`, `tracks` e `ingenuity` para inspeccionar desde la consola.
- Al avanzar la simulación a mano, conviene hacerlo en una sola ejecución de JavaScript, sin `await`. Si el panel está visible, el bucle real corre entre una ejecución y otra y mezcla los resultados.
- Para medir la GPU se usa la extensión `EXT_disjoint_timer_query_webgl2` (disponible en el panel). La GPU de la Mac cambia de frecuencia, así que las comparaciones se hacen A/B alternando en la misma sesión.
- `cameraRig.setMode('orbital' | 'chase' | 'mastcam')` cambia la cámara. En orbital, OrbitControls solo está activo cuando termina la transición.
- Para probar las animaciones del brazo sin depender del render, se llama a `arm.takeSample()` y luego a `arm.update(1/60)` y `mast.update(1/60)` en un bucle.
- Si el panel del navegador está oculto, `requestAnimationFrame` se pausa y la escena no renderiza. Tomar una captura fuerza el render.
- Para probar el manejo sin depender de la animación, se puede llamar directamente a `drive.update(dt, { throttle, steer, turnInPlace, boost })` en un bucle.
- Para teletransportar el rover se cambia `drive.pose` (x, z, yaw). La cámara se acomoda un cuadro después, porque sigue el desplazamiento del rover.

## Convenciones de la escena

- 1 unidad = 1 metro.
- Eje Y hacia arriba.
- El rover mira hacia **+Z** (igual que `Object3D.lookAt`); su ancho va en el eje X.
- La **izquierda del rover es +X** y la **derecha es −X**. Por ejemplo, el mástil está adelante a la derecha, en x negativa.
- `createRover()` devuelve `{ root, parts }`. Las piezas que se animan son:
  - `parts.suspension.left` / `.right`: `rocker` y `bogie` giran en X; `steering.front` / `.rear` giran en Y; `wheels.*.spin` gira en X al rodar.
  - `parts.differential.bar`: gira en Y. `links` son varillas que hoy están fijas.
  - `parts.mast`: `azimuth` gira en Y y `elevation` en X.
  - `parts.arm`: `joints` (shoulderAzimuth, shoulderElevation, elbow, wrist, turret), `setPose(pose)` y `drill` (`bit` gira en Y, `tip` es la punta y `core` es el núcleo de roca).
  - `parts.cameras`: puntos de referencia `Mastcam_Z_cams`, `NavCams` (cabeza del mástil), `hazcams_front` (barra delantera) y `WATSON` (torreta del brazo).
- En los ángulos internos, `shoulderElevation` y la elevación del mástil son positivos hacia abajo (rotación en X). El panel los muestra invertidos, con «+ arriba».

## Plan de fases

Cada fase termina con algo que se puede ver y probar en el navegador.

- [x] **Fase 0 — Base del proyecto**
  Crear el proyecto con Vite + Three.js, estructura de carpetas y una escena vacía con cámara, luz y `OrbitControls`.
  *Listo cuando:* `bun run dev` abre una escena 3D que se puede rotar con el mouse.

- [x] **Fase 1 — Terreno marciano**
  Suelo con relieve (ruido o mapa de alturas), rocas, cielo y niebla color Marte, luz de sol con sombras.
  *Listo cuando:* se ve un paisaje que parece el cráter Jezero.

- [x] **Fase 2 — Modelo del rover**
  Chasis, 6 ruedas, suspensión *rocker-bogie*, mástil con cabeza de cámaras, brazo robótico plegado, MMRTG atrás. Piezas separadas y jerárquicas para poder animarlas.
  *Listo cuando:* el rover se ve completo, con proporciones reales, parado sobre el terreno.

- [x] **Fase 3 — Movilidad**
  Manejo con teclado (avanzar, retroceder, girar), ruedas que giran, ruedas de las esquinas que se orientan, y suspensión que se adapta al relieve.
  *Listo cuando:* se puede conducir el rover por el terreno y las ruedas siguen el suelo.

- [x] **Fase 4 — Brazo robótico y mástil**
  Articulaciones del brazo (5) y del mástil controlables desde lil-gui, más una animación de "tomar muestra".
  *Listo cuando:* el brazo se despliega, apunta al suelo y vuelve a plegarse.

- [x] **Fase 5 — Cámaras**
  Cambiar entre vista orbital, tercera persona que sigue al rover y vista desde Mastcam-Z.
  *Listo cuando:* las tres vistas funcionan con una tecla o un botón.

- [x] **Fase 6 — Detalles y pulido**
  Huellas de las ruedas, polvo al moverse, panel con telemetría (velocidad, distancia, inclinación), Ingenuity opcional, ajuste de rendimiento.
  *Listo cuando:* la simulación se ve completa y corre fluida.

- [x] **Fase 7 — Publicación**
  Build de producción y publicación en la web.
  *Listo cuando:* hay un enlace público para compartir la simulación.

---

## Bitácora de creación

### 2026-10-24 — Inicio del proyecto
- Se crea la carpeta `perseverancia/` (vacía) y este `CLAUDE.md`.
- Se define el objetivo: simulación 3D del rover Perseverance en Marte.
- Se agrega una ficha de referencia con los datos principales del rover.
- **Siguiente paso:** elegir el stack técnico y planear las fases de construcción (modelo del rover, terreno marciano, controles, animaciones).

### 2026-10-24 — Stack y plan de fases
- **Decisión:** usar Three.js en el navegador. *Por qué:* no requiere instalar nada para ver la simulación, se puede compartir con un enlace y tiene muchos ejemplos.
- **Decisión:** Vite + JavaScript + bun. *Por qué:* arranque rápido, recarga instantánea y sin la complejidad extra de TypeScript.
- **Decisión:** modelar el rover por código con primitivas, a escala real (1 unidad = 1 m). *Por qué:* cada pieza queda separada y lista para animar (ruedas, suspensión, brazo, mástil) sin depender de un modelo externo.
- Se escribe el plan en 8 fases (0 a 7), cada una con su criterio de "listo".
- **Siguiente paso:** Fase 0, crear el proyecto base con Vite + Three.js y una escena vacía navegable.

### 2026-10-24 — Fase 0 completada: base del proyecto
- Se crea el proyecto a mano (`package.json`, `index.html`, `src/main.js`, `src/style.css`, `.gitignore`) en vez de usar el asistente de Vite. *Por qué:* la carpeta ya tenía `CLAUDE.md` y así evitamos archivos de ejemplo que habría que borrar.
- Se instalan `three@0.186.1` y `vite@8.3.5` con bun.
- La escena incluye: cámara en perspectiva, luz hemisférica + luz de sol con sombras activadas, cuadrícula de 1 m, ejes de referencia y `OrbitControls` con amortiguación (sin poder bajar del suelo).
- Se agrega un **volumen de referencia** en alambre naranja con las medidas reales del rover (2.7 × 2.2 × 3.0 m) para validar la escala. Se reemplaza por el modelo en la Fase 2.
- Se fija la convención de ejes: Y arriba, rover mirando hacia +Z.
- **Verificación:** `bun run dev` abre la escena sin errores en consola; arrastrar con el mouse rota la cámara. `bun run build` compila bien.
- **Nota:** el build avisa que el archivo JS pesa más de 500 kB (es Three.js; ~138 kB comprimido). No es un problema ahora; se revisa en la Fase 7.
- **Siguiente paso:** Fase 1, terreno marciano.

### 2026-10-24 — Fase 1 completada: terreno marciano
- **Decisión:** todo el mundo se genera por código con ruido Simplex (addon de Three.js) y una semilla fija (`WORLD_SEED = 2021`). *Por qué:* no depende de archivos externos y siempre sale el mismo paisaje; cambiando la semilla sale otro.
- **Decisión:** el relieve sale de una función `heightAt(x, z)` y no solo de la malla. *Por qué:* la usan las rocas y la cámara para apoyarse en el suelo, y en la Fase 3 la usará la suspensión del rover.
- **Terreno:** 300 × 300 m con un vértice cada 0.5 m. Capas de relieve: lomas suaves, crestas alargadas, montículos y pequeñas irregularidades (~6 cm) para la suspensión. El origen queda a altura 0. Un anillo de colinas redondeadas a ~105 m cierra el horizonte como el borde del cráter Jezero.
- **Color del suelo:** colores por vértice (manchas de polvo claro, suelo más oscuro en pendientes) multiplicados por una textura de detalle de granos y piedritas. La textura se genera en un canvas con ruido 4D para que se repita sin costuras, y también se usa como relieve (`bumpMap`).
- **Rocas:** ~1,900 en tres grupos (piedritas, rocas y bloques de hasta 1.8 m), con 6 formas base deformadas por ruido y `InstancedMesh` para dibujarlas en pocas llamadas. Se agrupan en manchas, hay muchas chicas y pocas grandes, se hunden un poco en el suelo y el centro queda libre de bloques para el rover.
- **Cielo:** esfera con shader propio: degradado caramelo del horizonte al cenit, halo azulado alrededor del sol (como en las fotos reales de Marte) y disco solar. La esfera sigue a la cámara.
- **Niebla y luz:** la niebla usa el mismo color que el horizonte, así el terreno lejano se funde con el cielo. Luz hemisférica cálida, sol a 28° de elevación y tone mapping ACES.
- **Sombras:** mapa de 2048 px que cubre 60 × 60 m y se mueve con el punto que mira la cámara, para mantener buena resolución. Se usa `PCFShadowMap` con `radius` porque `PCFSoftShadowMap` fue eliminado en esta versión de Three.js.
- **Otros cambios:** la cámara no puede bajar del relieve. Se quitaron la cuadrícula y los ejes de la Fase 0. La caja de referencia del rover sigue, ahora en blanco.
- **Ajustes después de probar:**
  - El sol estaba justo detrás de la cámara inicial y la luz se veía plana. Se movió de lado (azimut 120°) y se bajó de 35° a 28° para alargar las sombras.
  - Las colinas del horizonte tenían picos poco realistas y se suavizaron.
  - Las piedritas ahora tienen menos polígonos y no proyectan sombra: se bajó de 2.1 M a 1.7 M triángulos por cuadro.
- **Verificación:** la escena carga sin errores, el halo azulado se ve al mirar hacia el sol, los bloques proyectan sombras largas y el terreno se funde con el cielo en el horizonte. `bun run build` compila.
- **Siguiente paso:** Fase 2, modelo del rover.

### 2026-10-24 — Fase 2 completada: modelo del rover
- **Decisión:** el rover se arma con piezas separadas en una jerarquía de grupos, y cada articulación es un grupo con su pivote en el lugar correcto. *Por qué:* en las Fases 3 y 4 basta con rotar cada grupo para animar ruedas, suspensión, mástil y brazo.
- **Decisión:** todas las medidas viven en `src/rover/dimensions.js`.
  - Oficiales: 3 m × 2.7 m × 2.2 m y ruedas de 52.6 cm de diámetro (dato de la NASA).
  - Estimadas a partir de fotos: distancia entre ejes, posición de los pivotes, alturas y ancho de rueda. No encontramos esos datos publicados.
- **Ruedas:**
  - Tienen llanta de aluminio, 48 tacos en forma de V suave, 6 rayos curvos de titanio, cubo central y motor por el lado interior.
  - Se arma una rueda modelo y se clona. Para el lado derecho se refleja (`scale.x = -1`), así el giro al rodar es igual en ambos lados.
  - Los tacos y los rayos se unen en una sola geometría (`mergeGeometries`) para usar menos llamadas de dibujo.
- **Suspensión rocker-bogie:**
  - El rocker gira sobre un eje a cada lado del chasis y lleva la rueda trasera.
  - El bogie gira en la punta delantera del rocker y lleva las ruedas delantera y media.
  - Las 4 ruedas de las esquinas tienen actuador de dirección.
  - Una barra diferencial sobre la cubierta une ambos rockers con varillas.
  - Esta disposición sale de recordar el diseño de Curiosity y Perseverance; no se confirmó con una fuente oficial.
- **Chasis:**
  - Caja de electrónica blanca, panel inferior dorado y cubierta con equipos.
  - Hazcams adelante y atrás.
  - MMRTG atrás, inclinado 40°, con 8 aletas negras.
  - Antena de alta ganancia hexagonal y antena UHF.
- **Mástil:** está adelante a la derecha, con articulaciones de giro y elevación. La cabeza tiene Mastcam-Z (2 cámaras), Navcams y SuperCam con su ventana circular. Llega a ~2.2 m.
- **Brazo:**
  - Tiene 5 articulaciones (hombro con giro y elevación, codo, muñeca y torreta) y está plegado delante del chasis en pose de transporte.
  - La torreta lleva el taladro, PIXL, SHERLOC/WATSON, GDRT y un sensor.
- **Reflejos:** los materiales del rover usan un mapa de entorno generado con el mismo cielo (`PMREMGenerator`). Sin él, los metales se ven negros.
- **Zona de aterrizaje:** el terreno ahora se aplana en un radio de 5 m alrededor del origen y vuelve al relieve normal a los 17 m. Las irregularidades pequeñas se mantienen para la suspensión.
- **Colocación provisoria:** el rover se apoya en un plano ajustado (mínimos cuadrados) a la altura del suelo bajo sus 6 ruedas, con cabeceo y alabeo, y se sube si alguna rueda queda enterrada. En la Fase 3 lo reemplaza la suspensión rueda por rueda.
- **Ajustes después de probar:**
  - El origen caía en una pendiente y el rover quedaba inclinado 20°. Se agregó la zona de aterrizaje plana y ahora queda a menos de 0.3°.
  - Al principio la altura del rover era el promedio del suelo y las ruedas delanteras quedaban enterradas. Se cambió al ajuste por plano.
  - Algunas herramientas de la torreta atravesaban el frente del chasis. Se repartieron en un arco de ~200° en vez del círculo completo, se giró la torreta −15° y se adelantó el brazo. Ahora la torreta queda fuera del chasis (verificado midiendo su caja envolvente: z mínimo 1.009 m contra el frente en 1.0 m).
- **Otros cambios:** se quitó la caja de referencia de la Fase 0, porque el rover cabe dentro de sus medidas, y se acercó la cámara inicial.
- **Rendimiento:** el rover tiene 145 piezas. La escena completa usa ~323 llamadas de dibujo y 1.76 M triángulos por cuadro (contando sombras).
- **Verificación:** se revisaron vistas de frente, de lado, desde atrás y en 3/4. Tras varias recargas, la consola solo muestra el error viejo de la Fase 1 (del archivo a medio editar), sin errores nuevos. `bun run build` compila.
- **Siguiente paso:** Fase 3, movilidad (manejo con teclado, ruedas que giran, dirección y suspensión sobre el relieve).

### 2026-10-24 — Fase 3 completada: movilidad
- **Controles:**
  - W/S o ↑/↓ para avanzar y retroceder; A/D o ←/→ para girar en arco.
  - Q/E para girar en el lugar (el Perseverance real puede hacerlo) y Shift para ir más rápido.
  - El HUD muestra la ayuda.
- **Decisión:** velocidad de simulación de 0.6 m/s (1.5 m/s con Shift), con aceleración y frenado suaves. *Por qué:* el rover real anda a ~4.2 cm/s y sería demasiado lento para manejarlo.
- **Dirección (Ackermann):**
  - Las ruedas medias no tienen dirección, así que el centro de giro cae sobre la línea de sus ejes.
  - Cada rueda de esquina apunta perpendicular a la línea que la une con ese centro. La rueda interior gira más que la exterior y las traseras giran al revés que las delanteras.
  - El arco más cerrado tiene un radio de 2.2 m.
  - En el giro en el lugar, el centro queda entre las ruedas medias.
  - Los actuadores giran a 70°/s, no al instante.
- **Decisión:** al pasar de manejar en arco a girar en el lugar (o al revés), el rover espera a que las ruedas se orienten. *Por qué:* así lo hace el rover real y evita que las ruedas se arrastren de costado. Al principio también esperaba al soltar A/D y casi se detenía en cada curva. Se corrigió para que solo espere al cambiar de modo.
- **Giro de ruedas:** cada rueda gira según la velocidad de su propio punto de apoyo en la dirección en que apunta. En un giro en el lugar, las ruedas de un lado van hacia adelante y las del otro hacia atrás. En línea recta se verificó que no patinan: 2.19 m recorridos = 1.33 vueltas de una rueda de 52.6 cm.
- **Suspensión sobre el relieve:**
  1. Para cada rueda se mide el suelo en 21 puntos de su huella. El centro de la rueda queda a la altura del punto de apoyo más alto.
  2. `suspensionSolver.js` resuelve primero el bogie, después el rocker y al final el chasis. El cabeceo del chasis es el promedio de los dos rockers, como hace la barra diferencial, y el alabeo sale de la diferencia de altura entre los pivotes.
  3. La altura de cada rueda se suaviza: sube casi al instante (15 ms) para no atravesar el borde de una roca y baja más lento (60 ms) para no "caer" de golpe.
- **Rocas sólidas:** las rocas medianas y los bloques ahora tienen colisión; las piedritas siguen siendo solo decorativas.
  - Primero se aproximaron con una cúpula circular, pero las ruedas atravesaban las rocas alargadas.
  - Ahora se calcula el "techo" real de cada forma: se rasterizan sus triángulos vistos desde arriba en una grilla de 24×24. Al consultar un punto, se pasa a las coordenadas de esa roca, se lee su techo y se vuelve al mundo. Una grilla de 4 m encuentra rápido las rocas cercanas.
  - Generar todas las rocas con sus mapas tarda ~19 ms.
- **Obstáculos:** las rocas de más de 0.5 m sobre el suelo (similar a lo que trepa el rover real) frenan al rover antes de tocarlas. Se puede retroceder. Además, el rover no puede alejarse más de 80 m del origen.
- **Barra diferencial animada:** las palancas de los rockers empujan las puntas de la barra, que gira sobre su eje, y las varillas se reubican y estiran cada cuadro (`placeBeam`).
- **Cámara:** acompaña al rover sumando su desplazamiento, sin cambiar el ángulo elegido con el mouse.
- **Problemas encontrados y cómo se resolvieron:**
  - Las ruedas atravesaban hasta 40 cm las caras de las rocas. Había dos causas:
    - Se suavizaba la pose del chasis, y la rueda quedaba atrasada mientras el rover avanzaba. Ahora se suaviza la altura de cada rueda y se resuelve la pose exacta.
    - Al inclinarse el bogie, la rueda real se corre ~13 cm adelante del punto donde se medía el suelo. Ahora se hacen dos pasadas por cuadro: resolver, medir dónde quedó cada rueda y volver a resolver ahí.
  - El ángulo de bogie y rocker se calculaba con `atan2` sobre la distancia en reposo y daba ~2 cm de error a 20° de inclinación. Se cambió a `asin` con el largo rígido de cada pieza.
- **Verificación:** con pruebas automáticas desde la consola midiendo la penetración del perfil circular de cada rueda contra el suelo y las rocas.

  | Recorrido | Mediana | p95 | Máximo |
  |---|---|---|---|
  | Sobre una roca de 44 cm | −2 mm | 3 mm | 4 cm |
  | Arco por terreno irregular | −2 mm | 2 mm | 4 cm |
  | Marcha atrás | −1 mm | 2 mm | 5 mm |

  - Cada `drive.update` cuesta ~0.08 ms.
  - Se probaron las teclas reales con el panel abierto. W+A dio un giro de +19° y el seguimiento de la cámara fue exacto.
  - `bun run build` compila y no hay errores nuevos en la consola.
- **Siguiente paso:** Fase 4, brazo robótico y mástil.

### 2026-10-24 — Fase 4 completada: brazo robótico y mástil
- **Panel «Instrumentos» (lil-gui, arriba a la derecha):**
  - Brazo: 5 controles deslizantes en grados (hombro giro, hombro elevación, codo, muñeca y torreta) y los botones Tomar muestra, Desplegar y Plegar (transporte), con un contador de muestras.
  - Mástil: giro, elevación y el botón Mirar al frente.
  - Los controles se actualizan solos durante las animaciones (`listen()`). Cada valor del panel es una propiedad con getter/setter que convierte entre grados y radianes. Mover un control a mano cancela la animación en curso.
- **Decisión:** el rover solo se maneja con el brazo plegado. *Por qué:* así opera el rover real, y evita arrastrar el brazo desplegado por el terreno. El HUD avisa «Brazo desplegado: pliégalo para manejar».
- **Decisión:** las teclas no mueven el rover mientras se escribe en un campo del panel.
- **Reproductor de secuencias (`sequence.js`):**
  - Cada paso lleva articulaciones a un ángulo objetivo con arranque y frenado suaves (`smootherstep`).
  - El objetivo puede calcularse justo al empezar el paso: la cinemática inversa usa la posición del rover en ese momento.
  - Cada paso puede tener acciones al empezar, durante y al terminar. Lo usan el brazo y el mástil.
- **Cinemática inversa del taladro:**
  1. El hombro gira hacia el objetivo y el resto del brazo trabaja en un plano vertical.
  2. Con la torreta girada 180°, la broca apunta hacia abajo. La muñeca debe quedar 0.52 m sobre la punta y 0.14 m detrás de ella.
  3. Hombro→codo (con su desplazamiento de 13 cm) y codo→muñeca se resuelven como un brazo de dos tramos con la ley del coseno, con el codo por arriba.
  4. La muñeca compensa para que la broca quede vertical.
  - Las medidas del brazo se movieron a `ARM_GEOMETRY` en `arm.js` para que modelo y cálculo usen los mismos números.
- **Tomar muestra (~15 s):**
  1. Desplegar pasando por una pose intermedia levantada para no chocar con el chasis.
  2. Apuntar a 25 cm sobre el sitio, que está 2.2 m delante del rover y usa la altura del suelo o de la roca. El mástil gira para mirar el sitio.
  3. Apoyar la broca.
  4. Perforar 5 cm mientras la broca acelera, gira y frena. Tiene aletas para que el giro se note.
  5. Dejar en el suelo una marca orientada según la pendiente: un círculo gris de roca limpia con el agujero en el centro.
  6. Levantar mostrando el núcleo de roca rojizo en la punta.
  7. Plegar, guardar la muestra, sumar 1 al contador y volver a mirar al frente.
  - El HUD muestra en naranja qué está haciendo el brazo.
- **Desplegar:** deja la broca 45 cm sobre el sitio de muestra, lista para mover a mano.
- **Mástil:** `lookAt(punto)` calcula giro y elevación desde la articulación de elevación hacia el punto, en coordenadas del mástil (así funciona aunque el rover esté inclinado).
- **Verificación:**
  - Avanzando la animación desde la consola: con la broca apoyada, la punta queda a 0 mm del sitio y totalmente vertical (producto punto con "abajo" = 1.000). Al perforar baja exactamente 5 cm.
  - La secuencia termina plegada, con el contador en 1 y una marca nueva en el suelo.
  - Capturas: brazo bajando con el mástil mirando el sitio, broca dentro del suelo y núcleo de roca visible sobre la marca.
  - `bun run build` compila.
  - En la consola apareció un error en `arm.js` (`Cannot set properties of undefined`) por una recarga en caliente entre dos ediciones. El código actual carga sin errores.
- **Siguiente paso:** Fase 5, cámaras (orbital, tercera persona y vista desde Mastcam-Z).

### 2026-10-24 — Fase 5 completada: cámaras
- **Tres modos, en `src/camera/cameraRig.js`:**
  - **Orbital:** OrbitControls alrededor del rover. Lo acompaña cuando se mueve, sumando su desplazamiento sin cambiar el ángulo elegido con el mouse.
  - **Tercera persona:** 2.8 m arriba y 7 m detrás del rover, mirando un poco por delante. Gira con el rumbo del rover, pero no con su cabeceo ni su alabeo, para que no maree. Sigue con suavizado (0.3 s), así se nota la inercia en las curvas. La rueda del mouse ajusta la distancia entre 4 y 16 m.
  - **Mastcam-Z:** la cámara se ubica en un punto fijo delante de los lentes, en la cabeza del mástil, girado 180° porque las cámaras miran hacia −Z. Así sigue cualquier movimiento del mástil, incluido el `lookAt` automático al tomar una muestra.
- **Controles de Mastcam-Z:**
  - Arrastrar con el mouse mueve el mástil (a la derecha mira a la derecha, abajo mira abajo). Con más zoom, el mismo arrastre mueve menos.
  - La rueda hace zoom con un campo de visión de 26° a 6° (de 1× a ~4.3×). Ese rango es una aproximación del zoom real de Mastcam-Z, no un dato verificado.
  - Se ve una viñeta, una mira central y el rótulo «MASTCAM-Z Zoom N×».
- **Cambio de modo:**
  - Tecla C pasa al siguiente modo; 1, 2 y 3 eligen uno directamente. También hay un selector «Vista» en el panel, en la carpeta Cámara.
  - El HUD muestra la cámara activa.
  - Las teclas se ignoran mientras se escribe en el panel.
- **Transiciones:** al cambiar de modo, la cámara viaja 0.7 s desde donde está: interpola posición, orientación (slerp) y campo de visión. Al volver a orbital, llega a una vista 3/4 del rover y recién entonces se reactiva OrbitControls, para que no "salte".
- **Decisión:** el centro de las sombras sigue al rover en tercera persona y en Mastcam-Z, y al punto que mira la cámara en orbital.
- **Ajuste después de probar:** en Mastcam-Z, durante la toma de muestra, el antebrazo tapaba el sitio porque la línea de vista del mástil pasaba por el brazo. El sitio de muestra se movió a la izquierda (x = +0.35 m, del lado opuesto al mástil). Ahora se ve la torreta y la broca entrando al suelo justo en la mira. La cinemática inversa sigue exacta en el sitio nuevo (0 mm, broca vertical).
- **Reorganización:** el seguimiento de la cámara y el control de altura sobre el suelo pasaron de `main.js` al `cameraRig`. En el bucle, la cámara se actualiza después del rover y del mástil para usar su pose final.
- **Verificación con teclas y mouse reales:**
  - Tecla 2 + manejar: la cámara queda 7.1 m detrás y 2.8 m arriba siguiendo el giro.
  - Tecla C pasa a Mastcam-Z con la mira y el zoom en 1.0×.
  - Arrastrar giró el mástil −35° y −62°, y la rueda dejó el zoom en 1.6×. Los controles del panel se actualizaron solos.
  - Tecla 1 vuelve a orbital: OrbitControls queda activo con campo de visión de 50° y el seguimiento al manejar no se desvía.
  - `bun run build` compila y no hay errores nuevos en la consola.
- **Pendiente para la Fase 6:** con mucho zoom, el suelo se ve borroso de cerca. La textura de detalle tiene ~1.5 cm por píxel.
- **Siguiente paso:** Fase 6, detalles y pulido (huellas, polvo, telemetría, Ingenuity opcional, rendimiento).

### 2026-10-24 — Fase 6 completada: detalles y pulido
- **Rendimiento (medido antes de cambiar nada):**
  - 60 fps y 0.84 ms de CPU por render.
  - ~4 ms de GPU con 1.76 M triángulos y 327 llamadas por cuadro.
  - El terreno era una sola malla de 720 k triángulos que se dibujaba completa dos veces (vista y sombras), aunque solo se viera una parte.
- **Optimización del terreno:**
  - Se dividió en 6×6 bloques de 50 m para que la cámara y las sombras descarten los que no ven.
  - Las alturas, normales y colores se calculan una vez en una grilla común. Las normales salen de diferencias centrales de la altura, así no hay costuras de luz entre bloques.
  - Resultado: 1.76 M → 773 k triángulos por cuadro (−56 %). Crear el terreno bajó de 363 a 215 ms.
  - En una prueba A/B en la misma sesión, la GPU bajó de 6.1 a 5.6 ms (−9 %). En esta Mac el límite es el sombreado de píxeles, no los vértices. En GPUs más débiles el ahorro de triángulos debería pesar más.
- **Piedritas:** las de más de 45 m no se dibujan, porque ahí miden menos de un píxel y la niebla las tapa. Se siguen generando, así el resto del mundo (rocas, bloques y sus posiciones) no cambia.
- **Suelo más nítido** (pendiente de la Fase 5): la textura de detalle pasó de 256 px cada 4 m a 512 px cada 3 m, es decir, de ~15 a ~6 mm por píxel.
- **Huellas:**
  - Cada rueda deja una cinta de tramos de 8 cm pegada al suelo, con el dibujo en V de los tacos y los bordes suaves.
  - Cada rueda guarda hasta 600 tramos (~48 m) en un búfer circular; al llenarse se reemplazan los más viejos.
  - No marca si la rueda está sobre una roca o en el aire.
  - Como las 6 ruedas marcan, en línea recta la huella se oscurece por las pasadas, y en las curvas las ruedas de esquina abren sus propias líneas, como en las fotos reales.
- **Polvo:**
  - Es un sistema de 800 partículas reutilizables con un shader propio: nube redonda de borde suave, tamaño en metros y niebla.
  - Las partículas sienten una fracción de la gravedad de Marte (3.71 m/s²), frenado del aire y una brisa suave.
  - Las ruedas sueltan más polvo cuanto más rápido ruedan. También hay polvo fino al perforar y una nube que levantan los rotores de Ingenuity cerca del suelo.
  - **Ajuste:** con el color del suelo y 28 % de opacidad casi no se veía. Se usó un color más claro (`dustCloud`), 45 % de opacidad y nubes más grandes.
- **Telemetría** (abajo a la derecha, se actualiza 10 veces por segundo):
  - Estado: avanzando, retrocediendo, girando en el lugar, detenido por roca o brazo desplegado.
  - Velocidad, comparada con los 4.2 cm/s del rover real.
  - Recorrido, gracias a un odómetro nuevo en `drive`.
  - Rumbo tipo brújula, cabeceo y alabeo, y posición.
  - Muestras, energía del MMRTG (~110 W, valor aproximado al lanzamiento), estado de Ingenuity y tiempo de misión.
- **Ingenuity:**
  - El modelo tiene medidas aproximadas del real: rotores coaxiales de 1.2 m que giran en sentidos opuestos, cuerpo dorado, 4 patas, mástil y panel solar.
  - Está estacionado detrás del rover a la izquierda.
  - El botón «Volar (ida y vuelta)» del panel hace un vuelo de unos 32 s: enciende los rotores, despega a 5 m, avanza 14 m, sobrevuela, gira, regresa, aterriza y apaga.
  - Se inclina hacia donde avanza (hasta ~15°) y levanta polvo cerca del suelo.
  - Las palas se muestran girando más lento que las reales (~2400 rpm) para que no parpadeen, y se suma un disco translúcido como estela.
  - En el suelo es un obstáculo: el rover no lo puede pisar.
- **Verificación:**
  - Con teclas reales (W + Shift + A): la telemetría marcó 150 cm/s, 6.8 m recorridos y rumbo 262° después de girar ~98° a la izquierda.
  - Desde arriba se ven los pares de huellas curvas con el dibujo de los tacos, y en tercera persona la estela de polvo.
  - El vuelo completo de Ingenuity, simulado desde la consola, sube a ~5.5 m sobre el suelo y se aleja 14 m. Aterriza exactamente en su base (0 cm de error) y suma un vuelo.
  - Al perforar aparecen hasta 38 partículas de polvo.
  - Manejando con 254 partículas de polvo vivas se mantienen 60 fps (cuadro más lento: 17.7 ms).
  - Con todo agregado, la escena usa 778 k triángulos y 383 llamadas por cuadro.
  - `bun run build` compila y no hay errores nuevos en la consola.
- **Siguiente paso:** Fase 7, publicación (build de producción y enlace público).

### 2026-10-24 — Fase 7 (en curso): build de producción listo, publicación pendiente
- **Build de producción:**
  - Se agregó `vite.config.js` con `base: './'`. Antes, el build pedía `/assets/...` desde la raíz del dominio y fallaba en una subruta como `usuario.github.io/perseverancia/`.
  - El aviso de tamaño se resolvió subiendo el límite a 700 kB. *Por qué:* es un solo archivo de ~660 kB (~172 kB comprimido), casi todo Three.js, y dividirlo no reduce lo que descarga esta página única.
  - Total publicable: `dist/` de 656 KB.
- **Página para publicar:**
  - Meta descripción e ícono (un Marte en SVG dentro del HTML).
  - El HUD dice «Simulación 3D en Marte» en vez de «Fase 6».
  - El acceso de depuración `window.perseverancia` no se incluye en producción (solo existe con `import.meta.env.DEV`).
- **Verificación del build:** se sirvió con `vite preview` (configuración `perseverancia-preview`). Carga la escena y el panel, el rover se maneja con teclado (1.1 m recorridos en la prueba) y la consola no muestra errores.
- **Opciones de publicación que se le presentaron al usuario:**
  1. **GitHub Pages** (recomendada): repositorio público `edwinmorales-ai/perseverancia` (nombre libre) con despliegue automático por GitHub Actions. `gh` tiene sesión iniciada con permisos `repo` y `workflow`.
  2. **Página en claude.ai (Artifact):** solo se sube el build. Es privada al principio y el usuario decide compartir el enlace.
- **Pendiente de confirmar con el usuario:**
  - Qué opción usar.
  - Con qué cuenta firmar los commits: el git global usa el correo noreply de `edevelopy` y `gh` tiene sesión como `edwinmorales-ai`.
  - Que el código y este `CLAUDE.md` quedarán públicos si se elige GitHub.
- **Limitación conocida:** en celulares no hay teclado, así que se pueden usar el panel y las cámaras, pero no manejar.

### 2026-10-24 — Antes de publicar: 3 pedidos nuevos (plan aprobado)
- El usuario pidió tres mejoras antes de publicar, y la publicación (Fase 7) quedó en pausa:
  1. Un paisaje "de película".
  2. Que las cámaras del rover muestren fotos reales de Marte.
  3. Un mapa de Open MCT.
- Antes de programar se armó un plan con una investigación de solo lectura:
  - La API de la NASA responde con CORS abierto, pero sus imágenes no traen CORS (se pueden mostrar, no analizar en el navegador).
  - Chrome está instalado y `playwright-core` no descarga navegadores.
  - Además, una revisión del borrador con 3 agentes de solo lectura, uno por pedido, detectó trampas que el plan corrigió:
    - La cámara inicial no veía el cielo.
    - El post-proceso pasa el cielo por ACES y pierde el MSAA.
    - Las Navcam de 1296×976 son recortes, no cuadros completos.
    - El check debía abrir las 4 cámaras, no una.
    - Open MCT no se podía clonar dentro del proyecto.

### 2026-10-24 — Pedido: paisaje de película + `npm run check`
- **Cambio rápido (< 2 min tras aprobar):** solo números, visto en el servidor de desarrollo ya abierto.
  - Sol de tarde: 28° → 13°, luz dorada `0xffcf9a`, intensidad 3 → 4.5 y luz hemisférica 1.1 → 1.25 (compensan que el sol bajo ilumina menos).
  - Sombras más suaves (`radius` 4, `shadow.intensity` 0.85) y `normalBias` 0.06 contra las rayas en el suelo.
  - Cielo más polvoriento y niebla 12/150.
  - Una sola constante `SKY_HORIZON` para el cielo y la niebla, así no se desincronizan.
- **`npm run check` (`scripts/check.mjs`):** se creó después del cambio rápido para cumplir los 2 minutos.
  - Arranca Vite por código (puerto 5199, caché propia), abre el Chrome instalado sin interfaz con `playwright-core` y espera a que la página marque `data-ready` (la pone `main.js` a los 10 cuadros).
  - Guarda capturas y junta errores de consola, errores de página, peticiones fallidas, respuestas ≥ 400 e imágenes inexistentes (Vite responde 200 con HTML cuando falta un archivo).
  - Código de salida: 0 = bien, 1 = la página tiene problemas, 2 = falló la herramienta.
  - Chrome sin interfaz usa la GPU real (ANGLE Metal, Apple M4) y la revisión tarda ~5 s.
- **Ronda 1** (cámara, cielo y lunas):
  - Cámara inicial baja, en (5.5, 1.7, 6.8), también en `cameraRig`, y sol a 190°, casi de frente: el rover queda a contraluz y las sombras largas vienen hacia la cámara.
  - Resplandor cálido amplio alrededor del sol.
  - Lunas en `moons.js`: formas irregulares con las proporciones reales e iluminadas solo por el sol (fase real). **Tamaños exagerados:** Fobos 3.2° y Deimos 1.3° (los reales, ~0.2° y ~0.03°).
  - **Captura:** el sol quedaba detrás del panel lil-gui y las lunas eran trazos finos encima del HUD.
  - **Corrección:** panel cerrado al inicio, lunas más abajo en el cielo libre y la cara oscura apenas visible (licencia de película para que se reconozcan).
- **Ronda 2** (dunas):
  - Campo de dunas dentro de `largeHeight` con `duneMask` exportado: centro (−22, −27), radio 22 m, lejos de la zona de aterrizaje.
  - Diente de sierra a lo largo del viento: barlovento suave y cara de sotavento de ~33°, longitud de onda 18 m, alto ~2.4 m, ondulitas de 2.5 m.
  - Arena basáltica oscura y casi sin irregularidades chicas.
  - Las rocas que caen en las dunas se descartan **después** de consumir sus números aleatorios, así el resto del mundo no cambia.
  - **Captura:** se ven el sol, las dos lunas y las crestas oscuras de las dunas, sin errores.
- **Ronda 3** (look de película, `postprocessing.js`):
  - Cadena: EffectComposer con render target MSAA → bloom (umbral 1.05) → gradación cálida, viñeta y grano → OutputPass.
  - `renderer.info` se reinicia a mano en cada cuadro para seguir contando todas las pasadas, y `?nopost` desactiva el post-proceso.
  - **Captura:** el resplandor del sol y la bruma se ven de película, pero el cuerpo y el panel solar de Ingenuity reflejaban el sol de frente y el bloom lo volvía una mancha.
  - **Corrección:** materiales de Ingenuity mates (el panel real brilla; se anotó la licencia) y menos reflejo del entorno. Se confirmó en la siguiente corrida del check (la del pedido de fotos), sin abrir una cuarta ronda.
- **Resultado:** 3 rondas, 0 errores. La captura muestra dunas, rocas, cielo caramelo con polvo, sol de tarde cálido, sombras largas y suaves, y las dos lunas.

### 2026-10-24 — Pedido 6: las cámaras de Percy toman fotos reales de Marte
- **Puntos brillantes** (`cameraHotspots.js`):
  - Son 4 botones del DOM sobre puntos de referencia del modelo (`parts.cameras`): Mastcam-Z y Navcams en la cabeza del mástil, Hazcams en la barra delantera y WATSON en la torreta.
  - Cada cuadro se proyectan a la pantalla, con un pequeño desplazamiento y una línea guía para que no se encimen.
  - Laten (el pulso va en un hijo para no pisar la posición) y muestran el nombre al pasar el mouse o con el foco del teclado.
  - Si una pieza del rover los tapa se atenúan, pero siguen siendo clicables (raycast cada 6 cuadros).
  - Los del mástil se ocultan en la vista Mastcam-Z.
- **Visor** (`photoViewer.js`):
  - **Al hacer clic:** sonido de obturador sintetizado con WebAudio (sin archivos), dos hojas de obturador y flash blanco (no con `prefers-reduced-motion`).
  - **Revelado:** la foto pasa de oscura, borrosa y gris a nítida, de arriba hacia abajo, en 1.6 s.
  - **Controles:** queda abierta hasta Esc (decidido con el usuario). Clic amplía con zoom CSS desde el punto clicado. ←/→ y los botones ‹ › recorren las fotos de esa cámara.
  - **Rótulo:** «Mastcam-Z derecha · Sol 2012 · hace 7 días · Foto 1 de 5», con la nota, el crédito y el enlace a la NASA.
  - **Mientras está abierto:** el juego se pausa y no se dibuja, y un bloqueo compartido (`isLocked`) deja sin efecto las teclas de manejo y las de cámara (C/1/2/3).
- **Curación de fotos:**
  1. `fetch-candidates.mjs` baja de la API las fotos recientes de cada instrumento con filtros: tamaño completo, sin miniaturas ni recortes, Mastcam-Z con filtro RGB (no el filtro solar ND6) y sin mirar al cielo. Descarta repetidas por reloj de a bordo (pares estéreo) y deja como máximo 2–3 por secuencia.
  2. **Error encontrado:** el plan suponía que el producto `ECM` era el de color. La primera revisión mostró que en Mastcam-Z y WATSON `ECM` es **gris** (R = G = B). Medido con la saturación: `EBY` 73 y 43, `ECM` 0. En Navcam y Hazcam el color se reconoce por la tercera letra del id (`NLF`/`FLF` color; `NLM`/`FLM` gris). Se corrigió el filtro, Navcam y Hazcam se ampliaron a 30 soles porque casi no hay tomas a color en 14, y antes de revisar se descartaron automáticamente las grises.
  3. Revisión visual con un Workflow: un agente por cámara miró todas las candidatas (40 Mastcam-Z, 31 WATSON, 8 Hazcam, 4 Navcam) y otro intentó refutar las elegidas.
  4. Después las miré yo en una hoja de contactos y saqué 2 más: un primer plano del taladro (casi solo metal) y un parche de abrasión repetido.
  5. **Elegidas (11, soles 2004–2017, todas a color):**
     - Mastcam-Z (5): parche de abrasión, huellas de las ruedas, bloques con sombras, hondonada de viento, roca oscura porosa.
     - Navcam (1): llanura rocosa con colina.
     - Hazcam (1): el brazo sobre las rocas.
     - WATSON (4): parche raspado, guijarros, sombras de la torreta, textura moteada.
  6. `vendor.mjs` copia las elegidas en 1200 px a `public/photos/` (1.7 MB). Así la página no depende de que la NASA mantenga sus URL y el check no depende de la red. La "fecha de hoy" de los días se calcula al mirar: el conjunto es fijo (`curatedAt`).
- **`npm run check` ampliado:**
  - Pasa el mouse por NavCams y comprueba que aparece el nombre (`hover.png`).
  - Hace clic real en el centro de cada uno de los **4** puntos, espera el estado `shown` y comprueba que la imagen cargó (`naturalWidth > 0`) y que el rótulo tiene «Sol N» y los días. Guarda `foto-<cámara>.png`.
  - Prueba que → cambia la foto y que Esc cierra.
  - **Resultado:** 4/4 cámaras abren una foto real, 0 errores.

### 2026-10-24 — Pedido: mapa de Open MCT para conectar la telemetría de Percy
- **Clonado:** `git clone --depth 1 --single-branch --branch master --no-tags` en la carpeta temporal de la sesión.
  - Fuera del proyecto: Vite escanearía su HTML, se convertiría en un repo dentro del repo, y su `CLAUDE.md`/`AGENTS.md` (que pide `npm install`) se trató como dato, no como instrucción.
  - No se instaló nada. `git status --porcelain` quedó vacío.
- **Commit analizado:** `e09bfaf47856b2b7ae2ea74334800b26fd27a41e` (master, v4.3.1, 6 oct 2026, John Hill, «[Documentation] Add AGENTS.md contributor guidance (#8379)»).
- **Dos subagentes de solo lectura en paralelo**, cada hallazgo como `ruta:línea — qué hace — texto literal`:
  - Arquitectura: 20 hallazgos. `openmct.js:35` crea el objeto único, `src/MCT.js` arma las APIs, instala 31 plugins de serie desde `:285` y `install(plugin)` es solo `plugin(this)` en `:436`.
  - Viaje del dato: 12 pasos para el historial y 7 para el modo en vivo. Del generador de ejemplo a `PlotSeries.js:228` (pide), `TelemetryAPI.js:495` (busca al proveedor), el worker (nace `{utc, sin}`), `PlotSeries.js:471` (avisa) y `DrawWebGL.js:204` (dibuja).
  - Aviso: en ese repo "Percy" es Percy.io (pruebas visuales), no el rover.
- **Página `mapa-del-repo.html`:**
  - Formato: un solo archivo sin JavaScript, SVG dentro del HTML, modo claro y oscuro, lista equivalente para leer o copiar.
  - Contenido: frase para cualquiera, mini glosario, diagrama de 12 cajas en dos carriles más la franja "en vivo" (cada caja con `archivo:línea` enlazada al permalink del commit), las 5 piezas para conectar a Percy, "Cómo conectamos Percy" en 8 pasos (con un esquema del plugin) y el commit.
  - Aclaración honesta: la NASA no publica la telemetría de ingeniería en vivo. "Percy" es el rover simulado.
- **Comprobaciones** (se volvió a abrir cada archivo del clon):
  - `src/MCT.js:436` → `plugin(this);` dentro de `install(plugin) {` ✓.
  - `src/plugins/plot/configuration/PlotSeries.js:228` → `this.openmct.telemetry.request(...)` ✓.
  - `src/api/telemetry/TelemetryAPI.js:495` → `provider.request(...arguments)`, justo después de buscar el proveedor ✓.
  - Además se barrieron todas las referencias de la página contra el clon. Dos citas usaban solo el nombre del archivo y se cambiaron por la ruta completa.
- **Ajustes visuales:** las rutas largas se partían en las cajas y la tabla se salía en pantallas angostas. Se corrigió y se revisó en el navegador.

### 2026-10-24 — Revisión final de los 3 pedidos
- Un Workflow revisó el código nuevo con dos enfoques: errores de lógica, y rendimiento/teclado/accesibilidad. Otro agente intentó refutar cada hallazgo leyendo el código.
- Resultado: 9 hallazgos, los 9 confirmados (2 repetidos entre enfoques), así que 7 problemas reales. Todos se corrigieron:
  1. **Foto invisible:** si se pasaba de foto antes de que terminara el obturador (o tras un error), la imagen quedaba en opacidad 0. Ahora `show()` la deja visible, y una flecha que queda apretada de manejar no pasa fotos (`event.repeat`). Probado: abrir y pulsar → enseguida muestra «Foto 2 de 5» visible.
  2. **Puntos atrasados:** iban un cuadro detrás de la cámara al moverla, porque `project()` usaba la matriz del cuadro anterior. Ahora se llama a `camera.updateMatrixWorld()` antes de proyectar.
  3. **`vendor.mjs`:** borraba las fotos antes de descargar. Ahora baja todo a memoria y recién después reemplaza. Probado con un id inexistente: falla y las fotos actuales quedan intactas.
  4. **Doble clic en un punto:** abría la foto ya ampliada. El zoom ahora solo responde con la foto mostrada.
  5. **Memoria:** MSAA en los dos render targets del post-proceso y en el canvas (~400 MB de GPU sin uso en una pantalla retina). Solo lo conserva el target donde se dibuja la escena; el canvas lo usa solo con `?nopost`.
  6. **Ayuda del visor:** tapaba el enlace a la NASA en pantallas bajas. Ahora no captura clics y se oculta en pantallas bajas o táctiles.
  7. **Teclas pegadas en macOS:** con Cmd+flecha o Cmd+A una tecla de manejo quedaba apretada, porque macOS no avisa al soltarla con Cmd presionado, y Cmd+C cambiaba la cámara. Ahora se ignoran las teclas con Cmd/Ctrl/Alt y al soltar Cmd se olvidan todas.
- `vite.config.js`: el aviso de tamaño sube a 800 kB, porque el paquete pasó a ~700 kB (~182 kB comprimido) con el post-proceso.
- **Verificación final:** `npm run check` y `npm run check -- --build` terminan en 0. Escena completa, 4/4 cámaras con foto real y ningún error de consola.
- **Siguiente paso:** retomar la Fase 7. El usuario debe elegir dónde publicar (GitHub Pages o página de claude.ai) y con qué cuenta.

### 2026-10-24 — Fase 7 completada: publicación en GitHub Pages
- **Decisión del usuario:** repositorio público `edwinmorales-ai/perseverancia`, despliegue con GitHub Actions y commits firmados con la identidad git ya configurada (Edwin Morales, correo noreply de `edevelopy`).
- **Revisión antes de subir:**
  - Se buscaron claves y tokens en todos los archivos y no apareció ninguno.
  - `.claude/settings.local.json` (permisos locales de Claude Code) se agregó al `.gitignore` y no se subió.
  - Tampoco se suben `node_modules`, `dist` ni `checks`.
- **README.md nuevo:** qué es, enlace al sitio, controles, comandos y créditos de las fotos de la NASA (NASA/JPL-Caltech, Mastcam-Z con ASU).
- **`.github/workflows/deploy.yml`:**
  - En cada push a `main`: checkout, bun 1.3.14, `bun install --frozen-lockfile` y `bun run build`.
  - Sube `dist/` como artefacto de Pages y lo publica con `actions/deploy-pages`.
- **Pasos:**
  1. `git init -b main` y primer commit (`b70deaa`) con 59 archivos.
  2. `gh repo create --public`.
  3. Pages activado en modo "workflow" con la API **antes** del primer push, para que el despliegue no falle.
  4. `git push`.
- **Primer despliegue:** build ✓ y deploy ✓. La simulación y las fotos responden 200, pero `mapa-del-repo.html` daba 404 porque Vite solo compilaba `index.html`. Se agregó como segunda entrada del build (`rolldownOptions.input`) y el README enlaza a la versión publicada.
- **Sitio:** https://edwinmorales-ai.github.io/perseverancia/ · **Repositorio:** https://github.com/edwinmorales-ai/perseverancia
