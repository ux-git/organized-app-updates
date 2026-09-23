import { useCallback, useEffect, useState } from 'react';
import { hasNearby, invoke, listen, nearby } from '../native';

export type Peer = {
  id: string;
  name: string;
  platform: string;
  paired_at: number;
  last_sync: number | null;
  pending: number;
};

export type SessionStatus = {
  state: 'connecting' | 'confirm' | 'exchanging' | 'done' | 'failed';
  code?: string | null;
  name?: string;
  peer?: string;
  reason?: string;
  sent?: number;
  received?: number;
  address?: string;
  mode?: number;
};

export type Meeting = { day: number; time: string };

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
  };
  schedule?: {
    enabled?: boolean;
    meetings?: Meeting[];
    before?: number;
    after?: number;
  };
  hall?: { lat: number; lng: number; radius: number } | null;
};

/** Paired phones from the store, and Bluetooth state from Android. */
const useNearby = () => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<NearbyStatus>({
    running: false,
    bluetooth: false,
  });
  const [name, setName] = useState('');

  const refreshPeers = useCallback(async () => {
    setPeers(await invoke<Peer[]>('peers').catch(() => []));
    const me = await invoke<{ name: string }>('identity').catch(() => null);
    if (me) setName(me.name);
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
    nearby('status');
    return () => {
      stops.forEach((stop) => stop.then((unlisten) => unlisten()));
    };
  }, [refreshPeers]);

  return {
    peers,
    status,
    name,
    setName,
    refreshPeers,
    android: hasNearby(),
  };
};

export default useNearby;
