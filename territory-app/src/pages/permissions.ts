import { nearby } from '../native';
import { t } from '../i18n';
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
      title: t('common.bluetooth'),
      text: t('common.bluetoothText'),
      ok: allowed.bluetooth && allowed.bluetoothOn !== false,
      label: allowed.bluetooth ? t('common.turnOn') : t('common.allow'),
      fix: () => nearby(allowed.bluetooth ? 'bluetoothOn' : 'permissions'),
    },
    {
      key: 'notifications',
      title: t('common.notifications'),
      text: t('common.notificationsText'),
      ok: allowed.notifications,
      label: t('common.allow'),
      fix: () => nearby('permissions'),
    },
  ];
  const ios = status.platform === 'ios';
  if (!ios) {
    needs.push({
      key: 'battery',
      title: t('common.background'),
      text: t('permissions.backgroundText'),
      ok: !!allowed.battery,
      label: t('common.allow'),
      fix: () => nearby('battery'),
    });
  }
  if (ios && mode === 'always') {
    needs.push({
      key: 'location',
      title: t('common.locationAlways'),
      text: t('permissions.locationIos'),
      ok: allowed.location && allowed.backgroundLocation,
      label: t('common.allow'),
      fix: () => nearby('permissions', { which: 'backgroundLocation' }),
    });
  }
  if (mode === 'location') {
    needs.push({
      key: 'location',
      title: t('common.locationAlways'),
      text: t('permissions.locationHall'),
      ok: allowed.location && allowed.backgroundLocation,
      label: t('common.allow'),
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
