import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  base: './',
  server: {
    host: '127.0.0.1',
    strictPort: false,
    headers: {
      'Permissions-Policy': 'camera=(self)',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  preview: {
    host: '127.0.0.1',
    headers: { 'Permissions-Policy': 'camera=(self)' }
  },
  build: { outDir: 'dist' }
}));
