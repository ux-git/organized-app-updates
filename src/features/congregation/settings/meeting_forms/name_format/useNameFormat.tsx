import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  formatNameInAppState,
  formatNamePrintState,
  settingsState,
  userDataViewState,
} from '@states/settings';
import { dbAppSettingsUpdate } from '@services/dexie/settings';
import { FormatNameOption } from '@definition/settings';

const useNameFormat = () => {
  const settings = useAtomValue(settingsState);
  const dataView = useAtomValue(userDataViewState);
  const optionInAppInitial = useAtomValue(formatNameInAppState);
  const optionPrintInitial = useAtomValue(formatNamePrintState);

  const [formatInApp, setFormatInApp] = useState(optionInAppInitial);
  const [formatPrint, setFormatPrint] = useState(optionPrintInitial);

  const handleFormatInAppChange = async (value: FormatNameOption) => {
    setFormatInApp(value);

    const formatNameInApp = structuredClone(
      settings.cong_settings.format_name_in_app || []
    );

    const current = formatNameInApp.find((record) => record.type === dataView);

    if (current) {
      current.value = value;
      current.updatedAt = new Date().toISOString();
    }

    if (!current) {
      formatNameInApp.push({
        _deleted: false,
        type: dataView,
        updatedAt: new Date().toISOString(),
        value,
      });
    }

    await dbAppSettingsUpdate({
      'cong_settings.format_name_in_app': formatNameInApp,
    });
  };

  const handleFormatPrintChange = async (value: FormatNameOption) => {
    setFormatPrint(value);

    const formatNamePrint = structuredClone(
      settings.cong_settings.format_name_print || []
    );

    const current = formatNamePrint.find((record) => record.type === dataView);

    if (current) {
      current.value = value;
      current.updatedAt = new Date().toISOString();
    }

    if (!current) {
      formatNamePrint.push({
        _deleted: false,
        type: dataView,
        updatedAt: new Date().toISOString(),
        value,
      });
    }

    await dbAppSettingsUpdate({
      'cong_settings.format_name_print': formatNamePrint,
    });
  };

  // Keep in sync if the atom changes externally (e.g. remote sync)
  useEffect(() => {
    setFormatInApp(optionInAppInitial);
  }, [optionInAppInitial]);

  useEffect(() => {
    setFormatPrint(optionPrintInitial);
  }, [optionPrintInitial]);

  return {
    formatInApp,
    formatPrint,
    handleFormatInAppChange,
    handleFormatPrintChange,
  };
};

export default useNameFormat;

