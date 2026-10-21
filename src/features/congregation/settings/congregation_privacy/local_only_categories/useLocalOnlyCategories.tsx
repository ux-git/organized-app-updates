import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useAppTranslation } from '@hooks/index';
import { LOCAL_ONLY_CATEGORIES, LocalOnlyCategory } from '@definition/settings';
import { featureFlagsState } from '@states/app';
import {
  congDataSyncState,
  localOnlyCategoriesState,
  settingsState,
} from '@states/settings';
import { dbLocalOnlyCategoryUpdate } from '@services/dexie/settings';
import { dbMetadataRearm } from '@services/dexie/metadata';
import { displaySnackNotification } from '@services/states/app';
import {
  canToggleLocalOnly,
  getToggleTimestamp,
  isLocalOnlySettingPending,
} from '@utils/local_only';

const useLocalOnlyCategories = () => {
  const { t } = useAppTranslation();

  const FEATURE_FLAGS = useAtomValue(featureFlagsState);
  const settings = useAtomValue(settingsState);
  const dataSync = useAtomValue(congDataSyncState);
  const localOnly = useAtomValue(localOnlyCategoriesState);

  // the value is fixed when the dialog opens, so a sync that lands meanwhile
  // cannot flip what Confirm writes
  const [pendingChange, setPendingChange] = useState<{
    category: LocalOnlyCategory;
    value: boolean;
  }>();

  const featureEnabled =
    (FEATURE_FLAGS['LOCAL_ONLY_CATEGORIES'] ?? false) && dataSync;

  // outside the rollout only active categories stay visible, so they can be
  // turned off but no new one can be turned on
  const categories = LOCAL_ONLY_CATEGORIES.filter(
    (category) => featureEnabled || localOnly.includes(category)
  );

  const pendingCategory = pendingChange?.category;
  const isEnabling = pendingChange?.value ?? false;

  const canToggle = (category: LocalOnlyCategory) => {
    return canToggleLocalOnly(
      settings,
      category,
      !localOnly.includes(category)
    );
  };

  const handleToggle = (category: LocalOnlyCategory) => {
    setPendingChange({ category, value: !localOnly.includes(category) });
  };

  const handleCancel = () => setPendingChange(undefined);

  const handleConfirm = async () => {
    if (!pendingChange) return;

    const { category, value } = pendingChange;
    setPendingChange(undefined);

    try {
      await dbLocalOnlyCategoryUpdate(category, (previous) => ({
        value,
        updatedAt: getToggleTimestamp(previous),
        confirmed: false,
      }));

      if (value) {
        // these records now exist only on admin devices
        await navigator.storage?.persist?.().catch(() => false);
      } else {
        // upload this device's records again, even if the server applies the
        // setting before it stores them
        await dbMetadataRearm([category]);
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

  return {
    categories,
    localOnly,
    pendingCategory,
    isEnabling,
    isPending: isLocalOnlySettingPending(settings),
    canToggle,
    handleToggle,
    handleConfirm,
    handleCancel,
  };
};

export default useLocalOnlyCategories;
