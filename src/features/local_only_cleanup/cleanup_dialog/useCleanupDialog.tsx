import { useState } from 'react';
import { useAppTranslation } from '@hooks/index';
import { LocalOnlyCategory } from '@definition/settings';
import { displaySnackNotification } from '@services/states/app';
import appDb from '@db/appDb';
import useExport from '@features/congregation/settings/import_export/export/useExport';

const useCleanupDialog = (
  leftovers: LocalOnlyCategory[],
  onRemoved: VoidFunction
) => {
  const { t } = useAppTranslation();

  const [exported, setExported] = useState(false);

  const { isProcessing, handleDownload } = useExport({
    onClose: () => setExported(true),
  });

  const handleRemove = async () => {
    try {
      for (const category of leftovers) {
        await appDb[category].clear();
      }

      onRemoved();
    } catch (error) {
      console.error(error);

      displaySnackNotification({
        severity: 'error',
        header: t('error_app_generic-title'),
        message: (error as Error).message,
      });
    }
  };

  return { exported, isProcessing, handleExport: handleDownload, handleRemove };
};

export default useCleanupDialog;
