import {
  LOCAL_ONLY_CATEGORIES,
  LocalOnlyCategory,
  LocalOnlyEntry,
  LocalOnlySetting,
  SettingsType,
} from '@definition/settings';

type RemoteBackup = { local_only_categories?: unknown };

type RemoteEntry = { value: boolean; updatedAt: string };

const getRemoteEntry = (
  backup: RemoteBackup,
  category: LocalOnlyCategory
): RemoteEntry | undefined => {
  const setting = backup.local_only_categories as
    Record<string, Partial<RemoteEntry> | undefined> | undefined;

  const entry = setting?.[category];

  if (
    typeof entry?.value !== 'boolean' ||
    typeof entry.updatedAt !== 'string'
  ) {
    return;
  }

  return { value: entry.value, updatedAt: entry.updatedAt };
};

// must match the admin capability on the API and isAdmin in useCurrentUser
export const isAdminRole = (settings: SettingsType) => {
  const userRole = settings.user_settings.cong_role;

  return (
    userRole.includes('admin') ||
    userRole.includes('secretary') ||
    userRole.includes('coordinator')
  );
};

export const getLocalOnlyCategories = (
  settings: SettingsType | undefined
): LocalOnlyCategory[] => {
  const setting = settings?.cong_settings.local_only_categories;

  if (!setting || typeof setting !== 'object') return [];

  return LOCAL_ONLY_CATEGORIES.filter(
    (category) => setting[category]?.value === true
  );
};

// turning reports local-only clears the server copy, so only the secretary,
// who holds the reference copy, may turn it on; any admin may turn it off.
// The API enforces the same rule
export const canToggleLocalOnly = (
  settings: SettingsType,
  category: LocalOnlyCategory,
  turnOn: boolean
) => {
  if (!isAdminRole(settings)) return false;

  if (category !== 'cong_field_service_reports' || !turnOn) return true;

  return settings.user_settings.cong_role.includes('secretary');
};

// records edited after the last download have not reached the server yet
export const hasEditsSince = (records: unknown[], version: string) => {
  return records.some((record) => {
    const { updatedAt, report_data } = record as {
      updatedAt?: string;
      report_data?: { updatedAt?: string };
    };

    return (report_data?.updatedAt ?? updatedAt ?? '') > version;
  });
};

// a pending turn-on keeps its version in the sync header, so the server
// rejects an upload that would purge records this device has not merged yet
export const getConfirmedLocalOnlyCategories = (
  settings: SettingsType
): LocalOnlyCategory[] => {
  const setting = settings.cong_settings.local_only_categories ?? {};

  return getLocalOnlyCategories(settings).filter(
    (category) => setting[category]?.confirmed !== false
  );
};

// devices without an admin role drop their copies on the sync that makes a
// category local-only; later leftovers are cleared by the user, not silently
export const getLocalOnlyCategoriesToPurge = (
  previous: SettingsType | undefined,
  current: SettingsType
): LocalOnlyCategory[] => {
  if (isAdminRole(current)) return [];

  const before = getLocalOnlyCategories(previous);

  return getLocalOnlyCategories(current).filter(
    (category) => !before.includes(category)
  );
};

// the server deleted its copy while a category was local-only, so every admin
// device uploads its records again once the category syncs again
export const getLocalOnlyCategoriesToRearm = (
  previous: SettingsType | undefined,
  current: SettingsType
): LocalOnlyCategory[] => {
  if (!isAdminRole(current)) return [];

  const now = getLocalOnlyCategories(current);

  return getLocalOnlyCategories(previous).filter(
    (category) => !now.includes(category)
  );
};

// only APIs that understand the setting send it, beside the settings
export const remoteSupportsLocalOnly = (backup: RemoteBackup) => {
  const setting = backup.local_only_categories;

  return !!setting && typeof setting === 'object';
};

export const getRemoteLocalOnlyCategories = (
  backup: RemoteBackup
): LocalOnlyCategory[] => {
  return LOCAL_ONLY_CATEGORIES.filter(
    (category) => getRemoteEntry(backup, category)?.value === true
  );
};

// never older than the value it replaces, so a device clock running behind
// cannot lose against the stored entry
export const getToggleTimestamp = (
  previous: LocalOnlyEntry | undefined,
  now = Date.now()
) => {
  const previousTime = Date.parse(previous?.updatedAt ?? '');

  const time = Number.isNaN(previousTime)
    ? now
    : Math.max(now, previousTime + 1);

  return new Date(time).toISOString();
};

export const isLocalOnlySettingPending = (settings: SettingsType) => {
  const setting = settings.cong_settings.local_only_categories ?? {};

  return LOCAL_ONLY_CATEGORIES.some(
    (category) => setting[category]?.confirmed === false
  );
};

/**
 * Merges the server copy category by category. The server wins unless this
 * admin device has a newer pending change for that category, which stays until
 * the server holds the same value. Returns undefined when nothing changes.
 */
export const mergeRemoteLocalOnlySetting = (
  settings: SettingsType | undefined,
  backup: RemoteBackup
): LocalOnlySetting | undefined => {
  if (!settings || !remoteSupportsLocalOnly(backup)) return;

  const local = settings.cong_settings.local_only_categories ?? {};

  const result: LocalOnlySetting = {};
  let changed = false;

  for (const category of LOCAL_ONLY_CATEGORIES) {
    const localEntry = local[category];
    const remoteEntry = getRemoteEntry(backup, category);
    // a missing server entry is no reason to share records again, nor to
    // re-apply the setting unasked: an admin device keeps the category local
    // until an admin toggles it; other devices follow the server
    // only a value the server once held counts: not one it may have dropped
    // on upload, nor the fail-closed stand-in with its epoch timestamp
    if (
      !remoteEntry &&
      localEntry?.value === true &&
      localEntry.confirmed !== false &&
      !localEntry.sent &&
      Date.parse(localEntry.updatedAt) > 0 &&
      isAdminRole(settings)
    ) {
      result[category] = localEntry;
      continue;
    }

    const remoteValue = remoteEntry?.value ?? false;
    const remoteUpdatedAt = remoteEntry?.updatedAt ?? '';

    const pending =
      localEntry?.confirmed === false &&
      canToggleLocalOnly(settings, category, localEntry.value);

    if (
      pending &&
      localEntry.value !== remoteValue &&
      localEntry.updatedAt > remoteUpdatedAt
    ) {
      result[category] = localEntry;
      continue;
    }

    const same =
      (localEntry?.value ?? false) === remoteValue &&
      (localEntry?.updatedAt ?? '') === remoteUpdatedAt &&
      localEntry?.confirmed !== false &&
      !localEntry?.sent;

    if (!same) changed = true;

    if (remoteEntry) result[category] = { ...remoteEntry, confirmed: true };
  }

  return changed ? result : undefined;
};

// categories the server keeps out of sync, plus those this admin device keeps
// local-only on its own (an API without the setting, or a lost server entry);
// a pending turn-on still merges the server copy so nothing synced meanwhile
// is lost
export const getCategoriesToSkip = (
  settings: SettingsType,
  backup: RemoteBackup
): LocalOnlyCategory[] => {
  if (!remoteSupportsLocalOnly(backup)) return getLocalOnlyCategories(settings);

  const remote = getRemoteLocalOnlyCategories(backup);

  if (!isAdminRole(settings)) return remote;

  const confirmed = getConfirmedLocalOnlyCategories(settings);

  return LOCAL_ONLY_CATEGORIES.filter(
    (category) => remote.includes(category) || confirmed.includes(category)
  );
};

/**
 * Marks the entries an accepted upload carried as confirmed: from then on the
 * server's copy decides, so a later change by another admin is not undone by
 * this device's clock. Returns undefined when nothing changes.
 */
export const confirmSentLocalOnly = (
  current: LocalOnlySetting | undefined,
  sent: LocalOnlySetting | undefined
): LocalOnlySetting | undefined => {
  if (!current || !sent) return;

  const result: LocalOnlySetting = { ...current };
  let changed = false;

  for (const category of LOCAL_ONLY_CATEGORIES) {
    const local = current[category];
    const entry = sent[category];

    if (
      local?.confirmed === false &&
      entry?.value === local.value &&
      entry.updatedAt === local.updatedAt
    ) {
      result[category] = { ...local, confirmed: true, sent: true };
      changed = true;
    }
  }

  return changed ? result : undefined;
};

// categories the server still keeps local-only although this admin device
// turned them off: this upload re-creates the server copy
export const getForcedUploadCategories = (
  settings: SettingsType,
  backup: RemoteBackup
): LocalOnlyCategory[] => {
  if (!isAdminRole(settings)) return [];

  const localOnly = getLocalOnlyCategories(settings);

  return getRemoteLocalOnlyCategories(backup).filter(
    (category) => !localOnly.includes(category)
  );
};

// only pending changes are sent, and only to an API that understands the
// setting: older APIs reject the whole backup if the key is present
export const toUploadCongSettings = <
  T extends { local_only_categories?: LocalOnlySetting },
>(
  congSettings: T,
  backup: RemoteBackup
) => {
  const { local_only_categories, ...rest } = congSettings;

  if (!remoteSupportsLocalOnly(backup)) return rest;

  const pending = Object.fromEntries(
    Object.entries(local_only_categories ?? {}).filter(
      ([, entry]) => entry?.confirmed === false
    )
  );

  if (Object.keys(pending).length === 0) return rest;

  return { ...rest, local_only_categories: pending };
};
