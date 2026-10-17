import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
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
          },
          '/webhook': {
            target: 'http://localhost:5679',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      publicDir: 'public',
      base: '/',
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.OPENROUTER_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY),
        'process.env.OPENROUTER_MODEL': JSON.stringify(env.OPENROUTER_MODEL || env.VITE_OPENROUTER_MODEL || 'liquid/lfm-2.5-2.6b:free')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
