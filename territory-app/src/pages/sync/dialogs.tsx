import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import QRCode from 'qrcode';
import Button from '@components/button';
import Dialog from '@components/dialog';
import Typography from '@components/typography';
import { displaySnackNotification } from '@services/states/app';
import { haptic } from '../../haptics';
import { invoke, listen, nearby } from '../../native';
import { NearbyStatus, Peer, SessionStatus } from '../useNearby';
import { IconBluetooth, IconTap } from './icons';
import { PhoneRow, Pulse } from './parts';

export const notify = (
  header: string,
  message: string,
  severity: 'success' | 'error' = 'success'
) => displaySnackNotification({ header, message, severity });

export const time = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const ago = (seconds: number | null) => {
  if (!seconds) return 'Never synced';
  const date = new Date(seconds * 1000);
  const today = new Date().toDateString() === date.toDateString();
  return `Synced ${today ? 'today' : date.toLocaleDateString()} at ${time(date)}`;
};

// ---- what a scanned QR code or an opened file contains ----

export const receive = async (text: string) => {
  try {
    if (text.startsWith('OTC1:')) {
      const peer = await invoke<Peer>('add_pairing_card', { text });
      nearby('paired');
      haptic('celebrate');
      notify(
        'Phone paired',
        `${peer.name || 'The other phone'} is paired. Now let it scan your code too.`
      );
    } else if (text.startsWith('OTB1:')) {
      const imported = await invoke<{ name: string; received: number }>(
        'import_bundle',
        { text }
      );
      haptic('celebrate');
      notify(
        'Changes received',
        `${imported.received} changes from ${imported.name} were added.`
      );
    } else {
      notify(
        'Unknown code',
        'This code isn’t from the Territories app.',
        'error'
      );
    }
  } catch (error) {
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

export const MeetDialog = ({
  open,
  method,
  onClose,
  status,
}: {
  open: boolean;
  method: PairMethod;
  onClose: VoidFunction;
  status: NearbyStatus;
}) => {
  const [tapped, setTapped] = useState<SessionStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    setTapped(null);
    nearby('meetStart');
    const stop = listen<SessionStatus>('tap', setTapped);
    return () => {
      nearby('meetStop');
      stop.then((unlisten) => unlisten());
    };
  }, [open]);

  const pairing = status.exchanges?.find((exchange) => exchange.mode === 1);
  const paired =
    status.lastDone && status.lastDone.at > Date.now() - 30_000
      ? status.lastDone
      : null;

  useEffect(() => {
    if (pairing?.state === 'confirm') haptic('tap');
  }, [pairing?.state]);

  useEffect(() => {
    if (paired && open) haptic('celebrate');
  }, [paired, open]);

  const body = () => {
    if (tapped?.state === 'done') {
      return (
        <Typography className="body-regular">
          Paired with {tapped.name}. Your phones now sync by themselves when
          they are close to each other.
        </Typography>
      );
    }
    if (tapped?.state === 'failed') {
      return (
        <Typography className="body-regular" sx={{ color: 'var(--red-main)' }}>
          Pairing didn&apos;t finish. Hold the phones together a little longer
          and try again.
        </Typography>
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
      return <Typography className="body-regular">Connecting...</Typography>;
    }
    if (pairing?.state === 'failed') {
      return (
        <Typography className="body-regular" sx={{ color: 'var(--red-main)' }}>
          {pairing.reason}
        </Typography>
      );
    }
    if (paired) {
      return (
        <Typography className="body-regular">
          Paired with {paired.name}. Your phones now sync by themselves when
          they are close to each other.
        </Typography>
      );
    }
    if (method === 'tap') {
      const on = status.permissions?.nfcOn;
      return (
        <Box sx={centered}>
          <Pulse icon={<IconTap />} active={!!on} />
          <Typography className="body-regular" sx={{ textAlign: 'center' }}>
            {on
              ? 'Hold the backs of both phones together until they vibrate. The other brother opens this screen too.'
              : 'NFC is off on this phone. Turn it on to pair by holding the phones together.'}
          </Typography>
          {!on && (
            <Button variant="main" onClick={() => nearby('nfcSettings')}>
              Open NFC settings
            </Button>
          )}
        </Box>
      );
    }
    const seen = status.seen ?? [];
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
        Close
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
