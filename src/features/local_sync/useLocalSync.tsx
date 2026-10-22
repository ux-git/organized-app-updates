import { useCallback, useState } from 'react';
import { useAtomValue } from 'jotai';
import { FileWithPath, useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { useAppTranslation } from '@hooks/index';
import { localSyncCategoriesState } from '@states/settings';
import { displaySnackNotification } from '@services/states/app';
import { getMessageByCode } from '@services/i18n/translation';
import {
  exportLocalSyncBundle,
  importLocalSyncBundle,
} from '@services/local_sync';
import { hasNearby, nearby } from '@services/local_sync/nearby';
import { formatDate } from '@utils/date';

const FILE_TYPE = 'application/vnd.organized.local-sync';

const useLocalSync = () => {
  const { t } = useAppTranslation();

  const categories = useAtomValue(localSyncCategoriesState);

  const [isProcessing, setIsProcessing] = useState(false);

  const fail = (error: unknown) => {
    console.error(error);

    displaySnackNotification({
      severity: 'error',
      header: t('error_app_generic-title'),
      message: getMessageByCode((error as Error).message),
    });
  };

  // the share sheet reaches another phone directly; a download is the fallback
  const handleShare = async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);

      const text = await exportLocalSyncBundle();
      const stamp = formatDate(new Date(), 'yyyy-MM-dd_HH-mm');
      const file = new File([text], `Organized-sync-${stamp}.organized-sync`, {
        type: FILE_TYPE,
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('tr_localSync') });
      } else {
        saveAs(file, file.name);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') fail(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: FileWithPath[]) => {
      try {
        setIsProcessing(true);

        const file = acceptedFiles.at(0);

        if (!file || acceptedFiles.length !== 1) {
          throw new Error('error_app_data_invalid-file');
        }

        const result = await importLocalSyncBundle(await file.text());
        const count = Object.values(result.received).reduce(
          (sum, value) => sum + (value ?? 0),
          0
        );

        displaySnackNotification({
          severity: 'success',
          header: t('tr_localSyncReceived'),
          message: t('tr_localSyncReceivedDesc', { count }),
        });
      } catch (error) {
        fail(error);
      } finally {
        setIsProcessing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { [FILE_TYPE]: ['.organized-sync'] },
    maxFiles: 1,
  });

  const handleSyncNearby = () => nearby('syncNow');

  const handlePairNearby = () => nearby('pair');

  return {
    categories,
    isProcessing,
    nearbyAvailable: hasNearby(),
    getRootProps,
    getInputProps,
    handleShare,
    handleSyncNearby,
    handlePairNearby,
  };
};

export default useLocalSync;
