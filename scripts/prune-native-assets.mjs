/**
 * Strips the web-only half of `dist/` before it is packaged.
 *
 * Everything under `dist/` is copied into the app bundle, so anything that
 * only a browser can act on — install prompts, launcher icons the OS already
 * has natively, store artwork — is dead weight on every installed device.
 */
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** Paths removed outright. */
const WEB_ONLY = [
  // listing screenshots, referenced only from the web app manifest
  'dist/img/screenshot',
  // iOS PWA launch images; the native shell has its own splashscreen
  'dist/img/splashscreen',
  // social preview cards
  'dist/img/open-graph',
  // the browser's install prompt has no meaning inside the app
  'dist/pwa-install.js',
  'dist/manifest.webmanifest',
  // no crawler will ever reach the bundled copy
  'dist/robots.txt',
  // the shell always runs scripts
  'dist/noscript',
  // the native build must not register a service worker
  'dist/service-worker.js',
  'dist/service-worker.js.map',
];

/** Home-screen icons; the OS uses the ones in the native project instead. */
const ICON_GLOB = 'dist/img/icon/*.png';

/** Tags in the document that point at the files removed above. */
const DEAD_TAGS = [
  /\s*<link rel="manifest"[^>]*>/g,
  /\s*<script src="\/pwa-install\.js"><\/script>/g,
  /\s*<link rel="apple-touch-icon"[^>]*>/g,
];

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/** Recursive, so a pruned directory reports what it actually cost. */
const bytesOf = async (path) => {
  try {
    const entry = await stat(path);
    if (!entry.isDirectory()) return entry.size;

    let total = 0;
    for await (const child of glob(`${path}/**/*`)) {
      const childEntry = await stat(child);
      if (childEntry.isFile()) total += childEntry.size;
    }
    return total;
  } catch {
    return 0;
  }
};

let removed = 0;
let freed = 0;

for await (const match of glob(resolve(ROOT, ICON_GLOB))) {
  freed += await bytesOf(match);
  await rm(match, { force: true });
  removed += 1;
}

for (const relative of WEB_ONLY) {
  const path = resolve(ROOT, relative);
  if (!(await exists(path))) continue;

  freed += await bytesOf(path);
  await rm(path, { recursive: true, force: true });
  removed += 1;
  console.log(`pruned ${relative}`);
}

// leaving the tags behind would cost a handful of 404s on every cold start
const indexPath = resolve(ROOT, 'dist/index.html');

if (await exists(indexPath)) {
  const before = await readFile(indexPath, 'utf8');
  const after = DEAD_TAGS.reduce((html, tag) => html.replace(tag, ''), before);

  if (after !== before) {
    await writeFile(indexPath, after);
    console.log('rewrote dist/index.html without web-only tags');
  }
}

console.log(
  `Removed ${removed} web-only path(s), ${(freed / 1048576).toFixed(1)} MB.`
);
