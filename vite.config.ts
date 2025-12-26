import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Wczytaj zmienne z plików .env (dla środowiska lokalnego)
  const env = loadEnv(mode, '.', '');
  
  // CRITICAL FIX: Na Vercel zmienne są w process.env, a loadEnv może ich nie widzieć, jeśli nie ma pliku .env.
  // Sprawdzamy oba źródła.
  const apiKey = env.API_KEY || process.env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // Przekazujemy klucz do aplikacji klienckiej jako string
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            three: ['three'],
            genai: ['@google/genai']
          }
        }
      },
      chunkSizeWarningLimit: 1000
    }
  };
});