import {
  APP_MODULES,
  AppModuleEntry,
  AppModuleId,
  AppModulesSetting,
  LocalOnlyCategory,
  ModuleSyncMethod,
  SettingsType,
} from '@definition/settings';
import { APP_MODULE_DEFINITIONS } from '@definition/app_modules';
import { getLocalOnlyCategories, isAdminRole } from './local_only';

const DEFAULT_ENTRY: AppModuleEntry = {
  enabled: true,
  sync: 'server',
  updatedAt: '',
};

export const getAppModules = (
  settings: SettingsType | undefined
): AppModulesSetting => {
  const setting = settings?.cong_settings.app_modules;

  if (!setting || typeof setting !== 'object') return {};

  return Object.fromEntries(
    APP_MODULES.filter((module) => setting[module]).map((module) => [
      module,
      setting[module],
    ])
  );
};

// a module that owns no data takes the sync method of the one it follows;
// until the server knows a module, the local-only setting decides
export const getModuleEntry = (
  settings: SettingsType | undefined,
  module: AppModuleId
): AppModuleEntry => {
  const modules = getAppModules(settings);
  const definition = APP_MODULE_DEFINITIONS[module];
  const own = modules[module] ?? DEFAULT_ENTRY;

  if (definition.follows) {
    return { ...own, sync: getModuleEntry(settings, definition.follows).sync };
  }

  if (modules[module]) return own;

  const localOnly = getLocalOnlyCategories(settings);
  const offServer = definition.categories.some((category) =>
    localOnly.includes(category)
  );

  return { ...own, sync: offServer ? 'device' : 'server' };
};

export const isModuleEnabled = (
  settings: SettingsType | undefined,
  module: AppModuleId
) => {
  const entry = getModuleEntry(settings, module);
  const definition = APP_MODULE_DEFINITIONS[module];

  if (definition.follows && !isModuleEnabled(settings, definition.follows)) {
    return false;
  }

  return entry.enabled;
};

export const getModuleSync = (
  settings: SettingsType | undefined,
  module: AppModuleId
): ModuleSyncMethod => getModuleEntry(settings, module).sync;

export const getModuleOfCategory = (
  category: LocalOnlyCategory
): AppModuleId | undefined => {
  return APP_MODULES.find((module) =>
    APP_MODULE_DEFINITIONS[module].categories.includes(category)
  );
};

// categories that travel between this congregation's devices without a server
export const getLocalSyncCategories = (
  settings: SettingsType | undefined
): LocalOnlyCategory[] => {
  return APP_MODULES.filter(
    (module) =>
      isModuleEnabled(settings, module) &&
      getModuleSync(settings, module) === 'local'
  ).flatMap((module) => APP_MODULE_DEFINITIONS[module].categories);
};

// moving data off the server clears the server copy, so the restricted
// modules only let the secretary do that; any admin may bring it back
export const canSetModuleSync = (
  settings: SettingsType,
  module: AppModuleId,
  sync: ModuleSyncMethod
) => {
  if (!isAdminRole(settings)) return false;

  const definition = APP_MODULE_DEFINITIONS[module];

  if (sync === 'server' || definition.restrictedTo !== 'secretary') return true;

  return settings.user_settings.cong_role.includes('secretary');
};

export const canSetModuleEnabled = (settings: SettingsType) => {
  return isAdminRole(settings);
};
