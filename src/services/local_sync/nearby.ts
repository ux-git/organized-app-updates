import { exportLocalSyncBundle, importLocalSyncBundle } from './index';

/**
 * Bridge to the native shell (the Tauri Android and iOS apps), which pairs
 * devices over Bluetooth, NFC or the local network and moves bundles between
 * them, the way the territories app does. The web app only has to produce
 * and take in bundles; the shell owns pairing, discovery and transport.
 *
 * Shell to page: `window.OrganizedNearby.command(name, json)` with
 *   pair, unpair { id }, peers, syncNow { id? }, settings { automatic }.
 * Page to shell: `window.organizedLocalSync.exportBundle()` and
 *   `importBundle(text)`, which the shell calls around a transfer.
 * Shell events arrive as `organized-nearby` CustomEvents on window with
 *   { kind: 'peers' | 'status' | 'done' | 'failed', ... }.
 */
type NearbyBridge = {
  command: (name: string, args: string) => void;
};

declare global {
  interface Window {
    OrganizedNearby?: NearbyBridge;
    organizedLocalSync?: {
      exportBundle: () => Promise<string>;
      importBundle: (text: string) => Promise<unknown>;
    };
  }
}

export const hasNearby = () => !!window.OrganizedNearby;

export const nearby = (name: string, args: Record<string, unknown> = {}) => {
  window.OrganizedNearby?.command(name, JSON.stringify(args));
};

export const registerLocalSyncBridge = () => {
  window.organizedLocalSync = {
    exportBundle: exportLocalSyncBundle,
    importBundle: importLocalSyncBundle,
  };
};
