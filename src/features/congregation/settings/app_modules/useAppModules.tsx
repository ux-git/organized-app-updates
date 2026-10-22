import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useAppTranslation } from '@hooks/index';
import {
  APP_MODULES,
  AppModuleId,
  ModuleSyncMethod,
} from '@definition/settings';
import { APP_MODULE_DEFINITIONS } from '@definition/app_modules';
import { featureFlagsState } from '@states/app';
import { congDataSyncState, settingsState } from '@states/settings';
import { dbAppModuleUpdate } from '@services/dexie/settings';
import { dbMetadataRearm } from '@services/dexie/metadata';
import { displaySnackNotification } from '@services/states/app';
import {
  canSetModuleEnabled,
  canSetModuleSync,
  getModuleEntry,
} from '@utils/app_modules';
import { isLocalOnlySettingPending } from '@utils/local_only';

export type PendingChange = {
  module: AppModuleId;
  sync: ModuleSyncMethod;
};

const useAppModules = () => {
  const { t } = useAppTranslation();

  const FEATURE_FLAGS = useAtomValue(featureFlagsState);
  const settings = useAtomValue(settingsState);
  const dataSync = useAtomValue(congDataSyncState);

  const [pendingChange, setPendingChange] = useState<PendingChange>();

  // only modules that own data get a sync method; the rest follow one
  const modules = APP_MODULES.map((module) => ({
    id: module,
    entry: getModuleEntry(settings, module),
    follows: APP_MODULE_DEFINITIONS[module].follows,
  }));

  // the sync method is part of the local-only rollout; outside it a module
  // that already left the server can still be brought back
  const syncVisible = (module: AppModuleId) =>
    dataSync &&
    ((FEATURE_FLAGS['LOCAL_ONLY_CATEGORIES'] ?? false) ||
      getModuleEntry(settings, module).sync !== 'server');

  const canEnable = canSetModuleEnabled(settings);

  const canChoose = (module: AppModuleId, sync: ModuleSyncMethod) =>
    canSetModuleSync(settings, module, sync);

  const save = async (
    module: AppModuleId,
    change: { enabled: boolean; sync: ModuleSyncMethod }
  ) => {
    try {
      const rearm = await dbAppModuleUpdate(module, change);

      // the server copy was deleted meanwhile, so this device sends its own
      await dbMetadataRearm(rearm);

      if (change.sync !== 'server') {
        // these records now exist only on this congregation's devices
        await navigator.storage?.persist?.().catch(() => false);
      }
    } catch (error) {
      console.error(error);

      displaySnackNotification({
        severity: 'error',
        header: t('error_app_generic-title'),
        message: (error as Error).message,
      });
    }
  };

  const handleToggleEnabled = async (module: AppModuleId) => {
    const entry = getModuleEntry(settings, module);

    await save(module, { enabled: !entry.enabled, sync: entry.sync });
  };

  // leaving or rejoining the server is confirmed first
  const handleChooseSync = (module: AppModuleId, sync: ModuleSyncMethod) => {
    const entry = getModuleEntry(settings, module);

    if (entry.sync === sync) return;

    const crossesServer = entry.sync === 'server' || sync === 'server';

    if (!crossesServer) {
      save(module, { enabled: entry.enabled, sync });
      return;
    }

    setPendingChange({ module, sync });
  };

  const handleCancel = () => setPendingChange(undefined);

  const handleConfirm = async () => {
    if (!pendingChange) return;

    const { module, sync } = pendingChange;
    setPendingChange(undefined);

    await save(module, {
      enabled: getModuleEntry(settings, module).enabled,
      sync,
    });
  };

  return {
    modules,
    syncVisible,
    canEnable,
    canChoose,
    pendingChange,
    isPending: isLocalOnlySettingPending(settings),
    handleToggleEnabled,
    handleChooseSync,
    handleCancel,
    handleConfirm,
  };
};

export default useAppModules;
