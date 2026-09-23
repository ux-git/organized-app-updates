import { Box } from '@mui/material';
import { useNavigate } from 'react-router';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import Markup from '@components/text_markup';
import PageTitle from '@components/page_title';
import Typography from '@components/typography';
import TerritoriesCard from './TerritoriesCard';
import SettingsCard from './SettingsCard';
import useNearby, { unsynced } from './useNearby';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The main app's dashboard, with only the territories card and this app's
// settings.
const Home = () => {
  const { t } = useAppTranslation();
  const { tablet688Up } = useBreakpoints();
  const navigate = useNavigate();
  const { peers, name } = useNearby();

  const firstName = name.trim().split(/\s+/)[0];
  const pending = unsynced(peers);
  const names = escape(
    peers.map((peer) => peer.name || 'a paired phone').join(', ')
  );

  const summary = () => {
    if (peers.length === 0) {
      return "<p>Territories stay on this phone. <a href='#'>Pair a phone</a> to share them.</p>";
    }
    if (pending > 0) {
      return `<p><a href='#'>${pending} ${pending === 1 ? 'change' : 'changes'}</a> waiting for ${names}</p>`;
    }
    return `<p>All synced with <a href='#'>${names}</a></p>`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle />
      <Box
        sx={{
          display: 'flex',
          alignItems: tablet688Up ? 'center' : 'flex-start',
          flexDirection: tablet688Up ? 'row' : 'column',
        }}
      >
        <Box>
          <Typography className="h1">
            {firstName ? t('tr_greeting', { firstName }) : 'Hello'} &#128075;
          </Typography>
          <Markup
            content={summary()}
            className="h3"
            anchorClassName="h3"
            anchorColor="var(--accent-main)"
            anchorClick={(event) => {
              event.preventDefault();
              navigate(peers.length ? '/sync' : '/sync?pair=nearby');
            }}
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gridGap: '24px',
        }}
      >
        <TerritoriesCard />
        <SettingsCard />
      </Box>
    </Box>
  );
};

export default Home;
