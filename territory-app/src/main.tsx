import './language';
import './fileExport';
import './offlineMaps';
import './location';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import mapWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { store } from '@states/index';
import { territoryLocalModeState } from '@states/territories';
import './i18n';
import { startTheme } from './theme';
import App from './App';
import { loadDevRows } from './devRows';

// maplibre builds its worker's address at runtime, so the bundler never sees
// the file; this bundles the worker and tells maplibre where it went
setWorkerUrl(mapWorker);

// one territory servant, no accounts: the pages leave out requests
store.set(territoryLocalModeState, true);

startTheme();
loadDevRows();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
