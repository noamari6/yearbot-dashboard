import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the Yearbot dashboard.
// Uses the react plugin to enable JSX and fast refresh.
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the dashboard to be served from any origin during development.
    cors: true,
  },
});
