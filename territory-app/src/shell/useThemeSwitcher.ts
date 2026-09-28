import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { isDarkThemeState } from '@states/app';
import { toggled } from '../haptics';
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
    setTheme(toggled(value) ? 'dark' : 'light');
  };

  const handleCloseConfirm = () => setIsOpenConfirm(false);

  const handleOverrideThemeAuto = () => {
    setFollowSystem(false);
    setTheme(toggled(!isDark) ? 'dark' : 'light');
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
