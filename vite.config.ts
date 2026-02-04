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
        target: 'http://127.0.0.1:5000', // Changed to 127.0.0.1 to avoid IPv6 (::1) resolution issues in Node
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