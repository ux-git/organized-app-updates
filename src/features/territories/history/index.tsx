import { useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate, useParams } from 'react-router';
import { useAtom } from 'jotai';
import { InfoNote } from '@components/index';
import { useBreakpoints, useCurrentUser } from '@hooks/index';
import { territoriesState } from '@states/territories';
import Card from '@components/card';
import AssignmentHistory from '../components/assignment_history';
import TerritoryHistory from './territory_history';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

const TerritoriesHistory = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { laptopUp } = useBreakpoints();

  const { isElder, isServiceCommittee } = useCurrentUser();
  const [territories, setTerritories] = useAtom(territoriesState);

  const onChange =
    isElder || isServiceCommittee
      ? (next: Territory) =>
          setTerritories((prev) =>
            prev.map((item) => (item.id === next.id ? next : item))
          )
      : undefined;

  const [picked, setPicked] = useState<string | undefined>();

  const selectedId = id ?? picked;
  const selected = territories.find((item) => item.id === selectedId);

  const handleSelect = (territoryId: string) => {
    if (laptopUp) {
      setPicked(territoryId);
      return;
    }

    navigate(`/territories/history/${territoryId}`, {
      state: { parent: 'Assignment history' },
    });
  };

  if (id && !laptopUp) {
    return selected ? (
      <TerritoryHistory territory={selected} onChange={onChange} />
    ) : (
      <InfoNote message={tx('This territory no longer exists.')} />
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          mobile: 'minmax(0, 1fr)',
          laptop: selected ? 'minmax(0, 1fr) 420px' : 'minmax(0, 1fr)',
        },
        gap: '16px',
        alignItems: 'start',
      }}
    >
      <Card>
        <AssignmentHistory
          territories={territories}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </Card>

      {laptopUp && selected && (
        <TerritoryHistory territory={selected} onChange={onChange} />
      )}
    </Box>
  );
};

export default TerritoriesHistory;
