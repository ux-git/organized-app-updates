import appDb from '@db/appDb';
import { LocalOnlyCategory } from '@definition/settings';
import { decryptData, encryptData } from '@services/encryption';
import { dbAppSettingsGet } from '@services/dexie/settings';
import { syncFromRemote } from '@services/worker/backupUtils';
import { getLocalSyncCategories } from '@utils/app_modules';

/**
 * A bundle carries the records of the modules that sync between this
 * congregation's devices without a server. It is sealed with the
 * congregation access code, which every device entitled to the data knows,
 * and merged record by record, newest field wins, like a server sync.
 */
export const BUNDLE_PREFIX = 'OLS1:';

type LocalSyncBundle = {
  name: 'OrganizedLocalSync';
  version: 1;
  cong_id: string;
  created_at: string;
  data: Partial<Record<LocalOnlyCategory, object[]>>;
};

export type LocalSyncResult = {
  received: Partial<Record<LocalOnlyCategory, number>>;
  created_at: string;
};

const getCongregation = async () => {
  const settings = await dbAppSettingsGet();

  if (!settings) throw new Error('Settings not found');

  const accessCode = settings.cong_settings.cong_access_code;

  if (!accessCode) throw new Error('error_app_local-sync_no-access-code');

  return {
    settings,
    accessCode,
    congId: settings.cong_settings.cong_id ?? '',
  };
};

export const exportLocalSyncBundle = async () => {
  const { settings, accessCode, congId } = await getCongregation();
  const categories = getLocalSyncCategories(settings);

  if (categories.length === 0) throw new Error('error_app_local-sync_nothing');

  const data: LocalSyncBundle['data'] = {};

  for (const category of categories) {
    data[category] = await appDb[category].toArray();
  }

  const bundle: LocalSyncBundle = {
    name: 'OrganizedLocalSync',
    version: 1,
    cong_id: congId,
    created_at: new Date().toISOString(),
    data,
  };

  return BUNDLE_PREFIX + encryptData(JSON.stringify(bundle), accessCode);
};

export const importLocalSyncBundle = async (
  text: string
): Promise<LocalSyncResult> => {
  if (!text.startsWith(BUNDLE_PREFIX)) {
    throw new Error('error_app_local-sync_unknown');
  }

  const { settings, accessCode, congId } = await getCongregation();

  let plain: string | undefined;

  try {
    plain = decryptData(
      text.slice(BUNDLE_PREFIX.length),
      accessCode,
      'local_sync'
    );
  } catch {
    plain = undefined;
  }

  if (!plain) throw new Error('error_app_local-sync_sealed');

  const bundle = JSON.parse(plain) as LocalSyncBundle;

  if (bundle.name !== 'OrganizedLocalSync' || bundle.version !== 1) {
    throw new Error('error_app_local-sync_unknown');
  }

  if (bundle.cong_id !== congId) {
    throw new Error('error_app_local-sync_other-congregation');
  }

  // only the categories this device syncs locally are taken in
  const categories = getLocalSyncCategories(settings);
  const received: LocalSyncResult['received'] = {};

  for (const category of categories) {
    const records = bundle.data[category];

    if (!records) continue;

    const table = appDb[category];
    const keyPath = table.schema.primKey.keyPath as string;
    let changed = 0;

    await appDb.transaction('rw', table, async () => {
      for (const remote of records) {
        const key = (remote as Record<string, unknown>)[keyPath] as string;
        const local = await table.get(key);

        if (!local) {
          await table.put(remote as never);
          changed++;
          continue;
        }

        const merged = syncFromRemote(structuredClone(local), remote);

        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          await table.put(merged as never);
          changed++;
        }
      }
    });

    received[category] = changed;
  }

  return { received, created_at: bundle.created_at };
};
