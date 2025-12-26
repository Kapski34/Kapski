import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Wczytaj zmienne z plików .env (dla środowiska lokalnego)
  const env = loadEnv(mode, '.', '');
  
  // Sprawdzamy oba źródła (Vercel/System lub plik .env)
  const apiKey = env.API_KEY || process.env.API_KEY;

  // LOGOWANIE DLA UŻYTKOWNIKA PODCZAS BUDOWANIA (npm run build)
  if (!apiKey) {
      console.warn('\x1b[31m%s\x1b[0m', '---------------------------------------------------------');
      console.warn('\x1b[31m%s\x1b[0m', 'UWAGA: Brak klucza API_KEY w zmiennych środowiskowych!');
      console.warn('\x1b[31m%s\x1b[0m', 'Aplikacja na telefonie NIE BĘDZIE działać poprawnie.');
      console.warn('\x1b[33m%s\x1b[0m', 'Rozwiązanie: Stwórz plik .env w głównym folderze i wpisz:');
      console.warn('\x1b[33m%s\x1b[0m', 'API_KEY=twoj_klucz_z_google');
      console.warn('\x1b[31m%s\x1b[0m', '---------------------------------------------------------');
  } else {
      console.log('\x1b[32m%s\x1b[0m', '✓ Wykryto klucz API. Zostanie on dołączony do aplikacji.');
  }

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