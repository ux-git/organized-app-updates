import { ListItem } from '@mui/material';
import {
  IconCalendarClock,
  IconLocation,
  IconPerson,
  IconSync,
} from '@icons/index';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';
import Switch from '@components/switch';
import { nearby } from '../native';
import useNearby from './useNearby';
import usePeople from './usePeople';

const syncedAt = (seconds: number | null) => {
  if (!seconds) return undefined;
  const date = new Date(seconds * 1000);
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return new Date().toDateString() === date.toDateString()
    ? `Last synced today at ${time}`
    : `Last synced on ${date.toLocaleDateString()}`;
};

const SettingsCard = () => {
  const { peers, status, android } = useNearby();
  const people = usePeople();

  const pending = peers.reduce((sum, peer) => sum + peer.pending, 0);
  const lastSync = Math.max(0, ...peers.map((peer) => peer.last_sync ?? 0));
  const automatic = status.schedule?.enabled !== false;

  return (
    <DashboardCard header="Settings">
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconSync color="var(--black)" />}
          primaryText="Sync"
          secondaryText={
            peers.length
              ? (syncedAt(lastSync || null) ?? 'Not synced yet')
              : 'No phones paired yet'
          }
          badgeText={pending ? String(pending) : undefined}
          path="/sync"
        />
      </ListItem>
      {android && (
        <ListItem disablePadding>
          <DashboardMenu
            icon={<IconCalendarClock color="var(--black)" />}
            primaryText="Automatic sync"
            path="/settings?section=automatic"
            actionComponent={
              <Switch
                checked={automatic}
                onClick={(event) => event.stopPropagation()}
                onChange={(_, enabled) =>
                  nearby('schedule', { ...status.schedule, enabled })
                }
              />
            }
          />
        </ListItem>
      )}
      {android && (
        <ListItem disablePadding>
          <DashboardMenu
            icon={<IconLocation color="var(--black)" />}
            primaryText="Kingdom Hall"
            secondaryText={status.hall ? 'Location saved' : 'Not set'}
            path="/settings?section=hall"
          />
        </ListItem>
      )}
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconPerson color="var(--black)" />}
          primaryText="Publishers and groups"
          badgeText={String(people.length)}
          path="/settings?section=people"
        />
      </ListItem>
    </DashboardCard>
  );
};

export default SettingsCard;
