import { ReactElement, ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import {
  IconCheckCircle,
  IconLocation,
  IconNotifications,
  IconSync,
} from '@icons/index';
import Button from '@components/button';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { play } from '../haptics';
import { invoke, nearby } from '../native';
import { loadIdentity } from '../persistence';
import { IconBluetooth, IconQr, IconTap } from './sync/icons';
import { Actions } from './sync/parts';
import useNearby from './useNearby';

const KEY = 'territories-welcomed';

export const welcomed = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
};

const card = {
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--accent-200)',
  backgroundColor: 'var(--white)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
} as const;

/** A small round tile with an icon, as on the Sync page. */
const Tile = ({ icon, done }: { icon: ReactElement; done?: boolean }) => (
  <Box
    sx={{
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-m)',
      backgroundColor: done ? 'var(--green-secondary)' : 'var(--accent-150)',
      color: done ? 'var(--green-main)' : 'var(--accent-main)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'background-color 0.3s, color 0.3s',
      '& svg': { width: 22, height: 22 },
      '& svg path': { fill: 'currentColor' },
    }}
  >
    {icon}
  </Box>
);

/** A numbered step: its number, title, what it's for, and its content. */
const Step = ({
  number,
  title,
  text,
  done,
  children,
}: {
  number: number;
  title: string;
  text: string;
  done: boolean;
  children: ReactNode;
}) => (
  <Box sx={card}>
    <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: done ? 'var(--green-main)' : 'var(--accent-main)',
          color: 'var(--always-white)',
          transition: 'background-color 0.3s',
        }}
      >
        {done ? (
          <IconCheckCircle color="var(--always-white)" width={20} height={20} />
        ) : (
          <Typography className="body-small-semibold" color="inherit">
            {number}
          </Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography className="h3">{title}</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          {text}
        </Typography>
      </Box>
    </Box>
    {children}
  </Box>
);

const Access = ({
  icon,
  title,
  text,
  ok,
}: {
  icon: ReactElement;
  title: string;
  text: string;
  ok: boolean;
}) => (
  <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
    <Tile icon={icon} done={ok} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{title}</Typography>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {text}
      </Typography>
    </Box>
    {ok && <IconCheckCircle color="var(--green-main)" />}
  </Box>
);

const PROMISES = [
  { icon: <IconSync />, text: 'Syncs by itself when your phones meet' },
  { icon: <IconBluetooth />, text: 'Phone to phone, never over the internet' },
  { icon: <IconLocation />, text: 'Everything stays on your phones' },
];

/** First start: what the app is, your name, and what it needs, in one go. */
const Welcome = () => {
  const navigate = useNavigate();
  const { status, name: saved } = useNearby();
  const [name, setName] = useState('');
  const allowed = status.permissions;
  const ios = status.platform === 'ios';

  useEffect(() => {
    if (saved) setName(saved);
  }, [saved]);

  const all = !!(
    allowed?.bluetooth &&
    allowed.notifications &&
    allowed.camera &&
    (ios ? allowed.backgroundLocation : allowed.battery)
  );

  useEffect(() => {
    if (all) play('synced');
  }, [all]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === saved) return;
    await invoke('set_name', { name: trimmed });
    await loadIdentity();
  };

  const finish = async () => {
    await saveName();
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // shown again next time, no harm
    }
    navigate('/', { replace: true });
  };

  return (
    <Stack spacing="16px" sx={{ paddingTop: '8px', paddingBottom: '24px' }}>
      <Box
        sx={{
          ...card,
          padding: '24px 20px',
          gap: '20px',
        }}
      >
        <Box>
          <Typography className="h1">Welcome</Typography>
          <Typography className="body-regular" color="var(--grey-400)">
            Your congregation’s territories, on your phone and ready for the
            ministry.
          </Typography>
        </Box>
        <Stack spacing="12px">
          {PROMISES.map((promise) => (
            <Box
              key={promise.text}
              sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}
            >
              <Tile icon={promise.icon} />
              <Typography className="body-regular">{promise.text}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>

      <Step
        number={1}
        title="Your name"
        text="Paired phones show it, so the other brothers know it’s you."
        done={!!saved}
      >
        <TextField
          label="First and last name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
        />
      </Step>

      <Step
        number={2}
        title="Allow access once"
        text="Then your phone syncs by itself from now on, also with the app closed."
        done={all}
      >
        <Stack spacing="14px">
          <Access
            icon={<IconBluetooth />}
            title="Bluetooth"
            text="Finds paired phones nearby and syncs with them."
            ok={!!allowed?.bluetooth}
          />
          <Access
            icon={<IconNotifications />}
            title="Notifications"
            text="Tells you what a sync brought."
            ok={!!allowed?.notifications}
          />
          <Access
            icon={<IconQr />}
            title="Camera"
            text="Scans a pairing QR code, when Bluetooth doesn’t work."
            ok={!!allowed?.camera}
          />
          {ios ? (
            <Access
              icon={<IconLocation />}
              title="Location, always"
              text="Wakes the app when a paired Android phone or the Kingdom Hall is near. It stays on this phone."
              ok={!!allowed?.backgroundLocation}
            />
          ) : (
            <Access
              icon={<IconSync />}
              title="Run in the background"
              text="Lets Android start the sync by itself, also after a restart."
              ok={!!allowed?.battery}
            />
          )}
          {allowed?.nfc && (
            <Access
              icon={<IconTap />}
              title="NFC"
              text={
                allowed.nfcOn
                  ? 'Pairs two Android phones by holding them together.'
                  : 'Optional: turn it on to pair by holding two phones together.'
              }
              ok={!!allowed.nfcOn}
            />
          )}
        </Stack>
        <Actions
          actions={[
            ...(all
              ? []
              : [
                  {
                    label: 'Allow all',
                    kind: 'main' as const,
                    onClick: () => nearby('permissions', { which: 'all' }),
                  },
                ]),
            ...(allowed?.nfc && !allowed.nfcOn
              ? [{ label: 'Turn on NFC', onClick: () => nearby('nfcSettings') }]
              : []),
          ]}
        />
      </Step>

      {ios && (
        <Typography
          className="body-small-regular"
          color="var(--grey-400)"
          sx={{ paddingInline: '4px' }}
        >
          Keep Territories in the app switcher. If you swipe it away there, iOS
          stops waking it for a sync until you open it again.
        </Typography>
      )}

      <Button variant={all ? 'main' : 'secondary'} onClick={finish}>
        {all ? 'Get started' : 'Skip for now'}
      </Button>
    </Stack>
  );
};

export default Welcome;
