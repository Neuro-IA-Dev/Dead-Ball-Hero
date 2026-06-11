import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// CLAUDE.md: peso objetivo < 15 MB, sin backend en MVP, deploy estático.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true, // permite probar en un teléfono real en la misma red
  },
});
