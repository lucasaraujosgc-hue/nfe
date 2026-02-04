import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all addresses (0.0.0.0)
    port: 80,   // Standard web port
    strictPort: true,
    allowedHosts: true, // Allow all hosts (fixes "Blocked request" on Easypanel)
    watch: {
      usePolling: true // Better docker compatibility
    }
  },
  preview: {
    host: true,
    port: 80,
    allowedHosts: true
  }
});