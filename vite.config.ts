import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Ładuje zmienne środowiskowe. Ustawienie trzeciego parametru na '' 
  // pozwala załadować wszystkie zmienne, nie tylko te z prefiksem VITE_.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Dzięki temu process.env.API_KEY będzie dostępny w kodzie Reacta,
      // pobierając wartość ze zmiennych środowiskowych Vercel/Systemu.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});