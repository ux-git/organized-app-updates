import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { FormS4Props } from '../index.types';
import { settingsState } from '@states/settings';
import { congAccountConnectedState } from '@states/app';
import useMinistryMonthlyRecord from '@features/ministry/hooks/useMinistryMonthlyRecord';
import { getLocalOnlyCategories } from '@utils/local_only';

const useSubmitButton = ({ month, person_uid, publisher }: FormS4Props) => {
  const settings = useAtomValue(settingsState);
  const isConnected = useAtomValue(congAccountConnectedState);

  const { status, shared_ministry } = useMinistryMonthlyRecord({
    month,
    person_uid,
    publisher,
  });

  // only the secretary's own records still count; everyone else's submission
  // would never reach the secretary
  const submitBlocked = useMemo(() => {
    if (settings.user_settings.cong_role.includes('secretary')) return false;

    const localOnly = getLocalOnlyCategories(settings);

    return localOnly.includes('cong_field_service_reports');
  }, [settings]);

  const disabled = useMemo(() => {
    if (!isConnected) return true;

    if (!settings.cong_settings.data_sync.value) {
      return true;
    }

    if (submitBlocked) return true;

    if (status === 'confirmed') return true;

    return !shared_ministry;
  }, [isConnected, settings, submitBlocked, shared_ministry, status]);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const handleCloseSubmit = () => setSubmitOpen(false);

  const handleCloseWithdraw = () => setWithdrawOpen(false);

  const handleOpenModal = () => {
    if (status === 'pending') {
      setSubmitOpen(true);
    }

    if (status === 'submitted' || status === 'received') {
      setWithdrawOpen(true);
    }
  };

  // only when local-only reports are the actual reason the button is off
  const showBlockedHint =
    submitBlocked &&
    isConnected &&
    settings.cong_settings.data_sync.value &&
    status !== 'confirmed';

  return {
    status,
    disabled,
    showBlockedHint,
    submitOpen,
    withdrawOpen,
    handleCloseSubmit,
    handleCloseWithdraw,
    handleOpenModal,
  };
};

export default useSubmitButton;
