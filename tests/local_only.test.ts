import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppRoleType } from '../src/definition/app';
import { LocalOnlySetting, SettingsType } from '../src/definition/settings';
import {
  canToggleLocalOnly,
  confirmSentLocalOnly,
  getCategoriesToSkip,
  getConfirmedLocalOnlyCategories,
  getForcedUploadCategories,
  getLocalOnlyCategories,
  getLocalOnlyCategoriesToPurge,
  getLocalOnlyCategoriesToRearm,
  getToggleTimestamp,
  hasEditsSince,
  isLocalOnlySettingPending,
  mergeRemoteLocalOnlySetting,
  remoteSupportsLocalOnly,
  toUploadCongSettings,
} from '../src/utils/local_only';

const T1 = '2026-02-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';

const on = (updatedAt = T1, confirmed?: boolean) => ({
  value: true,
  updatedAt,
  confirmed,
});

const off = (updatedAt = T1, confirmed?: boolean) => ({
  value: false,
  updatedAt,
  confirmed,
});

const createSettings = (setting: unknown, roles: AppRoleType[]) => {
  return {
    cong_settings: { local_only_categories: setting },
    user_settings: { cong_role: roles },
  } as unknown as SettingsType;
};

const remoteWith = (setting: LocalOnlySetting) => ({
  local_only_categories: setting,
});

test('keeps only known categories that are switched on', () => {
  const settings = createSettings(
    {
      persons: on(),
      branch_cong_analysis: on(),
      cong_field_service_reports: off(),
    },
    ['elder']
  );

  assert.deepEqual(getLocalOnlyCategories(settings), ['branch_cong_analysis']);
  assert.deepEqual(getLocalOnlyCategories(createSettings('x', ['elder'])), []);
  assert.deepEqual(getLocalOnlyCategories(undefined), []);
});

test('purges on a non-admin device only on the sync that turns a category local-only', () => {
  const roles: AppRoleType[] = ['elder', 'group_overseers'];
  const before = createSettings({}, roles);
  const after = createSettings({ cong_field_service_reports: on() }, roles);

  assert.deepEqual(getLocalOnlyCategoriesToPurge(before, after), [
    'cong_field_service_reports',
  ]);
  assert.deepEqual(getLocalOnlyCategoriesToPurge(after, after), []);
});

test('leaves the copies of a device that just lost its admin role', () => {
  const before = createSettings({ cong_field_service_reports: on() }, [
    'secretary',
  ]);
  const after = createSettings({ cong_field_service_reports: on() }, ['elder']);

  assert.deepEqual(getLocalOnlyCategoriesToPurge(before, after), []);
});

test('re-uploads categories that sync again, on admin devices only', () => {
  const before = { cong_field_service_reports: on() };
  const after = { cong_field_service_reports: off(T2) };

  assert.deepEqual(
    getLocalOnlyCategoriesToRearm(
      createSettings(before, ['coordinator']),
      createSettings(after, ['coordinator'])
    ),
    ['cong_field_service_reports']
  );
  assert.deepEqual(
    getLocalOnlyCategoriesToRearm(
      createSettings(before, ['elder']),
      createSettings(after, ['elder'])
    ),
    []
  );
});

test('detects an API that understands the setting from its echo', () => {
  assert.equal(remoteSupportsLocalOnly(remoteWith({})), true);
  assert.equal(remoteSupportsLocalOnly({}), false);
});

test('merges each category on its own', () => {
  // this admin turned S-10 on; another admin turned reports on meanwhile
  const local = createSettings({ branch_cong_analysis: on(T2, false) }, [
    'coordinator',
  ]);

  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      local,
      remoteWith({ cong_field_service_reports: on(T1) })
    ),
    {
      cong_field_service_reports: on(T1, true),
      branch_cong_analysis: on(T2, false),
    }
  );
});

test('confirms a pending change once the server holds it, taking its time', () => {
  const local = createSettings({ cong_field_service_reports: on(T2, false) }, [
    'secretary',
  ]);

  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      local,
      remoteWith({ cong_field_service_reports: on(T1) })
    ),
    { cong_field_service_reports: on(T1, true) }
  );
});

test('lets the server win over confirmed or non-admin local values', () => {
  const confirmed = createSettings(
    { cong_field_service_reports: on(T2, true) },
    ['secretary']
  );

  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      confirmed,
      remoteWith({ cong_field_service_reports: off(T1) })
    ),
    { cong_field_service_reports: off(T1, true) }
  );

  const demoted = createSettings(
    { cong_field_service_reports: off(T2, false) },
    ['elder']
  );

  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      demoted,
      remoteWith({ cong_field_service_reports: on(T1) })
    ),
    { cong_field_service_reports: on(T1, true) }
  );

  assert.equal(
    mergeRemoteLocalOnlySetting(
      createSettings({ cong_field_service_reports: on(T1, true) }, ['elder']),
      remoteWith({ cong_field_service_reports: on(T1) })
    ),
    undefined
  );
  assert.equal(mergeRemoteLocalOnlySetting(confirmed, {}), undefined);
});

test('still merges the server copy while a turn-on is pending', () => {
  const pending = createSettings(
    { cong_field_service_reports: on(T2, false) },
    ['secretary']
  );

  assert.deepEqual(getCategoriesToSkip(pending, remoteWith({})), []);
  assert.deepEqual(
    getCategoriesToSkip(
      pending,
      remoteWith({ cong_field_service_reports: on(T1) })
    ),
    ['cong_field_service_reports']
  );
  assert.deepEqual(getCategoriesToSkip(pending, {}), [
    'cong_field_service_reports',
  ]);
});

test('re-creates the server copy only from an admin device that turned it off', () => {
  const remote = remoteWith({ cong_field_service_reports: on(T1) });
  const turnedOff = { cong_field_service_reports: off(T2, false) };

  assert.deepEqual(
    getForcedUploadCategories(createSettings(turnedOff, ['secretary']), remote),
    ['cong_field_service_reports']
  );
  assert.deepEqual(
    getForcedUploadCategories(createSettings(turnedOff, ['elder']), remote),
    []
  );
});

test('sends only pending changes, and only to an API that understands them', () => {
  const congSettings = {
    cong_name: 'Central',
    local_only_categories: {
      cong_field_service_reports: on(T1, true),
      branch_cong_analysis: on(T2, false),
    },
  };

  assert.deepEqual(toUploadCongSettings(congSettings, {}), {
    cong_name: 'Central',
  });
  assert.deepEqual(toUploadCongSettings(congSettings, remoteWith({})), {
    cong_name: 'Central',
    local_only_categories: { branch_cong_analysis: on(T2, false) },
  });
  assert.deepEqual(
    toUploadCongSettings(
      {
        cong_name: 'Central',
        local_only_categories: { branch_cong_analysis: on(T1, true) },
      },
      remoteWith({})
    ),
    { cong_name: 'Central' }
  );
});
test('reports a change the server has not confirmed yet', () => {
  assert.equal(
    isLocalOnlySettingPending(
      createSettings({ branch_cong_analysis: on(T2, false) }, ['secretary'])
    ),
    true
  );
  assert.equal(
    isLocalOnlySettingPending(
      createSettings({ branch_cong_analysis: on(T2, true) }, ['secretary'])
    ),
    false
  );
});

test('never stamps a toggle older than the value it replaces', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');

  assert.equal(
    getToggleTimestamp(on(T1, true), now),
    '2026-02-01T00:00:00.001Z'
  );
  assert.equal(getToggleTimestamp(undefined, now), '2026-01-01T00:00:00.000Z');
});

test('keeps records local on admin devices when the server entry goes missing', () => {
  for (const roles of [['secretary'], ['coordinator']] as AppRoleType[][]) {
    const settings = createSettings(
      { cong_field_service_reports: on(T1, true) },
      roles
    );

    assert.equal(
      mergeRemoteLocalOnlySetting(settings, remoteWith({})),
      undefined
    );
  }

  // other devices follow the server
  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      createSettings({ cong_field_service_reports: on(T1, true) }, ['elder']),
      remoteWith({})
    ),
    {}
  );
});
test('lets only the secretary turn reports on, and any admin turn them off', () => {
  const coordinator = createSettings({}, ['coordinator']);

  assert.equal(
    canToggleLocalOnly(coordinator, 'cong_field_service_reports', true),
    false
  );
  assert.equal(
    canToggleLocalOnly(coordinator, 'cong_field_service_reports', false),
    true
  );
  assert.equal(
    canToggleLocalOnly(coordinator, 'branch_cong_analysis', true),
    true
  );

  // a turn-on this device may no longer make gives way to the server
  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      createSettings({ cong_field_service_reports: on(T2, false) }, [
        'coordinator',
      ]),
      remoteWith({ cong_field_service_reports: off(T1) })
    ),
    { cong_field_service_reports: off(T1, true) }
  );
});
test('keeps the version of a category whose turn-on is still pending', () => {
  const settings = createSettings(
    {
      cong_field_service_reports: on(T2, false),
      branch_cong_analysis: on(T1, true),
    },
    ['secretary']
  );

  assert.deepEqual(getConfirmedLocalOnlyCategories(settings), [
    'branch_cong_analysis',
  ]);
});

test('detects records edited after the last download', () => {
  const records = [
    { report_data: { updatedAt: '2026-01-10T00:00:00.000Z' } },
    { updatedAt: '2026-01-05T00:00:00.000Z' },
  ];

  assert.equal(hasEditsSince(records, '2026-01-07T00:00:00.000Z'), true);
  assert.equal(hasEditsSince(records, '2026-01-20T00:00:00.000Z'), false);
});

test('confirms the entries an accepted upload carried', () => {
  const current = {
    cong_field_service_reports: on(T2, false),
    branch_cong_analysis: on(T2, false),
  };

  assert.deepEqual(
    confirmSentLocalOnly(current, {
      cong_field_service_reports: on(T2, false),
      branch_cong_analysis: on(T1, false),
    }),
    {
      cong_field_service_reports: { ...on(T2, true), sent: true },
      branch_cong_analysis: on(T2, false),
    }
  );
  assert.equal(confirmSentLocalOnly(current, undefined), undefined);
});

test('skips a category this admin device keeps local-only on its own', () => {
  const settings = createSettings(
    { cong_field_service_reports: on(T1, true) },
    ['secretary']
  );

  assert.deepEqual(getCategoriesToSkip(settings, remoteWith({})), [
    'cong_field_service_reports',
  ]);
  assert.deepEqual(
    getCategoriesToSkip(
      createSettings({ cong_field_service_reports: on(T1, true) }, ['elder']),
      remoteWith({})
    ),
    []
  );
});

test('does not keep a sent or stand-in value the server never echoed', () => {
  const sent = createSettings(
    { cong_field_service_reports: { ...on(T2, true), sent: true } },
    ['coordinator']
  );
  const standIn = createSettings(
    { cong_field_service_reports: on('1970-01-01T00:00:00.000Z', true) },
    ['secretary']
  );

  assert.deepEqual(mergeRemoteLocalOnlySetting(sent, remoteWith({})), {});
  assert.deepEqual(mergeRemoteLocalOnlySetting(standIn, remoteWith({})), {});
});

test('takes the server echo of a sent change as its own', () => {
  const sent = createSettings(
    { cong_field_service_reports: { ...on(T2, true), sent: true } },
    ['secretary']
  );

  assert.deepEqual(
    mergeRemoteLocalOnlySetting(
      sent,
      remoteWith({ cong_field_service_reports: on(T2) })
    ),
    { cong_field_service_reports: on(T2, true) }
  );
});
