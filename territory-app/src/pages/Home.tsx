import { Box, ListItem } from '@mui/material';
import { useAtomValue } from 'jotai';
import { Navigate, useNavigate } from 'react-router';
import { IconAdd, IconSynced } from '@icons/index';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import Markup from '@components/text_markup';
import PageTitle from '@components/page_title';
import Typography from '@components/typography';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';
import { territoriesState } from '@states/territories';
import TerritoriesCard from './TerritoriesCard';
import AppCard from './AppCard';
import useNearby, { unsynced } from './useNearby';
import { welcomed } from './Welcome';
import { hasNearby } from '../native';
import { suggestedLink } from '../persistence';
import { myLinkState, peopleState } from '../profiles';
import { t as tr } from '../i18n';

// First run: the territories come from the servant's device, or are added here
const NoTerritoriesCard = () => (
  <DashboardCard header={tr('territories.title')} sx={{ height: 'auto' }}>
    <ListItem sx={{ paddingInline: '16px !important' }}>
      <Typography className="body-regular" color="var(--grey-400)">
        {tr('home.empty')}
      </Typography>
    </ListItem>
    <ListItem disablePadding>
      <DashboardMenu
        icon={<IconSynced color="var(--black)" />}
        primaryText={tr('home.pairServant')}
        secondaryText={tr('home.pairServantText')}
        path="/settings/sync?pair=nearby"
      />
    </ListItem>
    <ListItem disablePadding>
      <DashboardMenu
        icon={<IconAdd color="var(--black)" />}
        primaryText={tr('home.addTerritory')}
        secondaryText={tr('home.addTerritoryText')}
        path="/territories/new"
      />
    </ListItem>
  </DashboardCard>
);

// The main app's dashboard, with only the territories card and the App card.
const Home = () => {
  const { t } = useAppTranslation();
  const { tablet688Up } = useBreakpoints();
  const navigate = useNavigate();
  const { peers, name, loaded } = useNearby();
  const link = useAtomValue(myLinkState);
  const people = useAtomValue(peopleState);
  // loaded before the pages show, so an empty list is really empty
  const territories = useAtomValue(territoriesState);
  // unlinked, "My territories" goes by this device's name
  const unlinked =
    loaded &&
    !link.person &&
    people.some((person) => !person.group) &&
    !suggestedLink(name, people);

  const firstName = name.trim().split(/\s+/)[0];
  const pending = unsynced(peers);
  const summary = () => {
    if (peers.length === 0) {
      return tr('home.alone');
    }
    // the status only: names don't scale to a large group
    if (pending > 0) return tr('home.pending', { count: pending });
    return tr('home.synced');
  };

  // first start: name and permissions before anything else
  if (hasNearby() && !welcomed()) return <Navigate to="/welcome" replace />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle />
      <Box
        sx={{
          display: 'flex',
          alignItems: tablet688Up ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexDirection: tablet688Up ? 'row' : 'column',
        }}
      >
        <Box>
          <Typography className="h1">
            {firstName ? t('tr_greeting', { firstName }) : tr('home.hello')}{' '}
            &#128075;
          </Typography>
          <Markup
            content={summary()}
            className="h3"
            anchorClassName="h3"
            anchorColor="var(--accent-main)"
            anchorClick={(event) => {
              event.preventDefault();
              navigate(
                peers.length ? '/settings/sync' : '/settings/sync?pair=nearby'
              );
            }}
          />
          {unlinked && (
            <Markup
              content={tr('home.link')}
              className="body-small-regular"
              anchorClassName="body-small-semibold"
              color="var(--grey-400)"
              anchorColor="var(--accent-main)"
              anchorClick={(event) => {
                event.preventDefault();
                navigate('/settings/profile');
              }}
            />
          )}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gridGap: '24px',
        }}
      >
        {territories.length ? <TerritoriesCard /> : <NoTerritoriesCard />}
        <AppCard />
      </Box>
    </Box>
  );
};

export default Home;
