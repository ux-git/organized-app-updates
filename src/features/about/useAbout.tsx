import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useAppTranslation } from '@hooks/index';
import { isAboutOpenState } from '@states/app';
import { setIsAboutOpen, setIsSupportOpen } from '@services/states/app';
import { AboutProps } from './index.types';
import { manualCheckPwaUpdate } from '@services/app';

const parser = new DOMParser();

const currentYear = new Date().getFullYear();

const useAbout = ({ updatePwa }: AboutProps) => {
  const { t } = useAppTranslation();

  const isOpen = useAtomValue(isAboutOpenState);

  const privacyText = useMemo(() => {
    const htmlString = t('tr_privacySecurityDesc');
    const html = parser.parseFromString(htmlString, 'text/html');
    const privacyLink = Array.from(html.querySelectorAll('a')).at(1);

    return privacyLink.textContent;
  }, [t]);

  const handleForceReload = () => {
    try {
      updatePwa();

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error(error.message);
    }
  };

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdateCheckComplete, setIsUpdateCheckComplete] = useState(false);
  const [updateFoundResult, setUpdateFoundResult] = useState(false);

  const handleCheckUpdatesClose = () => {
    setIsCheckingUpdates(false);
    setIsUpdateCheckComplete(false);
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setIsUpdateCheckComplete(false);

    try {
      const updateFound = await manualCheckPwaUpdate();
      // wait a minimum amount of time to show the spinner gracefully
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setUpdateFoundResult(updateFound);
      setIsUpdateCheckComplete(true);
    } catch {
      setIsCheckingUpdates(false);
    }
  };

  const handleClose = () => setIsAboutOpen(false);

  const handleOpenSupport = () => {
    setIsAboutOpen(false);
    setIsSupportOpen(true);
  };

  const handleOpenDoc = () => {
    window.open(`https://guide.organized-app.com`, '_blank');
  };

  return {
    isOpen,
    handleClose,
    currentYear,
    handleOpenDoc,
    handleOpenSupport,
    handleForceReload,
    handleCheckUpdates,
    handleCheckUpdatesClose,
    isCheckingUpdates,
    isUpdateCheckComplete,
    updateFoundResult,
    privacyText,
  };
};

export default useAbout;
