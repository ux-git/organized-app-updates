import { defineConfig } from 'vitest/config';
import { UserConfig } from 'vite';
import base from '../vite.config';

// The main app has no unit tests to share a setup with; this takes its path
// aliases and nothing else, so the tests run without a browser or Tauri
export default defineConfig({
  resolve: (base as UserConfig).resolve,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
    setupFiles: ['src/test/setup.ts'],
  },
});
