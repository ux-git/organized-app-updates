import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { IconCheck } from '@icons/index';
import QRCode from 'qrcode';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { play } from '../../haptics';
import { invoke, listen, nearby } from '../../native';
import { NearbyStatus, Peer, SessionStatus } from '../useNearby';
import { IconBluetooth, IconTap } from './icons';
import { PhoneRow, Pulse } from './parts';
import { t } from '../../i18n';
import { describeItems, notify } from './text';
import { BACKUP_PREFIX, restoreBackup } from '../useBackup';

// ---- what a scanned QR code or an opened file contains ----

export const receive = async (text: string) => {
  try {
    if (text.startsWith('OTC1:')) {
      const peer = await invoke<Peer>('add_pairing_card', { text });
      nearby('paired');
      play('paired');
      notify(
        t('receive.paired'),
        t('receive.pairedText', {
          name: peer.name || t('common.theOtherPhone'),
        })
      );
    } else if (text.startsWith('OTB1:')) {
      const imported = await invoke<{
        name: string;
        received: number;
        items: Record<string, number>;
      }>('import_bundle', { text });
      play('synced');
      notify(
        t('receive.from', { name: imported.name }),
        imported.received
          ? t('receive.got', { items: describeItems(imported.items) })
          : t('receive.nothing')
      );
    } else if (text.startsWith(BACKUP_PREFIX)) {
      await restoreBackup(text);
    } else {
      notify(t('receive.unknown'), t('receive.unknownText'), 'error');
    }
  } catch (error) {
    play('error');
    notify(t('common.somethingWrong'), String(error), 'error');
  }
};

// ---- Meet: pairing with a phone anywhere in the room ----

export type PairMethod = 'nearby' | 'tap';

const centered = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '16px',
  width: '100%',
  paddingBlock: '8px',
} as const;

const column = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  width: '100%',
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
  const [savingName, setSavingName] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const needsName = open && !myName.trim();

  useEffect(() => {
    if (!open || needsName) return;
    setTapped(null);
    setTouching(false);
    nearby('meetStart');
    const stop = listen<SessionStatus | { state: 'touching' | 'apart' }>(
      'tap',
      (event) => {
        if (event.state === 'touching') {
          setTouching(true);
          setTapped((previous) =>
            previous?.state === 'failed' ? null : previous
          );
        } else if (event.state === 'apart') setTouching(false);
        else {
          setTouching(false);
          // the phones stay together a moment after pairing; keep the success
          setTapped((previous) =>
            previous?.state === 'done' ? previous : (event as SessionStatus)
          );
        }
      }
    );
    return () => {
      nearby('meetStop');
      stop.then((unlisten) => unlisten());
    };
  }, [open, needsName]);

  // a pairing counts only once this dialog is open, not an earlier sync
  const openedAt = useRef(0);
  if (open && !openedAt.current) openedAt.current = Date.now();
  if (!open) openedAt.current = 0;

  const exchange = status.exchanges?.find((item) => item.mode === 1);
  // a failure stays in the status; Try again hides it and looks again
  const failure = exchange?.state === 'failed' ? JSON.stringify(exchange) : '';
  const pairing = failure && failure === dismissed ? undefined : exchange;
  const paired =
    open && status.lastDone && status.lastDone.at >= openedAt.current
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

  // paired: the dialog has done its job, a snackbar says so
  const pairedName =
    tapped?.state === 'done' ? tapped.name : paired ? paired.name : undefined;
  const pairedNow = open && (tapped?.state === 'done' || !!paired);

  useEffect(() => {
    if (!pairedNow) return;
    play('paired');
    notify(
      t('meet.pairedWith', { name: pairedName || t('common.theOtherPhone') }),
      t('meet.pairedText')
    );
    onClose();
  }, [pairedNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || savingName) return;
    setSavingName(true);
    try {
      await invoke('set_name', { name: trimmed });
      onNamed();
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    } finally {
      setSavingName(false);
    }
  };

  const tryAgain = () => {
    setDismissed(failure);
    nearby('meetStart');
  };

  const success = (who?: string) => (
    <Box sx={centered}>
      <Pulse icon={<IconCheck color="var(--green-main)" />} active={false} />
      <Typography className="h3">
        {t('meet.pairedWith', { name: who || t('common.theOtherPhone') })}
      </Typography>
      <Typography className="body-regular" color="var(--grey-400)">
        {t('meet.pairedText')}
      </Typography>
    </Box>
  );

  const body = () => {
    if (needsName) {
      return (
        <Box sx={column}>
          <Typography className="body-regular">
            {t('meet.nameFirst')}
          </Typography>
          <TextField
            label={t('common.fullName')}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && saveName()}
          />
        </Box>
      );
    }
    if (tapped?.state === 'done') return success(tapped.name);
    if (tapped?.state === 'failed') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconTap />} active={false} />
          <Typography className="body-regular" color="var(--red-main)">
            {t('meet.tapFailed')}
          </Typography>
        </Box>
      );
    }
    if (pairing?.state === 'confirm') {
      return (
        <Box sx={centered}>
          <Typography className="body-regular">
            {t('meet.sameNumber', {
              name: pairing.name || t('common.theOtherPhone'),
            })}
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
        </Box>
      );
    }
    if (pairing?.state === 'connecting' || pairing?.state === 'exchanging') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconBluetooth />} active />
          <Typography className="body-regular">
            {t('meet.connecting')}
          </Typography>
        </Box>
      );
    }
    if (pairing?.state === 'failed') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconBluetooth />} active={false} />
          <Typography className="body-regular" color="var(--red-main)">
            {t('meet.failed')}
          </Typography>
        </Box>
      );
    }
    if (paired) return success(paired.name);
    if (method === 'tap') {
      return (
        <Box sx={centered}>
          <Pulse icon={<IconTap />} active={nfcOn} />
          <Typography className="body-regular">
            {!nfcOn
              ? t('meet.nfcOff')
              : touching
                ? t('meet.touching')
                : t('meet.hold')}
          </Typography>
          {nfcOn && !touching && (
            <Typography className="label-small-regular" color="var(--grey-400)">
              {t('meet.nfcHint')}
            </Typography>
          )}
        </Box>
      );
    }
    return (
      <Box sx={column}>
        <Box sx={centered}>
          <Pulse icon={<IconBluetooth />} active />
          <Typography className="body-regular">
            {seen.length ? t('meet.choose') : t('meet.looking')}
          </Typography>
        </Box>
        {seen.map((phone) => (
          <PhoneRow
            key={phone.address}
            name={phone.name}
            detail={t('sync.nearby')}
            onClick={() => nearby('pair', { address: phone.address })}
          />
        ))}
      </Box>
    );
  };

  const needsBluetooth =
    method === 'nearby' && status.permissions && !status.permissions.bluetooth;
  const done = tapped?.state === 'done' || !!paired;

  const main = () => {
    if (needsName) {
      return (
        <Button
          variant="main"
          disabled={!name.trim() || savingName}
          onClick={saveName}
        >
          {t('common.continue')}
        </Button>
      );
    }
    if (needsBluetooth) {
      return (
        <Button variant="main" onClick={() => nearby('permissions')}>
          {t('common.allowBluetooth')}
        </Button>
      );
    }
    if (pairing?.state === 'failed') {
      return (
        <Button variant="main" onClick={tryAgain}>
          {t('common.tryAgain')}
        </Button>
      );
    }
    if (pairing?.state === 'confirm') {
      return (
        <Button
          variant="main"
          onClick={() => nearby('confirm', { accept: true })}
        >
          {t('meet.matches')}
        </Button>
      );
    }
    if (method === 'tap' && !nfcOn && !done) {
      return (
        <Button variant="main" onClick={() => nearby('nfcSettings')}>
          {t('meet.nfcSettings')}
        </Button>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={method === 'tap' ? t('meet.titleTap') : t('meet.titleNearby')}
    >
      {needsBluetooth ? (
        <Typography className="body-regular">
          {t('common.bluetoothText')}
        </Typography>
      ) : (
        body()
      )}
      <DialogActions>
        {pairing?.state === 'confirm' && !needsName ? (
          <Button
            variant="secondary"
            onClick={() => nearby('confirm', { accept: false })}
          >
            {t('meet.no')}
          </Button>
        ) : (
          <Button variant={done ? 'main' : 'secondary'} onClick={onClose}>
            {done ? t('common.done') : t('common.cancel')}
          </Button>
        )}
        {main()}
      </DialogActions>
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
    setUrl('');
    if (!text) return;
    let current = true;
    QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 720,
    }).then((next: string) => current && setUrl(next));
    return () => {
      current = false;
    };
  }, [text]);
  if (!url) {
    return (
      <Typography className="body-regular">{t('qr.preparing')}</Typography>
    );
  }
  return <img src={url} alt="" style={qrImage} />;
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
    let current = true;
    Promise.all(
      frames.map((frame) =>
        QRCode.toDataURL(frame, {
          errorCorrectionLevel: 'L',
          margin: 2,
          width: 720,
        })
      )
    ).then((next: string[]) => {
      if (!current) return;
      setIndex(0);
      setImages(next);
    });
    return () => {
      current = false;
    };
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
    return (
      <Typography className="body-regular">{t('qr.preparing')}</Typography>
    );
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
          ? t('qr.codeOf', { index: index + 1, total: images.length })
          : t('qr.oneCode')}
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
    if (!open) return;
    let current = true;
    invoke<string>('pairing_card')
      .then((next) => current && setCode(next))
      .catch((error) =>
        notify(t('common.somethingWrong'), String(error), 'error')
      );
    return () => {
      current = false;
    };
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('qr.pairTitle')}
      description={t('qr.pairText')}
    >
      <QrImage text={code} />
      <DialogActions>
        <Button variant={android ? 'secondary' : 'main'} onClick={onClose}>
          {t('common.done')}
        </Button>
        {android && (
          <Button variant="main" onClick={() => nearby('scanQr')}>
            {t('qr.scanCode')}
          </Button>
        )}
      </DialogActions>
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
    if (!peer) return;
    let current = true;
    invoke<string>('export_bundle', { peer: peer.id })
      .then((next) => current && setBundle(next))
      .catch((error) =>
        notify(t('common.somethingWrong'), String(error), 'error')
      );
    return () => {
      current = false;
    };
  }, [peer]);
  const peerName = peer?.name || t('common.theOtherPhone');
  return (
    <Dialog
      open={!!peer}
      onClose={onClose}
      title={t('qr.sendTitle', { name: peerName })}
      description={t('qr.sendText', { name: peerName })}
    >
      <AnimatedQr text={bundle} />
      <DialogActions>
        <Button variant="main" onClick={onClose}>
          {t('common.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
