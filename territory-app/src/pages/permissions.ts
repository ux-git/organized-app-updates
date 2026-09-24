import { nearby } from '../native';
import { NearbyStatus } from './useNearby';

export type Need = {
  key: string;
  title: string;
  text: string;
  ok: boolean;
  label: string;
  fix: VoidFunction;
};

/** What Android has to allow for the chosen sync mode. */
export const needsForAutomatic = (status: NearbyStatus): Need[] => {
  const allowed = status.permissions;
  const mode = status.mode ?? 'always';
  if (!allowed || mode === 'manual') return [];
  const needs: Need[] = [
    {
      key: 'bluetooth',
      title: 'Bluetooth',
      text: 'Finds paired phones nearby and syncs with them.',
      ok: allowed.bluetooth && allowed.bluetoothOn !== false,
      label: allowed.bluetooth ? 'Turn on' : 'Allow',
      fix: () => nearby(allowed.bluetooth ? 'bluetoothOn' : 'permissions'),
    },
    {
      key: 'notifications',
      title: 'Notifications',
      text: 'Tells you what a sync brought.',
      ok: allowed.notifications,
      label: 'Allow',
      fix: () => nearby('permissions'),
    },
    {
      key: 'battery',
      title: 'Run in the background',
      text: 'Lets Android start the sync by itself, without you opening the app.',
      ok: !!allowed.battery,
      label: 'Allow',
      fix: () => nearby('battery'),
    },
  ];
  if (mode === 'location') {
    needs.push({
      key: 'location',
      title: 'Location all the time',
      text: 'Notices when you arrive at the Kingdom Hall, with the app closed.',
      ok: allowed.location && allowed.backgroundLocation,
      label: 'Allow',
      fix: () =>
        nearby('permissions', {
          which: allowed.location ? 'backgroundLocation' : 'location',
        }),
    });
  }
  return needs;
};

export const missingForAutomatic = (status: NearbyStatus) =>
  needsForAutomatic(status).filter((need) => !need.ok);
