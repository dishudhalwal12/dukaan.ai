import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/events': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      publicDir: 'public',
      base: '/',
      // No `define` block: provider keys used to be injected here and shipped
      // inside the browser bundle. They now live only in .env and are read by
      // the bot (whatsapp/aiProxy.js); the client calls /api/ai/* instead.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
