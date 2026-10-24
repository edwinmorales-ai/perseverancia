import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona en cualquier carpeta o subruta
  // (por ejemplo usuario.github.io/perseverancia/ o una página de claude.ai).
  base: './',
  build: {
    // Un solo archivo JS de ~700 kB (~182 kB comprimido), casi todo Three.js y sus addons de post-proceso.
    // Dividirlo no reduce lo que descarga esta página única, así que solo se sube el límite del aviso.
    chunkSizeWarningLimit: 800,
    // Dos páginas: la simulación y el mapa de Open MCT (este último es HTML sin JavaScript).
    rolldownOptions: {
      input: {
        main: 'index.html',
        mapa: 'mapa-del-repo.html',
      },
    },
  },
});
