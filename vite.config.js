import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiHandler, historyHandler, startBackground } from './server/parking.js';

// In development draait dezelfde API-handler als middleware in de Vite-server,
// zodat `npm run dev` genoeg is.
const parkingApi = {
  name: 'parking-api',
  configureServer(server) {
    server.middlewares.use('/api/parking', apiHandler);
    server.middlewares.use('/api/history', historyHandler);
    startBackground();
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), parkingApi],
});
