import { ListItem } from '@mui/material';
import { useAtomValue } from 'jotai';
import {
  IconBackupOrganized,
  IconCalendarClock,
  IconCampaign,
  IconPerson,
  IconSynced,
  IconSettings,
} from '@icons/index';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';
import {
  campaignLabel,
  campaignsOn,
} from '@features/territories/campaign_dates';
import { appLocaleState } from '@states/app';
import { territoryCampaignsState } from '../campaigns';
import { t } from '../i18n';
import { count, when } from './sync/text';
import useBackup from './useBackup';
import useNearby, { unsynced } from './useNearby';
import usePeople from './usePeople';

// Organized's App card (PR 5377): sync, the app's own data and its settings
const AppCard = () => {
  const { peers, android } = useNearby();
  const people = usePeople();
  const backup = useBackup();
  const campaigns = useAtomValue(territoryCampaignsState);
  const locale = useAtomValue(appLocaleState);

  const running = campaignsOn(campaigns, new Date())[0];
  const pending = unsynced(peers);
  const last = peers.reduce<(typeof peers)[number] | undefined>(
    (latest, peer) =>
      (peer.last_sync ?? 0) > (latest?.last_sync ?? 0) ? peer : latest,
    undefined
  );
  const backupText = () => {
    if (!backup) return undefined;
    if (backup.error || (backup.folder && !backup.folderOk)) {
      return t('backup.cardError');
    }
    if (backup.last) {
      return t('backup.cardLast', { when: when(backup.last.at / 1000, true) });
    }
    return backup.frequency === 'off' ? t('backup.cardOff') : t('backup.none');
  };

  const syncText = () => {
    if (!peers.length) return t('settings.noPhones');
    const devices = count(peers.length, 'phones');
    if (!last?.last_sync) return t('settings.notSynced', { devices });
    return t('settings.lastContact', {
      devices,
      name: last.name || t('common.theOtherPhone'),
      when: when(last.last_sync, true),
    });
  };

  return (
    <DashboardCard header={t('settings.app')} sx={{ height: 'auto' }}>
      <ListItem disablePadding>
        <DashboardMenu
          icon={
            <IconSynced color="var(--black)" className="organized-sync-icon" />
          }
          primaryText={t('settings.sync')}
          secondaryText={syncText()}
          badgeText={pending ? String(pending) : undefined}
          path="/settings/sync"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconPerson color="var(--black)" />}
          primaryText={t('settings.publishers')}
          badgeText={String(people.length)}
          path="/settings/publishers"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconCampaign color="var(--black)" />}
          primaryText={t('settings.campaigns')}
          secondaryText={
            running ? campaignLabel(running, locale.code) : undefined
          }
          path="/settings/campaigns"
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu icon={<IconSettings color="var(--black)" />} primaryText={t('preferences.title')} path="/settings/preferences" />
      </ListItem>
      {android && (
        <ListItem disablePadding>
          <DashboardMenu
            icon={<IconCalendarClock color="var(--black)" />}
            primaryText={t('settings.automatic')}
            path="/settings/automatic"
          />
        </ListItem>
      )}
      {android && (
        <ListItem disablePadding>
          <DashboardMenu
            icon={<IconBackupOrganized color="var(--black)" />}
            primaryText={t('backup.title')}
            secondaryText={backupText()}
            path="/settings/backup"
          />
        </ListItem>
      )}
    </DashboardCard>
  );
};

export default AppCard;
