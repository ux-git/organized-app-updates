import React from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import mapWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { getCSSPropertyValue } from '@utils/common';
import { store } from '@states/index';
import { territoryLocalModeState } from '@states/territories';
import App from './App';

// maplibre builds its worker's address at runtime, so the bundler never sees
// the file; this bundles the worker and tells maplibre where it went
setWorkerUrl(mapWorker);

// one territory servant, no accounts: the pages leave out requests
store.set(territoryLocalModeState, true);

const saved = (key: string, fallback: string) => {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
};

document.documentElement.setAttribute(
  'data-theme',
  `${saved('color', 'blue')}-${saved('theme', 'light')}`
);
document
  .querySelector("meta[name='theme-color']")
  ?.setAttribute('content', getCSSPropertyValue('--accent-100'));

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
