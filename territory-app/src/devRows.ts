import { store } from '@states/index';
import {
  congregationBoundaryState,
  territoriesState,
} from '@states/territories';
import { assemble } from './persistence';
import { isNative } from './native';

// Dev only, in a plain browser: territories exported from a device, served
// by a local file server, so the map can be tried without the app shell.
// Set localStorage "territories-dev-rows" to the rows.json address, and
// optionally "territories-dev-border" to a { "boundary": [...] } file.
export const loadDevRows = async () => {
  if (!import.meta.env.DEV || isNative()) return;
  const rowsUrl = localStorage.getItem('territories-dev-rows');
  if (!rowsUrl) return;
  try {
    const rows = await (await fetch(rowsUrl)).json();
    store.set(
      territoriesState,
      assemble(rows.territories, rows.assignments, rows.do_not_calls)
    );
    const borderUrl = localStorage.getItem('territories-dev-border');
    if (borderUrl) {
      const border = await (await fetch(borderUrl)).json();
      store.set(congregationBoundaryState, border.boundary);
    }
  } catch (error) {
    console.warn('dev rows: not loaded', error);
  }
};
