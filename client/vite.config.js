import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, allowedHosts: ['.trycloudflare.com'], proxy: { '/api': 'http://localhost:4000' } } });
