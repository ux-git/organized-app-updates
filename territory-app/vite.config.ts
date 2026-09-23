import { defineConfig, Plugin, UserConfig } from 'vite';
import { resolve } from 'path';
import base from '../vite.config';

const shared = base as UserConfig;

// The territory pages come from the main app unchanged; only their mock
// data and the signed-in user are swapped for this app's own.
const replacements: [RegExp, string][] = [
  [/features\/territories\/mockData\.ts$/, resolve(__dirname, 'src/data.ts')],
  [/hooks\/useCurrentUser\.tsx?$/, resolve(__dirname, 'src/currentUser.ts')],
];

const replace = (): Plugin => ({
  name: 'territory-app-replace',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (importer?.startsWith(resolve(__dirname, 'src'))) return null;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    if (!resolved) return null;
    const match = replacements.find(([pattern]) => pattern.test(resolved.id));
    return match ? match[1] : null;
  },
});

export default defineConfig({
  ...shared,
  root: __dirname,
  base: './',
  plugins: [replace(), ...(shared.plugins ?? [])],
  server: { port: 4060, host: true, strictPort: true },
  preview: { port: 4060 },
  build: {
    ...shared.build,
    outDir: 'dist',
    emptyOutDir: true,
    // Safari 16 is the newest an iPhone 8 gets
    target: ['safari16', 'chrome100'],
  },
});
