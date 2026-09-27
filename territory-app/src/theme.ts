import { atom } from 'jotai';
import { ColorSchemeType } from '@definition/app';
import { appThemeNameState, colorSchemeState } from '@states/app';
import { store } from '@states/index';
import { getCSSPropertyValue } from '@utils/common';
import { hasNearby, nearby } from './native';

// per device, so in localStorage like the main app's theme, not in the synced store
const FOLLOW = 'theme_follow_os';

const dark = matchMedia('(prefers-color-scheme: dark)');

const saved = (key: string, fallback: string) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    try {
      return JSON.parse(value) as string;
    } catch {
      return value;
    }
  } catch {
    return fallback;
  }
};

export const followSystemState = atom(
  String(saved(FOLLOW, 'true')) !== 'false'
);

// Android keeps the activity running through a dark-mode switch, and its
// WebView doesn't always update the media query; the shell tells us instead
let shellDark: boolean | undefined;

const systemTheme = () => ((shellDark ?? dark.matches) ? 'dark' : 'light');

export const setTheme = (theme: string) => {
  store.set(appThemeNameState, theme);
  const root = document.documentElement;
  root.dataset.theme = `${store.get(colorSchemeState)}-${theme}`;
  root.style.colorScheme = theme;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute('content', getCSSPropertyValue('--accent-100'));
  // Android's bars follow theme-color (system_bars.js), an iPhone's don't
  if (hasNearby() && !('OrganizedShell' in window)) {
    nearby('appearance', { dark: theme === 'dark' });
  }
};

export const setFollowSystem = (follow: boolean) => {
  store.set(followSystemState, follow);
  try {
    localStorage.setItem(FOLLOW, String(follow));
  } catch {
    // applies until the app restarts
  }
  if (follow) setTheme(systemTheme());
};

// before the first paint, so a dark theme doesn't start white
export const startTheme = () => {
  store.set(colorSchemeState, saved('color', 'blue') as ColorSchemeType);
  setTheme(
    store.get(followSystemState) ? systemTheme() : saved('theme', 'light')
  );
  const follow = () => {
    if (store.get(followSystemState)) setTheme(systemTheme());
  };
  dark.addEventListener('change', () => {
    shellDark = undefined;
    follow();
  });
  window.__organizedSystemDark = (isDark: boolean) => {
    shellDark = isDark;
    follow();
  };
};

declare global {
  interface Window {
    __organizedSystemDark?: (isDark: boolean) => void;
  }
}
