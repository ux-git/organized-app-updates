import { ListItem } from '@mui/material';
import {
  IconAssignmetHistory,
  IconCancelCicle,
  IconMap,
  IconMapOverview,
  IconMapView,
  IconStatsYear,
} from '@icons/index';
import useTerritoryTabList from '@features/territories/useTerritoryTabList';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';
import { t } from '../i18n';

// The main app's territories card without requests, and with the coverage
// map and do-not-calls on phones too.
const TerritoriesCard = () => {
  const { territories, selectTab } = useTerritoryTabList();
  const mine = selectTab('mine').length;
  const doNotCalls = territories.reduce(
    (sum, territory) => sum + territory.doNotCalls.length,
    0
  );

  return (
    // grows with its rows; the grid keeps both cards the same height
    <DashboardCard header={t('territories.title')} sx={{ height: 'auto' }}>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMap color="var(--black)" />}
          primaryText={t('territories.mine')}
          badgeText={String(mine)}
          path="/territories?tab=mine"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMapOverview color="var(--black)" />}
          primaryText={t('territories.all')}
          badgeText={String(selectTab('all').length)}
          path="/territories?tab=all"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconCancelCicle color="var(--black)" />}
          primaryText={t('territories.doNotCall')}
          badgeText={String(doNotCalls)}
          path="/territories/do-not-calls"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconMapView color="var(--black)" />}
          primaryText={t('territories.map')}
          path="/territories/map"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconAssignmetHistory color="var(--black)" />}
          primaryText={t('territories.history')}
          path="/territories/history"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconStatsYear color="var(--black)" />}
          primaryText={t('territories.statistics')}
          path="/territories/statistics"
        />
      </ListItem>
    </DashboardCard>
  );
};

export default TerritoriesCard;
