import { atom } from 'jotai';
import { NearbyInvite, NearbyPeer, NearbyStatus } from '@definition/local_sync';

export const nearbyAvailableState = atom(false);

export const nearbyPeersState = atom<NearbyPeer[]>([]);

export const nearbyStatusState = atom<NearbyStatus>({ state: 'idle' });

export const nearbyInviteState = atom<NearbyInvite | undefined>(undefined);

export const nearbyAutomaticState = atom(true);
