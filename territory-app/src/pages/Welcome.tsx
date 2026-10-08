import { ReactElement, useEffect, useRef, useState } from 'react';
import { Box, Stack } from '@mui/material';
import {
  IconLocation,
  IconLock,
  IconNotifications,
  IconSync,
} from '@icons/index';
import Button from '@components/button';
import Switch from '@components/switch';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { play } from '../haptics';
import { invoke, nearby } from '../native';
import { loadIdentity } from '../persistence';
import { t } from '../i18n';
import { IconBluetooth, IconQr, IconTap } from './sync/icons';
import useNearby from './useNearby';
import { notify } from './sync/text';

import { WELCOME_KEY } from './welcomeState';

const STEPS = 3;

/** A small round tile with an icon, as on the Sync page. */
const Tile = ({ icon, small }: { icon: ReactElement; small?: boolean }) => (
  <Box
    sx={{
      width: small ? 32 : 40,
      height: small ? 32 : 40,
      borderRadius: 'var(--radius-m)',
      backgroundColor: 'var(--accent-150)',
      color: 'var(--accent-main)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      '& svg': { width: small ? 18 : 22, height: small ? 18 : 22 },
      '& svg path': { fill: 'currentColor' },
    }}
  >
    {icon}
  </Box>
);

/** Where the person is: one segment per step, the done ones filled. */
const Progress = ({ step }: { step: number }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <Typography className="label-small-medium" color="var(--grey-400)">
      {t('welcome.stepOf', { step: step + 1, total: STEPS })}
    </Typography>
    <Box sx={{ display: 'flex', gap: '6px' }}>
      {Array.from({ length: STEPS }, (_, index) => (
        <Box
          key={index}
          sx={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor:
              index <= step ? 'var(--accent-main)' : 'var(--accent-200)',
            transition: 'background-color 0.3s',
          }}
        />
      ))}
    </Box>
  </Box>
);

/** One permission, settings-style: its name, one line, and a switch. */
const Access = ({
  icon,
  title,
  text,
  ok,
  onAsk,
}: {
  icon: ReactElement;
  title: string;
  text: string;
  ok: boolean;
  /** Asks the system for this one permission. */
  onAsk: VoidFunction;
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      paddingBlock: '12px',
      '& + &': { borderTop: '1px solid var(--accent-200)' },
    }}
  >
    <Tile icon={icon} small />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{title}</Typography>
      <Typography className="label-small-regular" color="var(--grey-350)">
        {text}
      </Typography>
    </Box>
    {/* on once allowed; the system decides, so it can't be switched off here */}
    <Switch
      checked={ok}
      readOnly={ok}
      onChange={() => !ok && onAsk()}
      slotProps={{ input: { 'aria-label': title } }}
    />
  </Box>
);

const PROMISES = [
  { icon: <IconSync />, text: 'welcome.promiseSync' },
  { icon: <IconBluetooth />, text: 'welcome.promiseDirect' },
  { icon: <IconLock />, text: 'welcome.promiseLocal' },
];

/**
 * First start, one step at a time, on a card over the dashboard: what the
 * app is, your name, and what it may use.
 */
const Welcome = ({ onDone }: { onDone: VoidFunction }) => {
  const { status, name: saved } = useNearby();
  const [step, setStep] = useState(0);
  const [asked, setAsked] = useState(false);
  const [name, setName] = useState('');
  const nameField = useRef<HTMLInputElement>(null);
  // going back and forth would save the same name twice
  const sent = useRef('');
  const allowed = status.permissions;
  const ios = status.platform === 'ios';

  useEffect(() => {
    if (saved) setName(saved);
  }, [saved]);

  useEffect(() => {
    if (step === 1) nameField.current?.focus();
  }, [step]);

  const all = !!(
    allowed?.bluetooth &&
    allowed.notifications &&
    allowed.camera &&
    (ios ? allowed.backgroundLocation : allowed.battery)
  );

  useEffect(() => {
    if (all) play('synced');
  }, [all]);

  // first and last name: a device whose name matches a publisher's counts as
  // that publisher (suggestedLink), so it finds its territories by itself
  const full = name.trim().split(/\s+/).length >= 2;

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === saved || trimmed === sent.current) return true;
    sent.current = trimmed;
    try {
      await invoke('set_name', { name: trimmed });
      await loadIdentity();
      return true;
    } catch (error) {
      sent.current = '';
      console.error('welcome: saving the name failed', error);
      notify(t('common.somethingWrong'), t('common.notSaved'), 'error');
      return false;
    }
  };

  const next = async () => {
    if (step === 1 && (!full || !(await saveName()))) return;
    setStep((current) => Math.min(current + 1, STEPS - 1));
  };

  const finish = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      // shown again next time, no harm
    }
    onDone();
  };

  const intro = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box>
        <Typography className="h1">{t('welcome.title')}</Typography>
        <Typography className="body-regular" color="var(--grey-400)">
          {t('welcome.intro')}
        </Typography>
      </Box>
      <Stack spacing="12px">
        {PROMISES.map((promise) => (
          <Box
            key={promise.text}
            sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}
          >
            <Tile icon={promise.icon} />
            <Typography className="body-regular">{t(promise.text)}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );

  const nameStep = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box>
        <Typography className="h2">{t('common.yourName')}</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          {t('welcome.nameText')}
        </Typography>
      </Box>
      <TextField
        label={t('welcome.fullName')}
        value={name}
        inputRef={nameField}
        autoComplete="name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && next()}
      />
    </Box>
  );

  const accessStep = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography className="h2">{t('welcome.accessTitle')}</Typography>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {t('welcome.accessText')}
          </Typography>
        </Box>
      </Box>
      <Box>
        <Access
          icon={<IconBluetooth />}
          title={t('common.bluetooth')}
          text={t('common.bluetoothText')}
          ok={!!allowed?.bluetooth}
          onAsk={() => nearby('permissions', { which: 'bluetooth' })}
        />
        <Access
          icon={<IconNotifications />}
          title={t('common.notifications')}
          text={t('common.notificationsText')}
          ok={!!allowed?.notifications}
          onAsk={() => nearby('permissions', { which: 'notifications' })}
        />
        <Access
          icon={<IconQr />}
          title={t('welcome.camera')}
          text={t('welcome.cameraText')}
          ok={!!allowed?.camera}
          onAsk={() => nearby('permissions', { which: 'camera' })}
        />
        {ios ? (
          <Access
            icon={<IconLocation />}
            title={t('welcome.location')}
            text={t('welcome.locationText')}
            ok={!!allowed?.backgroundLocation}
            onAsk={() => nearby('permissions', { which: 'backgroundLocation' })}
          />
        ) : (
          <Access
            icon={<IconSync />}
            title={t('common.background')}
            text={t('welcome.backgroundText')}
            ok={!!allowed?.battery}
            onAsk={() => nearby('battery')}
          />
        )}
        {allowed?.nfc && (
          <Access
            icon={<IconTap />}
            title={t('welcome.nfc')}
            text={allowed.nfcOn ? t('welcome.nfcOn') : t('welcome.nfcOff')}
            ok={!!allowed.nfcOn}
            onAsk={() => nearby('nfcSettings')}
          />
        )}
      </Box>
      {ios && (
        <Typography className="label-small-regular" color="var(--grey-400)">
          {t('welcome.iosHint')}
        </Typography>
      )}
    </Box>
  );

  const last = step === STEPS - 1;

  return (
    <Stack spacing="16px" sx={{ width: '100%' }}>
      <Progress step={step} />
      {[intro, nameStep, accessStep][step]}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {step > 0 ? (
          <Button
            key="back"
            variant="secondary"
            disableAutoStretch
            onClick={() => setStep(step - 1)}
          >
            {t('welcome.back')}
          </Button>
        ) : (
          <span />
        )}
        {/* asked once, the app opens whatever the answers: nothing is forced */}
        {last && !all && !asked ? (
          <Button
            key="all"
            variant="main"
            disableAutoStretch
            onClick={() => {
              setAsked(true);
              nearby('permissions', { which: 'all' });
            }}
          >
            {t('welcome.allowAll')}
          </Button>
        ) : last ? (
          <Button
            key="finish"
            variant="main"
            disableAutoStretch
            onClick={finish}
          >
            {t('welcome.start')}
          </Button>
        ) : (
          <Button
            key="next"
            variant="main"
            disableAutoStretch
            // no error for a first name alone: it waits for the last name
            disabled={step === 1 && !full}
            onClick={next}
          >
            {step === 0 ? t('welcome.begin') : t('welcome.next')}
          </Button>
        )}
      </Box>
    </Stack>
  );
};

export default Welcome;
