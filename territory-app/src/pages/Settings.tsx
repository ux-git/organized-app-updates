import { Navigate, useNavigate, useParams } from 'react-router';
import { Box } from '@mui/material';
import PageTitle from '@components/page_title';
import { useBreakpoints } from '@hooks/index';
import { t } from '../i18n';
import AutomaticSection from './sync/AutomaticSection';
import Backup from './Backup';
import Campaigns from './Campaigns';
import KingdomHall from './KingdomHall';
import Profile from './Profile';
import Preferences from './Preferences';
import Publishers from './Publishers';
import Sync from './Sync';
import useNearby from './useNearby';

// Each setting is its own page, opened from the account menu or the App card
const Settings = () => {
  const { tab: selectedTab, publisherId } = useParams();
  const tab = publisherId ? 'publishers' : selectedTab;
  const navigate = useNavigate();
  const { tablet688Up } = useBreakpoints();
  const { status, android } = useNearby();

  const titles: Record<string, string> = {
    profile: t('account.profile'),
    preferences: t('preferences.title'),
    sync: t('settings.syncTab'),
    publishers: t('settings.publishers'),
    campaigns: t('settings.campaigns'),
    ...(android
      ? { automatic: t('settings.automatic'), backup: t('backup.title') }
      : {}),
  };

  if (!tab || !titles[tab]) return <Navigate to="/" replace />;

  const title = { title: titles[tab], onBack: () => navigate('/') };

  if (tab === 'publishers' || tab === 'campaigns') {
    return (
      // the page buttons float over the bottom of a phone screen
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          paddingBottom: tablet688Up ? 0 : '120px',
        }}
      >
        {tab === 'publishers' && <Publishers title={title} />}
        {tab === 'campaigns' && <Campaigns title={title} />}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle {...title} />
      {tab === 'profile' && <Profile />}
      {tab === 'preferences' && <Preferences />}
      {tab === 'sync' && <Sync />}
      {tab === 'backup' && <Backup />}
      {tab === 'automatic' && (
        <>
          <AutomaticSection status={status} />
          <KingdomHall status={status} />
        </>
      )}
    </Box>
  );
};

export default Settings;
