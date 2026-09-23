import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { IconCheck } from '@icons/index';
import QRCode from 'qrcode';
import Button from '@components/button';
import Dialog from '@components/dialog';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { play } from '../../haptics';
import { invoke, listen, nearby } from '../../native';
import { NearbyStatus, Peer, SessionStatus } from '../useNearby';
import { IconBluetooth, IconTap } from './icons';
import { PhoneRow, Pulse } from './parts';
import { describeItems, notify } from './text';

// ---- what a scanned QR code or an opened file contains ----

export const receive = async (text: string) => {
  try {
    if (text.startsWith('OTC1:')) {
      const peer = await invoke<Peer>('add_pairing_card', { text });
      nearby('paired');
      play('paired');
      notify(
        'Phone paired',
        `${peer.name || 'The other phone'} is paired. Now let it scan your code too.`
      );
    } else if (text.startsWith('OTB1:')) {
      const imported = await invoke<{
        name: string;
        received: number;
        items: Record<string, number>;
      }>('import_bundle', { text });
      play('synced');
      notify(
        `Received from ${imported.name}`,
        imported.received
          ? `You got ${describeItems(imported.items)}.`
          : 'Nothing new. You already had all of it.'
      );
    } else {
      notify(
        'Unknown code',
        'This code isn’t from the Territories app.',
        'error'
      );
    }
  } catch (error) {
    play('error');
    notify('Something went wrong', String(error), 'error');
  }
};

// ---- Meet: pairing with a phone anywhere in the room ----

export type PairMethod = 'nearby' | 'tap';

const centered = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  paddingBlock: '8px',
} as const;

const WAVE_MS = 4000;

export const MeetDialog = ({
  open,
  method,
  onClose,
  status,
  myName,
  onNamed,
}: {
  open: boolean;
  method: PairMethod;
  onClose: VoidFunction;
  status: NearbyStatus;
  myName: string;
  onNamed: VoidFunction;
}) => {
  const [tapped, setTapped] = useState<SessionStatus | null>(null);
  const [touching, setTouching] = useState(false);
  const [name, setName] = useState('');
  const needsName = open && !myName.trim();

  useEffect(() => {
    if (!open || needsName) return;
    setTapped(null);
    setTouching(false);
    nearby('meetStart');
    const stop = listen<SessionStatus | { state: 'touching' | 'apart' }>(
      'tap',
      (event) => {
        if (event.state === 'touching') setTouching(true);
        else if (event.state === 'apart') setTouching(false);
        else {
          setTouching(false);
          setTapped(event as SessionStatus);
        }
      }
    );
    return () => {
      nearby('meetStop');
      stop.then((unlisten) => unlisten());
    };
  }, [open, needsName]);

  const pairing = status.exchanges?.find((exchange) => exchange.mode === 1);
  const paired =
    status.lastDone && status.lastDone.at > Date.now() - 30_000
      ? status.lastDone
      : null;
  const seen = status.seen ?? [];
  const nfcOn = !!status.permissions?.nfcOn;
  const waiting =
    open && method === 'tap' && nfcOn && !touching && !tapped && !paired;

  // NFC: a ripple now and then, as if the phone were sending out waves
  useEffect(() => {
    if (!waiting) return;
    play('wave');
    const timer = setInterval(() => play('wave'), WAVE_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (open && seen.length) play('found');
  }, [open, seen.length]);

  useEffect(() => {
    if (pairing?.state === 'confirm') play('code');
    if (pairing?.state === 'failed') play('error');
  }, [pairing?.state]);

  useEffect(() => {
    if (paired && open) play('paired');
  }, [paired, open]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await invoke('set_name', { name: trimmed });
    onNamed();
  };

  const success = (who?: string) => (
    <Box sx={centered}>
      <Pulse icon={<IconCheck color="var(--green-main)" />} active={false} />
      <Typography className="h3" sx={{ textAlign: 'center' }}>
        Paired with {who || 'the other phone'}
      </Typography>
      <Typography
        className="body-regular"
        color="var(--grey-400)"
        sx={{ textAlign: 'center' }}
      >
        Your phones now sync by themselves whenever they are close. The first
        sync starts right away.
      </Typography>
    </Box>
  );

  const body = () => {
    if (needsName) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Typography className="body-regular">
            First, your name. The other phone shows it, so the other brother
            knows it’s you.
          </Typography>
          <TextField
            label="Your name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && saveName()}
          />
          <Button variant="main" disabled={!name.trim()} onClick={saveName}>
            Continue
          </Button>
        </Box>
      );
    }
    if (tapped?.state === 'done') return success(tapped.name);
    if (tapped?.state === 'failed') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconTap />} active />
          <Typography
            className="body-regular"
            sx={{ color: 'var(--red-main)', textAlign: 'center' }}
          >
            The phones moved apart too soon. Hold them together again, a little
            longer.
          </Typography>
        </Box>
      );
    }
    if (pairing?.state === 'confirm') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <Typography className="body-regular" sx={{ textAlign: 'center' }}>
            Does {pairing.name || 'the other phone'} show the same number?
          </Typography>
          <Typography
            className="h1"
            sx={{
              letterSpacing: '0.2em',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--accent-main)',
            }}
          >
            {pairing.code?.replace(/(\d{3})(\d{3})/, '$1 $2')}
          </Typography>
          <Box sx={{ display: 'flex', gap: '8px', width: '100%' }}>
            <Button
              variant="secondary"
              onClick={() => nearby('confirm', { accept: false })}
            >
              No
            </Button>
            <Button
              variant="main"
              onClick={() => nearby('confirm', { accept: true })}
            >
              Yes, it matches
            </Button>
          </Box>
        </Box>
      );
    }
    if (pairing?.state === 'connecting' || pairing?.state === 'exchanging') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconBluetooth />} active />
          <Typography className="body-regular">Connecting...</Typography>
        </Box>
      );
    }
    if (pairing?.state === 'failed') {
      return (
        <Typography className="body-regular" sx={{ color: 'var(--red-main)' }}>
          {pairing.reason}
        </Typography>
      );
    }
    if (paired) return success(paired.name);
    if (method === 'tap') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconTap />} active={nfcOn} />
          <Typography className="body-regular" sx={{ textAlign: 'center' }}>
            {!nfcOn
              ? 'NFC is off on this phone. Turn it on to pair by holding the phones together.'
              : touching
                ? 'Found it. Keep holding the phones together...'
                : 'Hold the backs of both phones together until they vibrate. The other brother opens this screen too.'}
          </Typography>
          {nfcOn && !touching && (
            <Typography
              className="label-small-regular"
              color="var(--grey-400)"
              sx={{ textAlign: 'center' }}
            >
              NFC needs no permission. Both phones stay unlocked with this
              screen open. The NFC spot is usually in the middle of the back,
              near the camera.
            </Typography>
          )}
          {!nfcOn && (
            <Button variant="main" onClick={() => nearby('nfcSettings')}>
              Open NFC settings
            </Button>
          )}
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Box sx={centered}>
          <Pulse icon={<IconBluetooth />} active />
          <Typography className="body-regular" sx={{ textAlign: 'center' }}>
            {seen.length
              ? 'Choose the other brother’s phone.'
              : 'Looking for phones... Ask the other brother to open this screen too.'}
          </Typography>
        </Box>
        {seen.map((phone) => (
          <PhoneRow
            key={phone.address}
            name={phone.name}
            detail="Nearby"
            onClick={() => nearby('pair', { address: phone.address })}
          />
        ))}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={method === 'tap' ? 'Pair by tapping' : 'Pair nearby'}
    >
      {method === 'nearby' &&
      status.permissions &&
      !status.permissions.bluetooth ? (
        <Button variant="main" onClick={() => nearby('permissions')}>
          Allow Bluetooth
        </Button>
      ) : (
        body()
      )}
      <Button variant="tertiary" onClick={onClose}>
        {tapped?.state === 'done' || paired ? 'Done' : 'Close'}
      </Button>
    </Dialog>
  );
};

// ---- QR codes: pairing and moving data without Bluetooth ----

const qrImage = {
  width: '100%',
  maxWidth: 360,
  imageRendering: 'pixelated',
} as const;

const QrImage = ({ text }: { text: string }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 720,
    }).then(setUrl);
  }, [text]);
  return url ? <img src={url} alt="" style={qrImage} /> : null;
};

// the scanner (ScanActivity.kt) collects every part before it hands the
// transfer back, so the loop just has to keep going
const QR_CHUNK = 400;
const QR_FPS = 5;

const AnimatedQr = ({ text }: { text: string }) => {
  const frames = useMemo(() => {
    const parts = Math.ceil(text.length / QR_CHUNK);
    return Array.from(
      { length: parts },
      (_, i) =>
        `OTQ:${i + 1}/${parts}:${text.slice(i * QR_CHUNK, (i + 1) * QR_CHUNK)}`
    );
  }, [text]);
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    Promise.all(
      frames.map((frame) =>
        QRCode.toDataURL(frame, {
          errorCorrectionLevel: 'L',
          margin: 2,
          width: 720,
        })
      )
    ).then(setImages);
  }, [frames]);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % images.length),
      1000 / QR_FPS
    );
    return () => clearInterval(timer);
  }, [images]);

  if (!images.length) {
    return <Typography className="body-regular">Preparing…</Typography>;
  }
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <img src={images[index]} alt="" style={qrImage} />
      <Typography
        className="label-small-regular"
        sx={{ color: 'var(--grey-400)' }}
      >
        {images.length > 1
          ? `Code ${index + 1} of ${images.length}, repeating`
          : 'One code'}
      </Typography>
    </Box>
  );
};

export const QrPairDialog = ({
  open,
  onClose,
  android,
}: {
  open: boolean;
  onClose: VoidFunction;
  android: boolean;
}) => {
  const [code, setCode] = useState('');
  useEffect(() => {
    if (open) invoke<string>('pairing_card').then(setCode);
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pair with a QR code"
      description="Scan each other’s code. Do this only with the brother next to you."
    >
      {code && <QrImage text={code} />}
      {android && (
        <Button variant="main" onClick={() => nearby('scanQr')}>
          Scan code
        </Button>
      )}
      <Button variant="tertiary" onClick={onClose}>
        Done
      </Button>
    </Dialog>
  );
};

export const QrSendDialog = ({
  peer,
  onClose,
}: {
  peer: Peer | null;
  onClose: VoidFunction;
}) => {
  const [bundle, setBundle] = useState('');
  useEffect(() => {
    setBundle('');
    if (peer)
      invoke<string>('export_bundle', { peer: peer.id }).then(setBundle);
  }, [peer]);
  const fileName = `territories-for-${(peer?.name || 'phone').replace(/\W+/g, '-').toLowerCase()}.territories`;
  return (
    <Dialog
      open={!!peer}
      onClose={onClose}
      title={`Send to ${peer?.name ?? ''}`}
      description={`On ${peer?.name || 'the other phone'}, open Settings, tap Scan QR codes and point the camera here until it’s done.`}
    >
      {bundle && <AnimatedQr text={bundle} />}
      <Button
        variant="secondary"
        onClick={() => nearby('shareFile', { name: fileName, text: bundle })}
      >
        Send as file
      </Button>
      <Button variant="tertiary" onClick={onClose}>
        Done
      </Button>
    </Dialog>
  );
};
