import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Helper to sanitize an API key string (strips quotes, whitespace, and invalid strings)
    const cleanKey = (val?: string | null): string => {
      if (!val || typeof val !== 'string') return '';
      let str = val.trim();
      str = str.replace(/^["'`]+|["'`]+$/g, '').trim();
      str = str.replace(/[\r\n\t]/g, '').trim();
      if (str === 'undefined' || str === 'null' || str === 'false') return '';
      return str;
    };

    // Check all common variable names across system process.env (Render.com) and loadEnv (.env files)
    const resolvedApiKey = cleanKey(
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.VITE_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      env.GEMINI_API_KEY ||
      env.API_KEY ||
      env.VITE_GEMINI_API_KEY ||
      env.VITE_API_KEY ||
      env.GOOGLE_API_KEY ||
      env.VITE_GOOGLE_API_KEY ||
      env.GOOGLE_GENAI_API_KEY
    );

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      envPrefix: ['VITE_', 'GEMINI_', 'API_', 'FIREBASE_', 'GOOGLE_'],
      define: {
        'process.env.API_KEY': JSON.stringify(resolvedApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(resolvedApiKey),
        'process.env.VITE_API_KEY': JSON.stringify(resolvedApiKey),
        'process.env.VITE_GEMINI_API_KEY': JSON.stringify(resolvedApiKey),
        'import.meta.env.VITE_API_KEY': JSON.stringify(resolvedApiKey),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(resolvedApiKey),
        'import.meta.env.API_KEY': JSON.stringify(resolvedApiKey),
        'import.meta.env.GEMINI_API_KEY': JSON.stringify(resolvedApiKey),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
