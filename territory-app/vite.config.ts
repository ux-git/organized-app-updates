import { defineConfig, Plugin, UserConfig } from 'vite';
import { resolve } from 'path';
import base from '../vite.config';

const shared = base as UserConfig;

// The territory pages come from the main app unchanged; only their mock
// data and the signed-in user are swapped for this app's own.
const replacements: [RegExp, string][] = [
  [/features\/territories\/mockData\.ts$/, resolve(__dirname, 'src/data.ts')],
  [/hooks\/useCurrentUser\.tsx?$/, resolve(__dirname, 'src/currentUser.ts')],
  [/services\/haptics\/index\.ts$/, resolve(__dirname, 'src/haptics.ts')],
  // no account, server, error reporting or feature flags in this app
  [
    /services\/firebase\/index\.ts$/,
    resolve(__dirname, 'src/offline/firebase.ts'),
  ],
  [
    /services\/firebase\/auth\.ts$/,
    resolve(__dirname, 'src/offline/firebaseAuth.ts'),
  ],
  [
    /hooks\/useFirebaseAuth\.tsx$/,
    resolve(__dirname, 'src/offline/useFirebaseAuth.ts'),
  ],
  [/services\/sentry\/index\.ts$/, resolve(__dirname, 'src/offline/sentry.ts')],
  [
    /services\/worker\/backupWorker\.ts$/,
    resolve(__dirname, 'src/offline/backupWorker.ts'),
  ],
  [
    /wrapper\/feature_flags\/useFeatureFlags\.tsx$/,
    resolve(__dirname, 'src/offline/useFeatureFlags.ts'),
  ],
];

const replace = (): Plugin => ({
  name: 'territory-app-replace',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (importer?.startsWith(resolve(__dirname, 'src/offline'))) return null;
    if (importer === resolve(__dirname, 'src/haptics.ts')) return null;
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
