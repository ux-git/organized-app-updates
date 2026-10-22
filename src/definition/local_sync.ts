export type NearbyPlatform = 'android' | 'ios' | 'mac' | 'windows' | 'web';

export type NearbyPeer = {
  id: string;
  name: string;
  platform: NearbyPlatform;
  paired_at: string;
  last_sync?: string;
  // changes this device holds that the peer has not received yet
  pending: number;
};

export type NearbyStatus =
  | { state: 'idle' }
  | { state: 'connecting'; name?: string }
  // both people compare the code before the devices trust each other
  | { state: 'confirm'; code?: string; name: string }
  | { state: 'exchanging'; name: string }
  | { state: 'done'; name: string; sent: number; received: number }
  | { state: 'failed'; reason: string; name?: string };

// an invite one device shows and another scans or types
export type NearbyInvite = { text: string; code: string };

export type NearbyPairMethod = 'nearby' | 'invite' | 'join' | 'tap';
