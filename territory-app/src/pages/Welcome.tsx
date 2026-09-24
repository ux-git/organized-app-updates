import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import { IconCheckCircle } from '@icons/index';
import Button from '@components/button';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { play } from '../haptics';
import { invoke, nearby } from '../native';
import { loadIdentity } from '../persistence';
import logo from '../assets/logo.svg?url';
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

const Row = ({
  title,
  text,
  ok,
}: {
  title: string;
  text: string;
  ok: boolean;
}) => (
  <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{title}</Typography>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {text}
      </Typography>
    </Box>
    {ok && <IconCheckCircle color="var(--green-main)" />}
  </Box>
);

/** First start: the name, and everything the phone has to allow, in one go. */
const Welcome = () => {
  const navigate = useNavigate();
  const { status, name: saved } = useNearby();
  const [name, setName] = useState('');
  const allowed = status.permissions;

  useEffect(() => {
    if (saved) setName(saved);
  }, [saved]);

  const all = !!(
    allowed?.bluetooth &&
    allowed.notifications &&
    allowed.camera &&
    allowed.battery
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
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingTop: '8px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <img src={logo} alt="" width={56} height={56} />
        <Box>
          <Typography className="h1">Welcome</Typography>
          <Typography className="body-regular" color="var(--grey-400)">
            Territories stay on your phones. They sync only with phones you
            pair, never over the internet.
          </Typography>
        </Box>
      </Box>

      <CardSection>
        <CardSectionHeader
          title="Your name"
          description="Paired phones show it, so the other brothers know it’s you."
        />
        <CardSectionContent>
          <TextField
            label="First and last name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
          />
        </CardSectionContent>
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title="Allow access once"
          description="Then your phone syncs by itself from now on, also with the app closed."
        />
        <Stack spacing="16px">
          <Row
            title="Bluetooth"
            text="Finds paired phones nearby and syncs with them."
            ok={!!allowed?.bluetooth}
          />
          <Row
            title="Notifications"
            text="Tells you when a sync is done."
            ok={!!allowed?.notifications}
          />
          <Row
            title="Camera"
            text="Scans a pairing QR code, when Bluetooth doesn’t work."
            ok={!!allowed?.camera}
          />
          {status.platform !== 'ios' && (
            <Row
              title="Run in the background"
              text="Lets Android start the sync by itself, also after a restart."
              ok={!!allowed?.battery}
            />
          )}
          {allowed?.nfc && (
            <Row
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
      </CardSection>

      <Button variant={all ? 'main' : 'tertiary'} onClick={finish}>
        {all ? 'Get started' : 'Skip for now'}
      </Button>
    </Box>
  );
};

export default Welcome;
