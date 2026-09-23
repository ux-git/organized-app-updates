import { useState } from 'react';
import { ListItem } from '@mui/material';
import {
  IconAccount,
  IconCalendarClock,
  IconLocation,
  IconPerson,
  IconSync,
} from '@icons/index';
import DashboardCard from '@features/dashboard/card';
import DashboardMenu from '@features/dashboard/menu';
import Switch from '@components/switch';
import { play } from '../haptics';
import { nearby } from '../native';
import PhoneNameDialog from './PhoneNameDialog';
import { missingForAutomatic } from './permissions';
import { when } from './sync/text';
import useNearby, { unsynced } from './useNearby';
import usePeople from './usePeople';

const SettingsCard = () => {
  const { peers, status, android, name, refreshPeers } = useNearby();
  const people = usePeople();
  const [naming, setNaming] = useState(false);

  const pending = unsynced(peers);
  const lastSync = Math.max(0, ...peers.map((peer) => peer.last_sync ?? 0));
  const schedule = status.schedule ?? {};
  const automatic = schedule.enabled !== false;
  const missing = missingForAutomatic(status);

  const syncText = () => {
    if (!peers.length) return 'No phones paired yet';
    const phones = peers.length === 1 ? '1 phone' : `${peers.length} phones`;
    return lastSync
      ? `${phones} · Last synced ${when(lastSync).replace(/^Today/, 'today')}`
      : `${phones} · Not synced yet`;
  };

  const automaticText = () => {
    if (!automatic) return 'Off';
    if (missing.length) return 'Almost ready: allow what it needs';
    return schedule.mode === 'meetings'
      ? 'Around meeting times'
      : 'All the time, in the background';
  };

  return (
    <DashboardCard header="Settings">
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconAccount color="var(--black)" />}
          primaryText="Your name"
          secondaryText={
            name || 'Add your name, so paired phones know it’s you'
          }
          onClick={() => setNaming(true)}
        />
      </ListItem>
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconSync color="var(--black)" />}
          primaryText="Sync"
          secondaryText={syncText()}
          badgeText={pending ? String(pending) : undefined}
          path="/sync"
        />
      </ListItem>
      {android && (
        <ListItem disablePadding>
          <DashboardMenu
            icon={<IconCalendarClock color="var(--black)" />}
            primaryText="Automatic sync"
            secondaryText={automaticText()}
            path="/settings/automatic"
            actionComponent={
              <Switch
                checked={automatic}
                onClick={(event) => event.stopPropagation()}
                onChange={(_, enabled) => {
                  play(enabled ? 'start' : 'remove');
                  nearby('schedule', { ...schedule, enabled });
                }}
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
            secondaryText={status.hall ? 'Location saved' : 'Optional'}
            path="/settings/hall"
          />
        </ListItem>
      )}
      <ListItem disablePadding>
        <DashboardMenu
          icon={<IconPerson color="var(--black)" />}
          primaryText="Publishers and groups"
          badgeText={String(people.length)}
          path="/publishers"
        />
      </ListItem>

      <PhoneNameDialog
        open={naming}
        name={name}
        onClose={() => {
          setNaming(false);
          refreshPeers();
        }}
      />
    </DashboardCard>
  );
};

export default SettingsCard;
