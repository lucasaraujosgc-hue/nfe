import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, 
    port: 80,   
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Aponta para o Backend C#
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    host: true,
    port: 80,
    allowedHosts: true
  }
});