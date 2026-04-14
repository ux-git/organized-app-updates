import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { formatNameInAppState } from '@states/settings';
import { congregationsPersonsState } from '@states/congregation';

const useCongregationPersons = () => {
  const navigate = useNavigate();

  const fullnameOption = useAtomValue(formatNameInAppState);
  const users = useAtomValue(congregationsPersonsState);

  const handleOpenUserDetails = (value: string) => {
    navigate(`/manage-access/${value}`);
  };

  return { fullnameOption, handleOpenUserDetails, users };
};

export default useCongregationPersons;
