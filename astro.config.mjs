// @ts-check
import { defineConfig } from 'astro/config';

// Sitio 100 % estático: `npm run build` deja todo en dist/, listo para cualquier hosting.
export default defineConfig({
  site: 'https://www.byteservices.net',

  // El HTML ya sale minificado; el CSS se incrusta para evitar una petición
  // que bloquee el render (el sitio tiene una sola hoja global).
  compressHTML: true,
  build: {
    inlineStylesheets: 'always',
  },

  vite: {
    build: {
      // Navegadores modernos: menos transpilación y código más corto.
      target: 'es2022',
      cssCodeSplit: false,
      reportCompressedSize: false,
    },
    esbuild: {
      legalComments: 'none',
      drop: ['debugger'],
    },
  },
});
