import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppRoleType } from '../src/definition/app';
import { SettingsType } from '../src/definition/settings';
import {
  canSetModuleSync,
  getLocalSyncCategories,
  getModuleEntry,
  isModuleEnabled,
} from '../src/utils/app_modules';
import { getLocalOnlyCategoriesToPurge } from '../src/utils/local_only';

const T1 = '2026-02-01T00:00:00.000Z';

const createSettings = (
  roles: AppRoleType[],
  app_modules: unknown = {},
  local_only_categories: unknown = {}
) => {
  return {
    cong_settings: { app_modules, local_only_categories },
    user_settings: { cong_role: roles },
  } as unknown as SettingsType;
};

test('modules default to enabled and server sync', () => {
  const entry = getModuleEntry(createSettings(['secretary']), 'branch_reports');

  assert.deepEqual(entry, { enabled: true, sync: 'server', updatedAt: '' });
  assert.equal(isModuleEnabled(createSettings([]), 'meeting_attendance'), true);
});

test('a module the server does not know yet follows the local-only setting', () => {
  const settings = createSettings(
    ['secretary'],
    {},
    {
      cong_field_service_reports: { value: true, updatedAt: T1 },
    }
  );

  assert.equal(
    getModuleEntry(settings, 'field_service_reports').sync,
    'device'
  );
  assert.equal(getModuleEntry(settings, 'branch_reports').sync, 'server');
});

test('publisher records follow the field service reports module', () => {
  const settings = createSettings(['secretary'], {
    field_service_reports: { enabled: false, sync: 'local', updatedAt: T1 },
    publisher_records: { enabled: true, sync: 'server', updatedAt: T1 },
  });

  assert.equal(getModuleEntry(settings, 'publisher_records').sync, 'local');
  assert.equal(isModuleEnabled(settings, 'publisher_records'), false);
});

test('lists the categories that sync between devices', () => {
  const settings = createSettings(['secretary'], {
    field_service_reports: { enabled: true, sync: 'local', updatedAt: T1 },
    branch_reports: { enabled: true, sync: 'device', updatedAt: T1 },
    meeting_attendance: { enabled: false, sync: 'local', updatedAt: T1 },
  });

  assert.deepEqual(getLocalSyncCategories(settings), [
    'cong_field_service_reports',
  ]);
});

test('only the secretary may take reports off the server; any admin may bring them back', () => {
  const coordinator = createSettings(['coordinator']);
  const secretary = createSettings(['secretary']);
  const elder = createSettings(['elder']);

  assert.equal(
    canSetModuleSync(coordinator, 'field_service_reports', 'local'),
    false
  );
  assert.equal(
    canSetModuleSync(coordinator, 'field_service_reports', 'server'),
    true
  );
  assert.equal(canSetModuleSync(coordinator, 'branch_reports', 'device'), true);
  assert.equal(
    canSetModuleSync(secretary, 'field_service_reports', 'local'),
    true
  );
  assert.equal(canSetModuleSync(elder, 'meeting_attendance', 'local'), false);
});

test('a device that syncs a category nearby keeps it when the server drops it', () => {
  const roles: AppRoleType[] = ['elder', 'group_overseers'];
  const before = createSettings(roles);
  const after = createSettings(
    roles,
    {},
    {
      cong_field_service_reports: { value: true, updatedAt: T1 },
      meeting_attendance: { value: true, updatedAt: T1 },
    }
  );

  assert.deepEqual(
    getLocalOnlyCategoriesToPurge(before, after, [
      'cong_field_service_reports',
    ]),
    ['meeting_attendance']
  );
});
