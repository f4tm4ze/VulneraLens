import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward /api calls to the Express backend, so the browser never talks to it directly.
    proxy: {
      '/api': 'http://127.0.0.1:5050',
    },
  },
});