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

/** What Android has to allow before the sync can run by itself. */
export const needsForAutomatic = (status: NearbyStatus): Need[] => {
  const allowed = status.permissions;
  if (!allowed) return [];
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
      text: 'Tells you when a sync is done, or when a paired phone is close but your phones haven’t synced.',
      ok: allowed.notifications,
      label: 'Allow',
      fix: () => nearby('permissions'),
    },
    {
      key: 'battery',
      title: 'Run in the background',
      text: 'Lets Android start the sync by itself, also after a restart, without you opening the app.',
      ok: !!allowed.battery,
      label: 'Allow',
      fix: () => nearby('battery'),
    },
  ];
  if (status.schedule?.mode === 'meetings') {
    needs.push({
      key: 'alarms',
      title: 'Alarms and reminders',
      text: 'Starts looking right on time before each meeting.',
      ok: allowed.exactAlarms,
      label: 'Allow',
      fix: () => nearby('exactAlarms'),
    });
  }
  return needs;
};

export const missingForAutomatic = (status: NearbyStatus) =>
  needsForAutomatic(status).filter((need) => !need.ok);
