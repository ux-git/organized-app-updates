/**
 * Removes files from `dist/` that only make sense for the web build.
 *
 * Everything in `dist/` is copied into the native app bundle, so store
 * screenshots and PWA install artwork would otherwise be shipped to every
 * phone that installs the app.
 */
import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const WEB_ONLY = [
  // listing screenshots, referenced only from the web app manifest
  'dist/img/screenshot',
  // iOS PWA launch images; the native shell has its own splashscreen
  'dist/img/splashscreen',
  // social preview cards
  'dist/img/open-graph',
  // the native build must not register a service worker
  'dist/service-worker.js',
  'dist/service-worker.js.map',
];

const sizeOf = async (path) => {
  try {
    return (await stat(path)).isDirectory() ? null : (await stat(path)).size;
  } catch {
    return undefined;
  }
};

let removed = 0;

for (const relative of WEB_ONLY) {
  const path = resolve(ROOT, relative);

  if ((await sizeOf(path)) === undefined) continue;

  await rm(path, { recursive: true, force: true });
  removed += 1;
  console.log(`pruned ${relative}`);
}

console.log(`Removed ${removed} web-only path(s) from the native bundle.`);
