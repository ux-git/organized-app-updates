import { ListItem } from '@mui/material';
import { useAtomValue } from 'jotai';
import {
  IconAssignmetHistory,
  IconCancelCicle,
  IconMap,
  IconMapOverview,
  IconMapView,
  IconStatsYear,
} from '@icons/index';
import { territoriesState } from '@states/territories';
import { forTab } from '@features/territories/helpers';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';

// The main app's territories card without requests, and with the coverage
// map and do-not-calls on phones too.
const TerritoriesCard = () => {
  const territories = useAtomValue(territoriesState);

  const mine = forTab(territories, 'mine').length;
  const doNotCalls = territories.reduce(
    (sum, territory) => sum + territory.doNotCalls.length,
    0
  );

  return (
    <DashboardCard header="Territories">
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMap color="var(--black)" />}
          primaryText="My territories"
          badgeText={String(mine)}
          path="/territories?tab=mine"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMapOverview color="var(--black)" />}
          primaryText="All territories"
          badgeText={String(territories.length)}
          path="/territories?tab=all"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMapView color="var(--black)" />}
          primaryText="Coverage map"
          path="/territories/map"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconCancelCicle color="var(--black)" />}
          primaryText="Do not call"
          badgeText={String(doNotCalls)}
          path="/territories/do-not-calls"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconAssignmetHistory color="var(--black)" />}
          primaryText="Assignment history"
          path="/territories/history"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconStatsYear color="var(--black)" />}
          primaryText="Statistics"
          path="/territories/statistics"
        />
      </ListItem>
    </DashboardCard>
  );
};

export default TerritoriesCard;
