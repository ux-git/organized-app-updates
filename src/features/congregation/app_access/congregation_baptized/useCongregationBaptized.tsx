import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { formatNameInAppState } from '@states/settings';
import { congregationsBaptizedPersonsState } from '@states/congregation';

const useCongregationBaptized = () => {
  const navigate = useNavigate();

  const fullnameOption = useAtomValue(formatNameInAppState);
  const users = useAtomValue(congregationsBaptizedPersonsState);

  const handleOpenUserDetails = (value: string) => {
    navigate(`/manage-access/${value}`);
  };

  return { fullnameOption, handleOpenUserDetails, users };
};

export default useCongregationBaptized;
