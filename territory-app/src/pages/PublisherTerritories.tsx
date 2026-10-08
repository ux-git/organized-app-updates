import { useAtomValue } from 'jotai';
import { useNavigate } from 'react-router';
import { Stack } from '@mui/material';
import { PageTitle } from '@components/index';
import Card from '@components/card';
import NavBarButton from '@components/nav_bar_button';
import { IconEdit } from '@icons/index';
import { useAppTranslation } from '@hooks/index';
import {
  territoriesWithStatusState,
  territoriesShowHouseholdsState,
} from '@states/territories';
import TerritoryTable from '@features/territories/components/territory_table';
import MyHistory from '@features/territories/components/my_history';
import type { Person } from '../persistence';
import { currentPublisherTerritories } from '../publisherView';

const NONE = new Set<string>();
const noop = () => {};

const PublisherTerritories = ({
  person,
  onEdit,
}: {
  person: Person;
  onEdit: VoidFunction;
}) => {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const territories = useAtomValue(territoriesWithStatusState);
  const households = useAtomValue(territoriesShowHouseholdsState);
  return (
    <>
      <PageTitle
        title={person.name}
        onBack={() => navigate('/settings/publishers')}
        buttons={
          <NavBarButton
            text={t('tr_edit')}
            icon={<IconEdit />}
            onClick={onEdit}
          />
        }
      />
      <Stack spacing="16px">
        <Card>
          <TerritoryTable
            territories={currentPublisherTerritories(territories, person.name)}
            title={t('tr_publisherCurrentTerritories')}
            checked={NONE}
            actions={false}
            showHolder={false}
            showHouseholds={households}
            showDoNotCalls
            onOpen={(id) =>
              navigate(`/territories/${id}`, { state: { parent: person.name } })
            }
            onCheck={noop}
            onCheckMany={noop}
            onOpenAssign={noop}
            onAssign={noop}
            onDecline={noop}
            onReturn={noop}
          />
        </Card>
        <Card sx={{ backgroundColor: 'var(--accent-150)' }}>
          <MyHistory
            key={person.id}
            territories={territories}
            publisher={person.name}
            title={t('tr_publisherPreviousTerritories')}
            parent={person.name}
          />
        </Card>
      </Stack>
    </>
  );
};
export default PublisherTerritories;
