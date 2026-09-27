import { useCallback, useEffect, useState } from 'react';
import { hasNearby, invoke, listen, nearby } from '../native';

export type Peer = {
  id: string;
  name: string;
  platform: string;
  paired_at: number;
  last_sync: number | null;
  pending: number;
  /** The phone it was introduced by, when it wasn't paired in person. */
  introduced_by?: string | null;
};

export type SessionStatus = {
  state: 'connecting' | 'confirm' | 'exchanging' | 'done' | 'failed';
  code?: string | null;
  name?: string;
  peer?: string;
  reason?: string;
  sent?: number;
  received?: number;
  items?: Record<string, number>;
  territories?: Touched[];
  sent_territories?: Touched[];
  conflicts?: number;
  introduced?: string[];
  address?: string;
  mode?: number;
};

export type SyncMode = 'always' | 'location' | 'manual';

export type Touched = { id: string; number: string; what: string[] };

export type NearbyStatus = {
  running: boolean;
  bluetooth: boolean;
  meet?: boolean;
  reason?: string;
  until?: number;
  seen?: { address: string; name: string; rssi: number }[];
  exchanges?: SessionStatus[];
  lastDone?: (SessionStatus & { at: number }) | null;
  permissions?: {
    bluetooth: boolean;
    notifications: boolean;
    exactAlarms: boolean;
    location: boolean;
    backgroundLocation: boolean;
    nfc?: boolean;
    nfcOn?: boolean;
    bluetoothOn?: boolean;
    camera?: boolean;
    battery?: boolean;
  };
  /** Only the iPhone plugin says so; Android leaves it out. */
  platform?: 'ios';
  /** The mode in effect, as the phone reads the settings. */
  mode?: SyncMode;
  /** At the Kingdom Hall, as far as the location alert knows. */
  inside?: boolean;
  schedule?: {
    enabled?: boolean;
    mode?: SyncMode;
    /** The mode the switch on the home card turns back on. */
    auto?: 'always' | 'location';
    notify?: boolean;
  };
  hall?: { lat: number; lng: number; radius: number } | null;
};

/**
 * Changes no paired phone has yet. Once one has them, they travel on to the
 * rest of the circle.
 */
export const unsynced = (peers: Peer[]) =>
  peers.length ? Math.min(...peers.map((peer) => peer.pending)) : 0;

/** Paired phones from the store, and Bluetooth state from Android. */
const useNearby = () => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<NearbyStatus>({
    running: false,
    bluetooth: false,
  });
  const [name, setName] = useState('');
  const [removed, setRemoved] = useState(false);

  const refreshPeers = useCallback(async () => {
    setPeers(await invoke<Peer[]>('peers').catch(() => []));
    const me = await invoke<{ name: string; removed?: boolean }>(
      'identity'
    ).catch(() => null);
    if (me) {
      setName(me.name);
      setRemoved(!!me.removed);
    }
  }, []);

  useEffect(() => {
    refreshPeers();
    const stops = [
      listen<NearbyStatus>('nearby', (next) => {
        setStatus((previous) => ({ ...previous, ...next }));
        refreshPeers();
      }),
      listen('store-changed', refreshPeers),
    ];
    window.addEventListener('identity-changed', refreshPeers);
    // asked once listening, or the answer can come before the listener
    Promise.all(stops).then(() => nearby('status'));
    return () => {
      window.removeEventListener('identity-changed', refreshPeers);
      stops.forEach((stop) => stop.then((unlisten) => unlisten()));
    };
  }, [refreshPeers]);

  return {
    peers,
    status,
    name,
    setName,
    /** This device was removed from its group and not paired since. */
    removed,
    refreshPeers,
    android: hasNearby(),
  };
};

export default useNearby;
