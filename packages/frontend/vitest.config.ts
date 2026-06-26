/** Vitest configuration for the frontend package. Uses Node environment for pure-TS helpers; component tests can opt into jsdom. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
