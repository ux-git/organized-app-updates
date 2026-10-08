import { Box } from '@mui/material';
import { useAtomValue } from 'jotai';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import Markup from '@components/text_markup';
import PageTitle from '@components/page_title';
import Dialog from '@components/dialog';
import Typography from '@components/typography';
import TerritoriesCard from './TerritoriesCard';
import AppCard from './AppCard';
import useNearby, { unsynced } from './useNearby';
import { welcomed } from './welcomeState';
import { hasNearby } from '../native';
import { suggestedLink } from '../persistence';
import { myLinkState, peopleState } from '../profiles';
import { t as tr } from '../i18n';

const Welcome = lazy(() => import('./Welcome'));

// The main app's dashboard, with only the territories card and the App card.
const Home = () => {
  const { t } = useAppTranslation();
  const { tablet688Up } = useBreakpoints();
  const navigate = useNavigate();
  const { peers, name, loaded } = useNearby();
  // first start: name and permissions on a card over the dashboard
  const [welcome, setWelcome] = useState(() => hasNearby() && !welcomed());
  const link = useAtomValue(myLinkState);
  const people = useAtomValue(peopleState);
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {welcome && (
        <Dialog open onClose={() => {}} sx={{ maxWidth: '560px' }}>
          <Suspense>
            <Welcome onDone={() => setWelcome(false)} />
          </Suspense>
        </Dialog>
      )}
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
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gridGap: '24px',
        }}
      >
        <TerritoriesCard />
        <AppCard />
      </Box>
    </Box>
  );
};

export default Home;
