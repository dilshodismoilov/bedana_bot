import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const api = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  root: 'web',
  plugins: [preact()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': api, '/uploads': api },
  },
});
