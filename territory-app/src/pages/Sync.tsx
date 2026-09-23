import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Box, IconButton, Stack } from '@mui/material';
import { IconDelete, IconSync } from '@icons/index';
import Button from '@components/button';
import PageTitle from '@components/page_title';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, listen, nearby } from '../native';
import useNearby, { Peer, unsynced } from './useNearby';
import { play } from '../haptics';
import {
  MeetDialog,
  PairMethod,
  QrPairDialog,
  QrSendDialog,
  receive,
} from './sync/dialogs';
import { confirm } from './confirm';
import Decisions from './sync/Decisions';
import History from './sync/History';
import { ago, time } from './sync/text';
import { IconBluetooth, IconFile, IconQr, IconTap } from './sync/icons';
import { Method, MethodState, PhoneRow, Pulse } from './sync/parts';

const READY: MethodState = { text: 'Ready', color: 'green' };

const Sync = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { peers, status, name, refreshPeers, android } = useNearby();
  const [pairing, setPairing] = useState<PairMethod | null>(null);
  const [qrPairOpen, setQrPairOpen] = useState(false);
  const [sendTo, setSendTo] = useState<Peer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const permissions = status.permissions;
  const pending = unsynced(peers);
  const lastSync = Math.max(0, ...peers.map((peer) => peer.last_sync ?? 0));
  const syncing = status.exchanges?.find(
    (exchange) => exchange.mode === 0 && exchange.state === 'exchanging'
  );
  const automatic = status.schedule?.enabled !== false;

  useEffect(() => {
    const stops = [
      listen<{ text: string }>('qr', ({ text }) =>
        receive(text).then(refreshPeers)
      ),
      listen<{ text: string }>('file', ({ text }) =>
        receive(text).then(refreshPeers)
      ),
    ];
    nearby('takeFile');
    return () => stops.forEach((stop) => stop.then((unlisten) => unlisten()));
  }, [refreshPeers]);

  // links from notifications and the launcher shortcuts
  useEffect(() => {
    if (params.get('now')) nearby('syncNow');
    const pair = params.get('pair');
    if (pair === 'nearby' || pair === 'tap') setPairing(pair);
    if (params.size) setParams({}, { replace: true });
  }, [params, setParams]);

  const bluetooth: MethodState = !android
    ? { text: 'Phone app only', color: 'grey' }
    : !permissions?.bluetooth
      ? { text: 'Needs permission', color: 'orange' }
      : permissions.bluetoothOn === false
        ? { text: 'Bluetooth is off', color: 'orange' }
        : READY;
  const bluetoothReady = bluetooth === READY;

  const nfc: MethodState = !permissions?.nfc
    ? { text: 'Not on this phone', color: 'grey' }
    : permissions.nfcOn
      ? READY
      : { text: 'NFC is off', color: 'orange' };

  const camera: MethodState =
    !android || permissions?.camera
      ? READY
      : { text: 'Needs camera', color: 'orange' };

  const fixBluetooth = () =>
    nearby(permissions?.bluetooth ? 'bluetoothOn' : 'permissions');

  const hero = () => {
    if (peers.length === 0) {
      return {
        title: 'No phones paired yet',
        text: 'Pair the other territory servant’s phone once. After that, your phones sync by themselves.',
      };
    }
    if (syncing) {
      return {
        title: 'Syncing...',
        text: 'Keep the phones close for a moment.',
      };
    }
    const last = lastSync ? ago(lastSync) : 'Never synced';
    if (pending > 0) {
      return {
        title: `${pending} ${pending === 1 ? 'change' : 'changes'} to send`,
        text: `${last}. They go out the next time a paired phone is close.`,
      };
    }
    return { title: 'All synced', text: last };
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await receive((await file.text()).trim());
    refreshPeers();
  };

  const sendFile = async (peer: Peer) => {
    const text = await invoke<string>('export_bundle', { peer: peer.id });
    const slug = (peer.name || 'phone').replace(/\W+/g, '-').toLowerCase();
    nearby('shareFile', { name: `territories-for-${slug}.territories`, text });
  };

  const removePeer = async (peer: Peer) => {
    const ok = await confirm({
      title: `Unpair ${peer.name || 'this phone'}?`,
      description:
        'Your phones stop syncing with each other. What it already sent stays on this phone.',
      action: 'Unpair',
    });
    if (!ok) return;
    play('remove');
    await invoke('remove_peer', { id: peer.id });
    refreshPeers();
  };

  const syncNow = () => {
    play('start');
    nearby('syncNow');
  };

  const nameOf = (id?: string | null) =>
    peers.find((peer) => peer.id === id)?.name || 'a paired phone';

  // one paired phone is the usual case; with more, the first is offered
  const target = peers[0];
  const { title, text } = hero();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Sync" />

      <Box
        sx={{
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--accent-300)',
          background:
            'linear-gradient(135deg, var(--accent-150) 0%, var(--white) 70%)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Pulse
            icon={<IconSync color="var(--accent-main)" />}
            active={status.running || !!syncing}
            size={64}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography className="h2">{title}</Typography>
            <Typography className="body-small-regular" color="var(--grey-400)">
              {text}
            </Typography>
          </Box>
        </Box>
        {android && (
          <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {peers.length === 0 ? (
              <Button
                variant="main"
                disableAutoStretch
                onClick={() =>
                  bluetoothReady ? setPairing('nearby') : fixBluetooth()
                }
              >
                {bluetoothReady ? 'Pair a phone' : 'Allow Bluetooth'}
              </Button>
            ) : (
              <Button
                variant="main"
                disableAutoStretch
                disabled={!!syncing}
                onClick={() => (bluetoothReady ? syncNow() : fixBluetooth())}
              >
                {bluetoothReady ? 'Sync now' : 'Allow Bluetooth'}
              </Button>
            )}
            <Button
              variant="secondary"
              disableAutoStretch
              onClick={() => navigate('/settings/automatic')}
            >
              {automatic ? 'Automatic sync on' : 'Automatic sync off'}
            </Button>
          </Box>
        )}
        {status.running && status.until && !syncing && (
          <Typography className="label-small-regular" color="var(--grey-400)">
            Looking for paired phones nearby until{' '}
            {time(new Date(status.until))}
          </Typography>
        )}
      </Box>

      {peers.length > 0 && (
        <CardSection>
          <CardSectionHeader
            title="Paired phones"
            description="Territories only go to these phones: the ones you paired in person, and the ones they paired with. All of them sync with each other."
          />
          <CardSectionContent spacing="4px" divider={undefined}>
            {peers.map((peer) => (
              <PhoneRow
                key={peer.id}
                name={peer.name || 'Unnamed phone'}
                detail={[
                  peer.introduced_by &&
                    `Joined through ${nameOf(peer.introduced_by)}`,
                  ago(peer.last_sync),
                  peer.last_sync &&
                    peer.pending > 0 &&
                    `${peer.pending} ${peer.pending === 1 ? 'change' : 'changes'} to send`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <IconButton
                    aria-label={`Unpair ${peer.name}`}
                    onClick={() => removePeer(peer)}
                  >
                    <IconDelete color="var(--red-main)" />
                  </IconButton>
                }
              />
            ))}
          </CardSectionContent>
        </CardSection>
      )}

      <Decisions />

      <CardSection>
        <CardSectionHeader
          title="Pair a phone"
          description="Pair once, with the other brother next to you. Pick the first way that works for both phones."
        />
        <Stack spacing="12px">
          <Method
            recommended
            icon={<IconBluetooth />}
            title="Nearby"
            description="Works anywhere in the same room. You both check that the phones show the same 6-digit number."
            state={bluetooth}
            actions={[
              bluetoothReady
                ? {
                    label: 'Pair',
                    main: true,
                    onClick: () => setPairing('nearby'),
                  }
                : {
                    label: permissions?.bluetooth ? 'Turn on' : 'Allow',
                    main: true,
                    disabled: !android,
                    onClick: fixBluetooth,
                  },
            ]}
          />
          <Method
            icon={<IconTap />}
            title="Tap phones"
            description="Hold the backs of both Android phones together. No number to check. NFC needs no permission, it only has to be on."
            state={nfc}
            actions={
              permissions?.nfc
                ? [
                    permissions.nfcOn
                      ? { label: 'Pair', onClick: () => setPairing('tap') }
                      : {
                          label: 'Turn on',
                          onClick: () => nearby('nfcSettings'),
                        },
                  ]
                : []
            }
          />
          <Method
            icon={<IconQr />}
            title="QR code"
            description="Each phone scans the other’s code. Works on every phone, also without Bluetooth."
            state={camera}
            actions={[
              camera === READY
                ? { label: 'Show my code', onClick: () => setQrPairOpen(true) }
                : {
                    label: 'Allow camera',
                    onClick: () => nearby('permissions', { which: 'camera' }),
                  },
            ]}
          />
        </Stack>
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title="Share without Bluetooth"
          description="If Bluetooth doesn’t work, move your changes to a paired phone another way. It only works between paired phones."
        />
        <Stack spacing="12px">
          <Method
            icon={<IconQr />}
            title="QR codes"
            description="Your changes play as a loop of QR codes. The other phone films them until they’re all read."
            actions={[
              ...(target
                ? [{ label: 'Send', onClick: () => setSendTo(target) }]
                : []),
              ...(android
                ? [{ label: 'Scan', onClick: () => nearby('scanQr') }]
                : []),
            ]}
          />
          <Method
            icon={<IconFile />}
            title="File"
            description="Send a file with Quick Share, AirDrop or any other app, then open it on the other phone."
            actions={[
              ...(target && android
                ? [{ label: 'Send', onClick: () => sendFile(target) }]
                : []),
              { label: 'Open file', onClick: () => fileInput.current?.click() },
            ]}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".territories"
            hidden
            onChange={openFile}
          />
        </Stack>
      </CardSection>

      <History />

      <MeetDialog
        open={!!pairing}
        method={pairing ?? 'nearby'}
        onClose={() => setPairing(null)}
        status={status}
        myName={name}
        onNamed={refreshPeers}
      />
      <QrPairDialog
        open={qrPairOpen}
        onClose={() => setQrPairOpen(false)}
        android={android}
      />
      <QrSendDialog peer={sendTo} onClose={() => setSendTo(null)} />
    </Box>
  );
};

export default Sync;
