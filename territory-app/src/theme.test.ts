import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: false,
  nearby: false,
  invoke: vi.fn(() => Promise.resolve()),
  send: vi.fn(),
}));
vi.mock('./native', () => ({
  hasNearby: () => native.nearby,
  nearby: native.send,
  isNative: () => native.available,
  invoke: native.invoke,
}));
vi.mock('@utils/common', async (original) => ({
  ...(await original<object>()),
  getCSSPropertyValue: (key: string) => {
    const theme = globalThis.document?.documentElement?.dataset.theme ?? '';
    if (key === '--accent-main-base')
      return theme.startsWith('green') ? '90, 155, 74' : '80, 101, 208';
    return theme.endsWith('dark') ? '21, 21, 25' : '248, 249, 255';
  },
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
  native.available = false;
  native.nearby = false;
  native.invoke.mockClear();
  native.send.mockClear();
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

describe('native appearance', () => {
  test('updates the desktop window when the user changes themes', async () => {
    native.available = true;
    const theme = await start({ theme_follow_os: 'false' });
    theme.setTheme('dark');
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('plugin:app|set_app_theme', {
        theme: 'dark',
      })
    );
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenLastCalledWith(
        'plugin:window|set_background_color',
        { value: [21, 21, 25] }
      )
    );
    native.invoke.mockClear();
    theme.setTheme('light');
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('plugin:app|set_app_theme', {
        theme: 'light',
      })
    );
  });

  test('restores native system following instead of pinning the resolved theme', async () => {
    native.available = true;
    const theme = await start({ theme_follow_os: 'false' });
    theme.setFollowSystem(true);
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('plugin:app|set_app_theme', {
        theme: null,
      })
    );
  });

  test('propagates accent-only changes to native surfaces', async () => {
    native.nearby = true;
    await start({ theme_follow_os: 'false' });
    native.send.mockClear();
    const { store } = await import('@states/index');
    const { colorSchemeState } = await import('@states/app');
    store.set(colorSchemeState, 'green');
    system.root.dataset.theme = 'green-light';
    await vi.waitFor(() =>
      expect(native.send).toHaveBeenCalledWith('appearance', {
        dark: false,
        followSystem: false,
        background: [248, 249, 255],
        accent: [90, 155, 74],
      })
    );
  });
});
