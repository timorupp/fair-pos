import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Vite dev-server config.
 *
 * `server.watch.usePolling` is necessary when the working tree lives on a
 * Windows mount accessed from WSL2 (`/mnt/c/...`) — chokidar's native FS
 * events never fire across that boundary, so without polling the operator
 * sees no hot-reload after saving a file. Costs a bit of CPU but works.
 */
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
});
