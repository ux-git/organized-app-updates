import { vi } from 'vitest';

// What the app's modules need from the main app, without its languages,
// database or Dexie-backed state
vi.mock('@services/i18n/index', () => import('./i18n'));
vi.mock('@services/app', () => ({
  determineAppLocale: (language: string) => language,
}));

// Node's own localStorage warns and forgets without a file; a map will do
const items = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, String(value)),
    removeItem: (key: string) => items.delete(key),
    clear: () => items.clear(),
  },
});
