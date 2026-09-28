import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./native', () => ({ hasNearby: () => false, nearby: vi.fn() }));
vi.mock('@utils/common', async (original) => ({
  ...(await original<object>()),
  getCSSPropertyValue: () => '#fff',
}));

// the system's dark mode, as matchMedia reports it
const system = vi.hoisted(() => {
  const listeners: VoidFunction[] = [];
  const media = {
    matches: false,
    addEventListener: (_: string, listener: VoidFunction) =>
      listeners.push(listener),
  };
  const root = { dataset: {} as Record<string, string>, style: {} };
  Object.assign(globalThis, { window: globalThis, matchMedia: () => media });
  return {
    root,
    document: { documentElement: root, querySelector: () => null },
    set: (dark: boolean) => {
      media.matches = dark;
      listeners.forEach((listener) => listener());
    },
    reset: (dark: boolean) => {
      media.matches = dark;
      listeners.length = 0;
    },
  };
});

const start = async (saved: Record<string, string> = {}, dark = false) => {
  localStorage.clear();
  for (const [key, value] of Object.entries(saved)) {
    localStorage.setItem(key, value);
  }
  system.reset(dark);
  vi.resetModules();
  // MUI takes any document for a browser's, so it comes after the states
  Reflect.deleteProperty(globalThis, 'document');
  const { store } = await import('@states/index');
  const { appThemeNameState } = await import('@states/app');
  Object.assign(globalThis, { document: system.document });
  const theme = await import('./theme');
  theme.startTheme();
  return {
    ...theme,
    current: () => store.get(appThemeNameState),
    following: () => store.get(theme.followSystemState),
  };
};

// the first imports compile the main app's whole state graph, far longer
// than a test may take; the tests' own imports after a reset reuse it
beforeAll(async () => {
  await import('@states/index');
  await import('@states/app');
  await import('./theme');
}, 120_000);

beforeEach(() => {
  delete window.__organizedSystemDark;
});

describe('following the system', () => {
  test('is on by default and starts in the system’s theme', async () => {
    const theme = await start({}, true);
    expect(theme.following()).toBe(true);
    expect(theme.current()).toBe('dark');
    expect(system.root.dataset.theme).toBe('blue-dark');
  });

  test('follows when the system switches', async () => {
    const theme = await start();
    expect(theme.current()).toBe('light');
    system.set(true);
    expect(theme.current()).toBe('dark');
    system.set(false);
    expect(theme.current()).toBe('light');
  });

  test('the shell’s word wins over a stale media query, until it changes', async () => {
    const theme = await start();
    window.__organizedSystemDark?.(true);
    expect(theme.current()).toBe('dark');
    system.set(false);
    expect(theme.current()).toBe('light');
  });

  test('turned off, it stays put and remembers', async () => {
    const theme = await start();
    theme.setFollowSystem(false);
    expect(localStorage.getItem('theme_follow_os')).toBe('false');
    system.set(true);
    window.__organizedSystemDark?.(true);
    expect(theme.current()).toBe('light');
  });

  test('turned back on, it takes the system’s theme at once', async () => {
    const theme = await start({ theme_follow_os: 'false' });
    expect(theme.following()).toBe(false);
    system.set(true);
    expect(theme.current()).toBe('light');
    theme.setFollowSystem(true);
    expect(theme.current()).toBe('dark');
    expect(localStorage.getItem('theme_follow_os')).toBe('true');
  });
});

describe('not following', () => {
  test('starts in the saved theme and colour', async () => {
    const theme = await start(
      { theme_follow_os: 'false', theme: '"dark"', color: '"green"' },
      false
    );
    expect(theme.current()).toBe('dark');
    expect(system.root.dataset.theme).toBe('green-dark');
  });

  test('a theme saved as plain text works too', async () => {
    const theme = await start({ theme_follow_os: 'false', theme: 'dark' });
    expect(theme.current()).toBe('dark');
  });
});
