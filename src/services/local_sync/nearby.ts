import { store } from '@states/index';
import {
  nearbyAutomaticState,
  nearbyAvailableState,
  nearbyInviteState,
  nearbyPeersState,
  nearbyStatusState,
} from '@states/local_sync';
import { NearbyInvite, NearbyPeer, NearbyStatus } from '@definition/local_sync';
import { exportLocalSyncBundle, importLocalSyncBundle } from './index';

/**
 * Bridge to the native shell (the Organized app for Android and iOS), which
 * pairs devices over Bluetooth, NFC or the local network and moves bundles
 * between them, the way the territories app does. The web app produces and
 * takes in bundles and shows the devices; the shell owns pairing, discovery
 * and transport. In a browser the bridge is absent and the UI says so.
 *
 * Page to shell: `window.OrganizedNearby.command(name, json)` with
 *   pair            start pairing with a device in the room (code compare)
 *   invite          show an invite (QR + 6-digit code) for a device to join
 *   join { code }   join an invite by its code, or { text } for a scanned one
 *   tap             pair by NFC tap (Android)
 *   cancel          leave the pairing or sync in progress
 *   unpair { id }, peers, syncNow { id? }, settings { automatic }
 * Shell to page: `window.organizedLocalSync.exportBundle()` and
 *   `importBundle(text)` around a transfer, and `organized-nearby`
 *   CustomEvents on window with { kind, ... }:
 *   peers { peers }, status { ...NearbyStatus }, invite { text, code },
 *   settings { automatic }.
 */
type NearbyBridge = {
  command: (name: string, args: string) => void;
};

type NearbyEvent =
  | ({ kind: 'peers' } & { peers: NearbyPeer[] })
  | ({ kind: 'status' } & NearbyStatus)
  | ({ kind: 'invite' } & NearbyInvite)
  | { kind: 'settings'; automatic: boolean };

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

const handleNearbyEvent = (event: Event) => {
  const detail = (event as CustomEvent<NearbyEvent>).detail;

  if (!detail) return;

  if (detail.kind === 'peers') {
    store.set(nearbyPeersState, detail.peers);
  }

  if (detail.kind === 'status') {
    const { kind: _kind, ...status } = detail;
    store.set(nearbyStatusState, status as NearbyStatus);
  }

  if (detail.kind === 'invite') {
    store.set(nearbyInviteState, { text: detail.text, code: detail.code });
  }

  if (detail.kind === 'settings') {
    store.set(nearbyAutomaticState, detail.automatic);
  }
};

export const registerLocalSyncBridge = () => {
  window.organizedLocalSync = {
    exportBundle: exportLocalSyncBundle,
    importBundle: importLocalSyncBundle,
  };

  window.addEventListener('organized-nearby', handleNearbyEvent);

  store.set(nearbyAvailableState, hasNearby());

  if (hasNearby()) nearby('peers');
};
