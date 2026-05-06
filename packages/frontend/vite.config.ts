import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Proxy API requests to the backend during development
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
