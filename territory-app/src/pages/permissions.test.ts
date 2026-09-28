import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nearby } from '../native';
import { missingForAutomatic, needsForAutomatic } from './permissions';
import { NearbyStatus } from './useNearby';

vi.mock('../native', () => ({ nearby: vi.fn() }));

type Permissions = NonNullable<NearbyStatus['permissions']>;

const allowed: Permissions = {
  bluetooth: true,
  bluetoothOn: true,
  notifications: true,
  exactAlarms: true,
  location: true,
  backgroundLocation: true,
  battery: true,
};

const status = (
  permissions: Partial<Permissions> | undefined,
  more: Partial<NearbyStatus> = {}
): NearbyStatus => ({
  running: false,
  bluetooth: true,
  permissions: permissions && { ...allowed, ...permissions },
  ...more,
});

const keys = (s: NearbyStatus) => needsForAutomatic(s).map((need) => need.key);

beforeEach(() => vi.mocked(nearby).mockClear());

describe('needsForAutomatic', () => {
  test('nothing before the device answers, or when syncing by hand', () => {
    expect(needsForAutomatic(status(undefined))).toEqual([]);
    expect(needsForAutomatic(status({}, { mode: 'manual' }))).toEqual([]);
  });

  test('Android, always: Bluetooth, notifications, background', () => {
    expect(keys(status({}))).toEqual(['bluetooth', 'notifications', 'battery']);
    expect(keys(status({}, { mode: 'always' }))).toEqual([
      'bluetooth',
      'notifications',
      'battery',
    ]);
  });

  test('iPhone, always: location instead of the battery', () => {
    expect(keys(status({}, { platform: 'ios' }))).toEqual([
      'bluetooth',
      'notifications',
      'location',
    ]);
  });

  test('at the Kingdom Hall: location on either', () => {
    expect(keys(status({}, { mode: 'location' }))).toEqual([
      'bluetooth',
      'notifications',
      'battery',
      'location',
    ]);
    expect(keys(status({}, { mode: 'location', platform: 'ios' }))).toEqual([
      'bluetooth',
      'notifications',
      'location',
    ]);
  });

  test('exact alarms, once a scheduled burst couldn’t start without them', () => {
    expect(keys(status({ exactAlarmsNeeded: true }))).toEqual([
      'bluetooth',
      'notifications',
      'battery',
      'exactAlarms',
    ]);
    expect(
      keys(status({ exactAlarmsNeeded: true }, { mode: 'manual' }))
    ).toEqual([]);
    missingForAutomatic(status({ exactAlarmsNeeded: true }))[0].fix();
    expect(vi.mocked(nearby)).toHaveBeenCalledWith('exactAlarms');
  });

  test('Bluetooth needs both the permission and the switch', () => {
    const bluetooth = (permissions: Partial<Permissions>) =>
      needsForAutomatic(status(permissions))[0];
    expect(bluetooth({}).ok).toBe(true);
    expect(bluetooth({ bluetoothOn: undefined }).ok).toBe(true);
    expect(bluetooth({ bluetoothOn: false }).ok).toBe(false);
    expect(bluetooth({ bluetooth: false }).ok).toBe(false);
  });

  test('each fix asks Android for the right thing', () => {
    const fix = (key: string, s: NearbyStatus) =>
      needsForAutomatic(s)
        .find((need) => need.key === key)!
        .fix();

    fix('bluetooth', status({ bluetooth: false }));
    fix('bluetooth', status({ bluetoothOn: false }));
    fix('battery', status({ battery: false }));
    fix('location', status({ location: false }, { mode: 'location' }));
    fix(
      'location',
      status({ backgroundLocation: false }, { mode: 'location' })
    );
    fix('location', status({}, { platform: 'ios' }));

    expect(vi.mocked(nearby).mock.calls).toEqual([
      ['permissions'],
      ['bluetoothOn'],
      ['battery'],
      ['permissions', { which: 'location' }],
      ['permissions', { which: 'backgroundLocation' }],
      ['permissions', { which: 'backgroundLocation' }],
    ]);
  });
});

describe('missingForAutomatic', () => {
  test('only what is not allowed yet', () => {
    expect(missingForAutomatic(status({}))).toEqual([]);
    expect(
      missingForAutomatic(status({ notifications: false, battery: false })).map(
        (need) => need.key
      )
    ).toEqual(['notifications', 'battery']);
    expect(
      missingForAutomatic(
        status({ backgroundLocation: false }, { mode: 'location' })
      ).map((need) => need.key)
    ).toEqual(['location']);
  });
});
