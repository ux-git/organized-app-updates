import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { isDarkThemeState } from '@states/app';
import { followSystemState, setFollowSystem, setTheme } from '../theme';

// the main app's nav bar switch, with the choice kept on this device
const useThemeSwitcher = () => {
  const isDark = useAtomValue(isDarkThemeState);
  const followSystem = useAtomValue(followSystemState);
  const [isOpenConfirm, setIsOpenConfirm] = useState(false);

  const handleChangeTheme = (value: boolean) => {
    if (followSystem) {
      setIsOpenConfirm(true);
      return;
    }
    setTheme(value ? 'dark' : 'light');
  };

  const handleCloseConfirm = () => setIsOpenConfirm(false);

  const handleOverrideThemeAuto = () => {
    setFollowSystem(false);
    setTheme(isDark ? 'light' : 'dark');
    setIsOpenConfirm(false);
  };

  return {
    isDark,
    handleChangeTheme,
    isOpenConfirm,
    handleCloseConfirm,
    handleOverrideThemeAuto,
  };
};

export default useThemeSwitcher;
