import {
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Box } from '@mui/material';
import QRCode from 'qrcode';
import {
  IconCheck,
  IconComputer,
  IconError,
  IconLock,
  IconSync,
} from '@icons/index';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import Typography from '@components/typography';
import { useBreakpoints } from '@hooks/index';
import { play } from '../../haptics';
import { invoke, isMac, listen, nearby } from '../../native';
import { t } from '../../i18n';
import { SessionStatus } from '../useNearby';
import CodeInput from './code_input';
import { Pulse } from './parts';
import { IconSmartphone } from './icons';
import { reasonText } from './text';

// ---- pairing a computer: it shows an invite, a phone scans or types it ----

export const INVITE_PREFIX = 'OTL1:';

type Offer = { text: string; code: string; name: string; expires: number };
type InviteStatus = SessionStatus & { role: 'host' | 'join' };

// the core's reasons (lan.rs, session.rs), with what to say and what to try
const REASONS: Record<string, { text: string; tips: Tip[] }> = {
  'no local network': {
    text: 'invite.error.noNetwork',
    tips: ['wifiOn', 'hotspot'],
  },
  'the devices are on different networks': {
    text: 'invite.error.otherNetwork',
    tips: ['sameWifi', 'cable', 'guest', 'hotspot'],
  },
  "the other device can't be reached": {
    text: 'invite.error.notReachable',
    tips: ['sameWifi', 'firewall', 'cable', 'localNetwork', 'vpn'],
  },
  'no device shows this code': {
    text: 'invite.error.notFound',
    tips: ['code', 'sameWifi', 'cable', 'firewall'],
  },
  'wrong pairing code': { text: 'invite.error.wrongCode', tips: ['code'] },
  'too many wrong codes': { text: 'invite.error.tooMany', tips: [] },
  'another device answered': { text: 'invite.error.otherDevice', tips: [] },
  'the connection broke': {
    text: 'invite.error.lost',
    tips: ['sameWifi', 'firewall', 'vpn'],
  },
  'declined on the other phone': { text: 'invite.error.declined', tips: [] },
};

type Tip =
  | 'wifiOn'
  | 'sameWifi'
  | 'cable'
  | 'guest'
  | 'hotspot'
  | 'firewall'
  | 'localNetwork'
  | 'vpn'
  | 'code';

const isIphone = () =>
  /iPhone|iPad/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// a tip only where it can apply: iPhones ask for the local network
const tipsFor = (tips: Tip[], most: number) =>
  tips.filter((tip) => tip !== 'localNetwork' || isIphone()).slice(0, most);

const describe = (reason?: string) =>
  REASONS[reason ?? '']?.text
    ? t(REASONS[reason ?? ''].text)
    : (reasonText(reason) ?? t('invite.error.generic'));

/** A short list of what to try, friendly and to the point. */
const Tips = ({ tips, most = 4 }: { tips: Tip[]; most?: number }) => {
  const shown = tipsFor(tips, most);
  if (!shown.length) return null;
  return (
    <Box
      component="ul"
      sx={{
        margin: 0,
        paddingLeft: '20px',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {shown.map((tip) => (
        <Typography
          key={tip}
          component="li"
          className="body-small-regular"
          color="var(--grey-400)"
        >
          {t(`invite.tip.${tip}`)}
        </Typography>
      ))}
    </Box>
  );
};

const centered = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '12px',
  width: '100%',
  paddingBlock: '8px',
} as const;

const Outcome = ({
  icon,
  title,
  text,
  active = false,
  tone,
  children,
}: {
  icon: ReactElement;
  tone?: string;
  title: string;
  text?: string;
  active?: boolean;
  children?: ReactNode;
}) => (
  <Box sx={centered}>
    <Pulse icon={icon} active={active} size={72} tone={tone} />
    <Typography className="h3">{title}</Typography>
    {text && (
      <Typography className="body-regular" color="var(--grey-400)">
        {text}
      </Typography>
    )}
    {children}
  </Box>
);

/** What went wrong in a red block, then what to try as plain bullets. */
const Failure = ({ reason }: { reason?: string }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--red-secondary)',
      }}
    >
      <IconError color="var(--red-main)" />
      <Typography className="body-regular" color="var(--red-dark)">
        {describe(reason)}
      </Typography>
    </Box>
    <Tips tips={REASONS[reason ?? '']?.tips ?? ['sameWifi', 'vpn']} />
  </Box>
);

const Paired = ({ name }: { name?: string }) => (
  <Outcome
    icon={<IconCheck color="var(--green-main)" />}
    tone="var(--green-secondary)"
    title={t('invite.done', { name: name || t('common.theOtherPhone') })}
    text={t('invite.doneText')}
  />
);

const Code = ({ code }: { code: string }) => (
  <Typography
    className="h1"
    sx={{
      letterSpacing: '0.12em',
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--accent-main)',
    }}
  >
    {code.replace(/(\d{3})(\d{3})/, '$1 $2')}
  </Typography>
);

const QrCard = ({
  text,
  code,
  left,
}: {
  text: string;
  code: string;
  left: string;
}) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let current = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 0, width: 480 })
      .then((next: string) => current && setUrl(next))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [text]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '20px',
        borderRadius: 'var(--radius-xl)',
        backgroundColor: 'var(--white)',
        border: '1px solid var(--accent-200)',
        boxShadow: 'var(--small-card-shadow)',
        flexShrink: 0,
        width: 248,
        boxSizing: 'border-box',
        alignSelf: 'center',
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 200,
          height: 200,
          padding: '12px',
          borderRadius: 'var(--radius-l)',
          backgroundColor: '#FFFFFF',
        }}
      >
        {url && (
          <img
            src={url}
            alt={t('invite.qrAlt')}
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated',
            }}
          />
        )}
      </Box>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {t('invite.orType')}
      </Typography>
      <Code code={code} />
      <Typography className="label-small-regular" color="var(--grey-350)">
        {t('invite.validFor', { time: left })}
      </Typography>
    </Box>
  );
};

const Step = ({ index, text }: { index: number; text: string }) => (
  <Box sx={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
    <Box
      sx={{
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: '50%',
        backgroundColor: 'var(--accent-150)',
        color: 'var(--accent-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography className="h4" color="var(--accent-main)">
        {index}
      </Typography>
    </Box>
    <Typography className="body-regular" sx={{ paddingTop: '3px' }}>
      {text}
    </Typography>
  </Box>
);

const minutes = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** A computer's way to pair: a code to scan with a phone on the same network. */
export const InviteHostDialog = ({
  open,
  onClose,
  onPaired,
}: {
  open: boolean;
  onClose: VoidFunction;
  onPaired: VoidFunction;
}) => {
  const { tabletUp } = useBreakpoints();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState<InviteStatus | null>(null);
  // a try that went wrong while the code stays good, shown above it
  const [note, setNote] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [opening, setOpening] = useState(false);
  const [now, setNow] = useState(Date.now());
  const answered = useRef(false);

  const start = useCallback(async () => {
    setStatus(null);
    setFailure(null);
    answered.current = false;
    setOpening(true);
    try {
      const next = await invoke<Offer>('invite_open');
      // an older or broken core answers without a code; that's a failure too
      if (!next?.text || !next?.code) throw new Error('no invite');
      setOffer(next);
    } catch (reason) {
      setOffer(null);
      setFailure(String(reason));
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote(null);
    setHelp(false);
    start();
    const stop = listen<InviteStatus>('invite', (next) => {
      if (next.role === 'host') setStatus(next);
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(tick);
      stop.then((unlisten) => unlisten());
      invoke('invite_close').catch(() => {});
    };
  }, [open, start]);

  useEffect(() => {
    if (!status) return;
    if (status.state === 'confirm') play('code');
    if (status.state === 'done') {
      play('paired');
      nearby('paired');
      onPaired();
    }
    if (status.state !== 'failed') return;
    // the invite stays open after these; the others end it with a new code
    const reason = status.reason ?? '';
    if (reason !== 'declined') {
      play('error');
      setNote(reason);
    }
    if (['too many wrong codes', 'the code has expired'].includes(reason)) {
      start();
    } else {
      setStatus(null);
    }
  }, [status, start, onPaired]);

  // a fresh code once this one runs out, unless someone is answering it
  useEffect(() => {
    if (offer && now > offer.expires && !status) start();
  }, [now, offer, status, start]);

  const answer = (accept: boolean) => {
    if (answered.current) return;
    answered.current = true;
    invoke('invite_answer', { accept }).catch(() => {});
  };

  const name = status?.name || t('common.theOtherPhone');

  const body = () => {
    if (failure) return <Failure reason={failure} />;
    if (status?.state === 'confirm') {
      return (
        <Outcome
          icon={<IconSmartphone />}
          title={t('invite.confirm', { name })}
          text={t('invite.confirmText')}
          active
        />
      );
    }
    if (status?.state === 'exchanging') {
      return (
        <Outcome
          icon={<IconSync color="var(--accent-main)" />}
          title={t('invite.syncing', { name })}
          active
        />
      );
    }
    if (status?.state === 'done') return <Paired name={status.name} />;
    if (!offer) {
      return (
        <Typography className="body-regular">{t('qr.preparing')}</Typography>
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {note && (
          <Typography className="body-small-regular" color="var(--red-main)">
            {describe(note)}
          </Typography>
        )}
        <Box
          sx={{
            display: 'flex',
            flexDirection: tabletUp ? 'row' : 'column',
            alignItems: tabletUp ? 'center' : 'stretch',
            gap: '24px',
          }}
        >
          <QrCard
            text={offer.text}
            code={offer.code}
            left={minutes(offer.expires - now)}
          />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Step index={1} text={t('invite.step1')} />
            <Step index={2} text={t('invite.step2')} />
            <Step index={3} text={t('invite.step3')} />
            <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <IconLock color="var(--grey-400)" width={18} height={18} />
              <Typography
                className="label-small-regular"
                color="var(--grey-400)"
              >
                {t('invite.local')}
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box>
          <Typography
            component="button"
            className="label-small-medium"
            color="var(--accent-main)"
            onClick={() => setHelp((shown) => !shown)}
            sx={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {t('invite.help')}
          </Typography>
          {help && (
            <Box sx={{ marginTop: '8px' }}>
              <Tips
                tips={['sameWifi', 'cable', 'guest', 'firewall', 'hotspot']}
                most={5}
              />
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const actions = () => {
    if (status?.state === 'confirm') {
      return (
        <>
          <Button
            key="decline"
            variant="secondary"
            onClick={() => answer(false)}
          >
            {t('invite.decline')}
          </Button>
          <Button key="pair" variant="main" onClick={() => answer(true)}>
            {t('invite.connect')}
          </Button>
        </>
      );
    }
    // a try again keeps its buttons while it runs, rather than swapping them
    if (failure || (opening && !offer)) {
      return (
        <>
          <Button key="cancel" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button key="retry" variant="main" disabled={opening} onClick={start}>
            {t('invite.tryAgain')}
          </Button>
        </>
      );
    }
    return (
      <Button key="done" variant="main" onClick={onClose}>
        {t('common.done')}
      </Button>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('invite.title')}
      sx={{ maxWidth: '640px' }}
    >
      {body()}
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        {actions()}
      </DialogActions>
    </Dialog>
  );
};

/**
 * A phone joining a computer's invite: from a scanned code (`text`), or with
 * the 6 digits typed (`text` empty).
 */
export const InviteJoinDialog = ({
  text,
  onClose,
  onPaired,
}: {
  /** null: closed; '': type the code */
  text: string | null;
  onClose: VoidFunction;
  onPaired: VoidFunction;
}) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = text !== null;
  // the core can't stop a join; one answering after Cancel is ignored
  const latest = useRef(0);

  const run = useCallback(
    async (
      command: 'invite_join' | 'invite_code',
      args: Record<string, string>
    ) => {
      const id = ++latest.current;
      setBusy(true);
      setFailure(null);
      setStatus(null);
      try {
        const result = await invoke<SessionStatus>(command, args);
        if (id !== latest.current) return;
        setStatus(result);
        if (result?.state === 'done') {
          play('paired');
          nearby('paired');
          onPaired();
        } else {
          // failed, or an answer without a state: never a silent stop
          play('error');
          setFailure(result?.reason ?? '');
        }
      } catch (reason) {
        if (id !== latest.current) return;
        play('error');
        setFailure(String(reason));
      } finally {
        if (id === latest.current) setBusy(false);
      }
    },
    [onPaired]
  );

  useEffect(() => {
    if (!open) return;
    setCode('');
    setStatus(null);
    setFailure(null);
    const stop = listen<InviteStatus>('invite', (next) => {
      if (next.role === 'join') setStatus(next);
    });
    if (text) run('invite_join', { text });
    return () => {
      latest.current += 1;
      setBusy(false);
      stop.then((unlisten) => unlisten());
    };
  }, [open, text, run]);

  const typing = text === '';
  const digits = code.replace(/\D/g, '');
  const submit = () => {
    if (digits.length === 6 && !busy) run('invite_code', { code: digits });
  };

  const body = () => {
    if (failure !== null) return <Failure reason={failure} />;
    if (status?.state === 'done') return <Paired name={status.name} />;
    if (status?.state === 'confirm') {
      return (
        <Outcome
          icon={<IconComputer color="var(--accent-main)" />}
          title={
            status.name
              ? t('invite.waiting', { name: status.name })
              : t('invite.waitingUnnamed')
          }
          text={t('invite.waitingText')}
          active
        />
      );
    }
    if (status?.state === 'exchanging') {
      return (
        <Outcome
          icon={<IconSync color="var(--accent-main)" />}
          title={t('invite.syncing', {
            name: status.name || t('common.theOtherPhone'),
          })}
          active
        />
      );
    }
    if (busy) {
      return (
        <Outcome
          icon={<IconComputer color="var(--accent-main)" />}
          title={t('invite.searching')}
          active
        />
      );
    }
    if (typing) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Typography className="body-regular" color="var(--grey-400)">
            {t('invite.codeText')}
          </Typography>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={(full) => run('invite_code', { code: full })}
          />
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <IconLock color="var(--grey-400)" width={18} height={18} />
            <Typography className="label-small-regular" color="var(--grey-400)">
              {t('invite.local')}
            </Typography>
          </Box>
        </Box>
      );
    }
    return null;
  };

  const finished = status?.state === 'done';
  const actions = () => {
    if (finished) {
      return (
        <Button key="done" variant="main" onClick={onClose}>
          {t('common.done')}
        </Button>
      );
    }
    if (failure !== null) {
      return (
        <>
          <Button key="cancel" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            key="retry"
            variant="main"
            onClick={() =>
              typing
                ? (setFailure(null), setStatus(null))
                : run('invite_join', { text: text ?? '' })
            }
          >
            {t('invite.tryAgain')}
          </Button>
        </>
      );
    }
    if (typing && !busy && !status) {
      return (
        <>
          <Button key="cancel" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            key="pair"
            variant="main"
            disabled={digits.length !== 6}
            onClick={submit}
          >
            {t('invite.connect')}
          </Button>
        </>
      );
    }
    return (
      <Button key="cancel" variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('invite.joinTitle')}>
      {body()}
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        {actions()}
      </DialogActions>
    </Dialog>
  );
};

/** A computer: it shows the invite rather than scanning one. */
export const isComputer = (bridge: boolean) =>
  isMac() || (!bridge && !/Android|iPhone|iPad/.test(navigator.userAgent));
