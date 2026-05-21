import { MouseEvent, useRef, useState } from 'react';
import { schedulesStartAutofill } from '@services/app/autofill';
import { displaySnackNotification } from '@services/states/app';
import { getMessageByCode } from '@services/i18n/translation';

const useWeekBadge = (week?: string) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  const handleAutofill = async (e: MouseEvent) => {
    e.stopPropagation();

    if (!week || isProcessingRef.current) return;

    try {
      isProcessingRef.current = true;
      setIsProcessing(true);

      await schedulesStartAutofill(week, week, 'midweek');
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error ? error.message : 'error_app_generic-title';

      displaySnackNotification({
        header: getMessageByCode('error_app_generic-title'),
        message: getMessageByCode(message),
        severity: 'error',
      });
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  return { isProcessing, handleAutofill };
};

export default useWeekBadge;
