import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box, Chip, IconButton, MenuItem, Select, Switch } from '@mui/material';
import QRCode from 'qrcode';
import { IconAdd, IconDelete } from '@icons/index';
import Button from '@components/button';
import Dialog from '@components/dialog';
import PageTitle from '@components/page_title';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { displaySnackNotification } from '@services/states/app';
import { haptic } from '../haptics';
import { invoke, listen, nearby } from '../native';
import { loadPeople, PEOPLE, Person, writeRows } from '../persistence';
import useNearby, { Meeting, NearbyStatus, Peer } from './useNearby';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const card = {
  border: '1px solid var(--accent-300)',
  borderRadius: 'var(--radius-xl)',
  backgroundColor: 'var(--white)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
} as const;

const notify = (
  header: string,
  message: string,
  severity: 'success' | 'error' = 'success'
) => displaySnackNotification({ header, message, severity });

const time = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ago = (seconds: number | null) => {
  if (!seconds) return 'Never synced';
  const date = new Date(seconds * 1000);
  const today = new Date().toDateString() === date.toDateString();
  return `Synced ${today ? 'today' : date.toLocaleDateString()} at ${time(date)}`;
};

// ---- what a scanned QR code or an opened file contains ----

const receive = async (text: string) => {
  try {
    if (text.startsWith('OTC1:')) {
      const peer = await invoke<Peer>('add_pairing_card', { text });
      nearby('paired');
      haptic('celebrate');
      notify(
        'Paired',
        `${peer.name || 'The other phone'} is paired. Now let it scan this phone's code.`
      );
    } else if (text.startsWith('OTB1:')) {
      const imported = await invoke<{ name: string; received: number }>(
        'import_bundle',
        { text }
      );
      haptic('celebrate');
      notify(
        'Transfer received',
        `${imported.received} changes from ${imported.name}.`
      );
    } else {
      notify(
        'Not a territory code',
        'This code is not from the Territories app.',
        'error'
      );
    }
  } catch (error) {
    notify('Could not use it', String(error), 'error');
  }
};

// ---- Meet: pairing with a phone anywhere in the room ----

const MeetDialog = ({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: VoidFunction;
  status: NearbyStatus;
}) => {
  useEffect(() => {
    if (!open) return;
    nearby('meetStart');
    return () => nearby('meetStop');
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
              Different
            </Button>
            <Button
              variant="main"
              onClick={() => nearby('confirm', { accept: true })}
            >
              Same number
            </Button>
          </Box>
        </Box>
      );
    }
    if (pairing?.state === 'connecting' || pairing?.state === 'exchanging') {
      return <Typography className="body-regular">Connecting…</Typography>;
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
          Paired with {paired.name}. From now on your phones sync by themselves
          when they are near each other.
        </Typography>
      );
    }
    const seen = status.seen ?? [];
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Typography
          className="body-small-regular"
          sx={{ color: 'var(--grey-400)' }}
        >
          The other brother opens Meet too. Phones in Meet anywhere in the room
          show up here.
        </Typography>
        {seen.length === 0 && (
          <Typography
            className="body-regular"
            sx={{ color: 'var(--grey-350)' }}
          >
            Looking for phones…
          </Typography>
        )}
        {seen.map((phone) => (
          <Button
            key={phone.address}
            variant="secondary"
            onClick={() => nearby('pair', { address: phone.address })}
          >
            {phone.name}
          </Button>
        ))}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Meet a phone">
      {status.permissions && !status.permissions.bluetooth ? (
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

const QrPairDialog = ({
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
      title="Pair with QR codes"
      description="Each phone scans the other's code. Only do this with the brother in front of you."
    >
      {code && <QrImage text={code} />}
      {android && (
        <Button variant="main" onClick={() => nearby('scanQr')}>
          Scan the other phone&apos;s code
        </Button>
      )}
      <Button variant="tertiary" onClick={onClose}>
        Done
      </Button>
    </Dialog>
  );
};

const QrSendDialog = ({
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
      description={`On ${peer?.name || 'the other phone'}: Sync, Receive by QR, then point the camera here until it is done.`}
    >
      {bundle && <AnimatedQr text={bundle} />}
      <Button
        variant="secondary"
        onClick={() => nearby('shareFile', { name: fileName, text: bundle })}
      >
        Send as a file instead
      </Button>
      <Button variant="tertiary" onClick={onClose}>
        Done
      </Button>
    </Dialog>
  );
};

// ---- the page ----

const Nearby = () => {
  const { peers, status, name, setName, refreshPeers, android } = useNearby();
  const [params, setParams] = useSearchParams();
  const [meetOpen, setMeetOpen] = useState(false);
  const [qrPairOpen, setQrPairOpen] = useState(false);
  const [sendTo, setSendTo] = useState<Peer | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [newPerson, setNewPerson] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const schedule = status.schedule ?? {};
  const meetings = schedule.meetings ?? [];
  const permissions = status.permissions;

  useEffect(() => {
    loadPeople().then(setPeople);
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

  // a reminder notification opens this page to sync
  useEffect(() => {
    if (params.get('sync')) {
      nearby('syncNow');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const saveSchedule = (next: NearbyStatus['schedule']) =>
    nearby('schedule', {
      enabled: true,
      before: 45,
      after: 150,
      ...schedule,
      ...next,
    });

  const syncing = status.exchanges?.find(
    (exchange) => exchange.mode === 0 && exchange.state === 'exchanging'
  );

  const statusLine = () => {
    if (!android) return 'Bluetooth sync works in the phone apps.';
    if (permissions && !permissions.bluetooth) {
      return 'Allow Bluetooth so paired phones can sync.';
    }
    if (syncing) return 'Syncing with a paired phone…';
    if (status.running && status.until) {
      return `Looking for paired phones nearby until ${time(new Date(status.until))}`;
    }
    return 'Not searching right now';
  };

  const removePeer = async (peer: Peer) => {
    if (
      !window.confirm(`Unpair ${peer.name}? Its changes stay on this phone.`)
    ) {
      return;
    }
    await invoke('remove_peer', { id: peer.id });
    refreshPeers();
  };

  const addPerson = async () => {
    const trimmed = newPerson.trim();
    if (!trimmed) return;
    await writeRows([
      {
        table: PEOPLE,
        id: crypto.randomUUID(),
        fields: { name: trimmed, group: false },
      },
    ]);
    setNewPerson('');
    setPeople(await loadPeople());
  };

  const removePerson = async (person: Person) => {
    await writeRows([{ table: PEOPLE, id: person.id, deleted: true }]);
    setPeople(await loadPeople());
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await receive((await file.text()).trim());
    refreshPeers();
  };

  const secondary = { color: 'var(--grey-400)' };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Sync" />

      <Box sx={card}>
        <Typography className="h3">This phone</Typography>
        <TextField
          label="Your name, as other phones see it"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => invoke('set_name', { name }).then(refreshPeers)}
        />
        <Typography className="body-small-regular" sx={secondary}>
          {statusLine()}
        </Typography>
        {android && permissions && !permissions.bluetooth && (
          <Button variant="main" onClick={() => nearby('permissions')}>
            Allow Bluetooth and notifications
          </Button>
        )}
        {android && permissions?.bluetooth && peers.length > 0 && (
          <Button variant="secondary" onClick={() => nearby('syncNow')}>
            Sync now
          </Button>
        )}
      </Box>

      <Box sx={card}>
        <Typography className="h3">Paired phones</Typography>
        {peers.length === 0 && (
          <Typography className="body-regular" sx={secondary}>
            No phone is paired yet. Meet the other territory servant&apos;s
            phone once; after that they sync by themselves.
          </Typography>
        )}
        {peers.map((peer) => (
          <Box
            key={peer.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid var(--accent-200)',
              paddingBottom: '8px',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography className="body-regular">
                {peer.name || 'Unnamed phone'}
              </Typography>
              <Typography className="label-small-regular" sx={secondary}>
                {ago(peer.last_sync)}
                {peer.pending > 0 ? ` · ${peer.pending} changes to send` : ''}
              </Typography>
            </Box>
            <Button variant="small" onClick={() => setSendTo(peer)}>
              QR
            </Button>
            <IconButton
              aria-label={`Unpair ${peer.name}`}
              onClick={() => removePeer(peer)}
            >
              <IconDelete color="var(--red-main)" />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {android && (
            <Button variant="main" onClick={() => setMeetOpen(true)}>
              Meet a phone
            </Button>
          )}
          <Button variant="secondary" onClick={() => setQrPairOpen(true)}>
            Pair with QR codes
          </Button>
        </Box>
      </Box>

      <Box sx={card}>
        <Typography className="h3">Without Bluetooth</Typography>
        <Typography className="body-small-regular" sx={secondary}>
          To send, use a paired phone&apos;s QR button above. To receive, film
          its codes or open the file it sent.
        </Typography>
        <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {android && (
            <Button variant="secondary" onClick={() => nearby('scanQr')}>
              Receive by QR
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
          >
            Open a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".territories"
            hidden
            onChange={openFile}
          />
        </Box>
      </Box>

      {android && (
        <Box sx={card}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography className="h3">Automatic sync</Typography>
            <Switch
              checked={schedule.enabled !== false}
              onChange={(_, enabled) => saveSchedule({ enabled })}
            />
          </Box>
          <Typography className="body-small-regular" sx={secondary}>
            Around meeting times the phone looks for paired phones by itself,
            with the screen off. If Android doesn&apos;t let it, a notification
            asks for one tap, and another before you leave if something is still
            unsent.
          </Typography>
          {meetings.map((meeting: Meeting, index: number) => (
            <Box
              key={index}
              sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <Select
                size="small"
                value={meeting.day}
                onChange={(event) =>
                  saveSchedule({
                    meetings: meetings.map((m, i) =>
                      i === index
                        ? { ...m, day: Number(event.target.value) }
                        : m
                    ),
                  })
                }
                sx={{ flex: 1 }}
              >
                {DAYS.map((day, value) => (
                  <MenuItem key={day} value={value}>
                    {day}
                  </MenuItem>
                ))}
              </Select>
              <input
                type="time"
                value={meeting.time}
                onChange={(event) =>
                  saveSchedule({
                    meetings: meetings.map((m, i) =>
                      i === index ? { ...m, time: event.target.value } : m
                    ),
                  })
                }
                style={{
                  font: 'inherit',
                  padding: '8px',
                  borderRadius: 8,
                  border: '1px solid var(--accent-300)',
                }}
              />
              <IconButton
                aria-label="Remove meeting"
                onClick={() =>
                  saveSchedule({
                    meetings: meetings.filter((_, i) => i !== index),
                  })
                }
              >
                <IconDelete color="var(--grey-400)" />
              </IconButton>
            </Box>
          ))}
          <Button
            variant="tertiary"
            startIcon={<IconAdd />}
            onClick={() =>
              saveSchedule({
                meetings: [...meetings, { day: 4, time: '19:00' }],
              })
            }
          >
            Add meeting time
          </Button>

          <Typography className="body-small-semibold">
            Kingdom Hall (optional)
          </Typography>
          <Typography className="body-small-regular" sx={secondary}>
            {status.hall
              ? 'Arriving there also starts a search, outside meeting times too.'
              : 'Stand in the Kingdom Hall and save its location, so arriving there starts a search.'}
          </Typography>
          <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => nearby('hallHere', { radius: 150 })}
            >
              {status.hall ? 'Save again here' : 'I am at the Kingdom Hall'}
            </Button>
            {permissions?.location && !permissions.backgroundLocation && (
              <Button
                variant="tertiary"
                onClick={() =>
                  nearby('permissions', { which: 'backgroundLocation' })
                }
              >
                Allow location all the time
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`Bluetooth ${permissions?.bluetooth ? 'on' : 'off'}`}
            />
            <Chip
              size="small"
              label={`Notifications ${permissions?.notifications ? 'on' : 'off'}`}
            />
            <Chip
              size="small"
              label={`Exact meeting alarms ${permissions?.exactAlarms ? 'on' : 'off'}`}
              onClick={
                permissions?.exactAlarms
                  ? undefined
                  : () => nearby('exactAlarms')
              }
            />
          </Box>
        </Box>
      )}

      <Box sx={card}>
        <Typography className="h3">Publishers and groups</Typography>
        <Typography className="body-small-regular" sx={secondary}>
          The names territories can be assigned to. They stay on the paired
          phones only.
        </Typography>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <TextField
            label="Add a name"
            value={newPerson}
            onChange={(event) => setNewPerson(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addPerson()}
          />
          <IconButton aria-label="Add" onClick={addPerson}>
            <IconAdd color="var(--accent-main)" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {people
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                onDelete={() => removePerson(person)}
              />
            ))}
        </Box>
      </Box>

      <MeetDialog
        open={meetOpen}
        onClose={() => setMeetOpen(false)}
        status={status}
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

export default Nearby;
