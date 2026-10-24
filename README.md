# Perseverancia

Simulación 3D del rover Perseverance (Percy) en el cráter Jezero de Marte, hecha con Three.js en el navegador.

**Verla en línea:** https://edwinmorales-ai.github.io/perseverancia/

- Manejo con suspensión rocker-bogie que se adapta a dunas y rocas (W/A/S/D o flechas, Q/E giran en el lugar, Shift acelera).
- Brazo robótico que toma una muestra, mástil con cámaras e Ingenuity que vuela.
- Cámaras orbital, en tercera persona y desde Mastcam-Z (tecla C o 1/2/3).
- Puntos brillantes sobre las cámaras del rover: al hacer clic muestran **fotos reales de Marte**.
- En celulares se pueden usar el panel y las cámaras, pero no manejar (no hay teclado).

## Cómo correrla

```bash
bun install
bun run dev      # http://localhost:5173
npm run check    # revisión automática con Chrome: capturas en checks/ y errores de consola
bun run build    # versión para publicar, en dist/
```

[El mapa de Open MCT](https://edwinmorales-ai.github.io/perseverancia/mapa-del-repo.html) (`mapa-del-repo.html`) explica en lenguaje simple cómo está armado [Open MCT](https://github.com/nasa/openmct) y cómo se le conectaría la telemetría de Percy.

El proceso completo de construcción está registrado, paso a paso, en la bitácora de `CLAUDE.md`.

## Créditos

Las fotos de `public/photos/` son imágenes crudas de Perseverance de la [API de imágenes de la NASA](https://mars.nasa.gov/mars2020/multimedia/raw-images/). Crédito: NASA/JPL-Caltech (Mastcam-Z: NASA/JPL-Caltech/ASU). Cada foto enlaza a su página original.
