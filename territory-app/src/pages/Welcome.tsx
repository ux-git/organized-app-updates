import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import {
  IconCheckCircle,
  IconLocation,
  IconNotifications,
  IconSync,
} from '@icons/index';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import { CardSection } from '@features/congregation/settings/shared_styles';
import { play } from '../haptics';
import { invoke, nearby } from '../native';
import { loadIdentity } from '../persistence';
import { t } from '../i18n';
import { IconBluetooth, IconQr, IconTap } from './sync/icons';
import { Actions } from './sync/parts';
import useNearby from './useNearby';
import { notify } from './sync/text';

const KEY = 'territories-welcomed';

export const welcomed = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
};

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
  <CardSection sx={{ gap: '16px' }}>
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
  </CardSection>
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
  { icon: <IconSync />, text: 'welcome.promiseSync' },
  { icon: <IconBluetooth />, text: 'welcome.promiseDirect' },
  { icon: <IconLocation />, text: 'welcome.promiseLocal' },
];

/** First start: what the app is, your name, and what it needs, in one go. */
const Welcome = () => {
  const navigate = useNavigate();
  const { status, name: saved } = useNearby();
  const [name, setName] = useState('');
  // leaving the field and then Get started would save the same name twice
  const sent = useRef('');
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
    if (!trimmed || trimmed === saved || trimmed === sent.current) return;
    sent.current = trimmed;
    try {
      await invoke('set_name', { name: trimmed });
      await loadIdentity();
    } catch (error) {
      sent.current = '';
      notify(t('common.somethingWrong'), String(error), 'error');
    }
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
    <Stack spacing="16px">
      <CardSection sx={{ gap: '16px' }}>
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
              <Typography className="body-regular">
                {t(promise.text)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardSection>

      <Step
        number={1}
        title={t('common.yourName')}
        text={t('welcome.nameText')}
        done={!!saved}
      >
        <TextField
          label={t('common.fullName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => event.key === 'Enter' && saveName()}
        />
      </Step>

      <Step
        number={2}
        title={t('welcome.accessTitle')}
        text={t('welcome.accessText')}
        done={all}
      >
        <Stack spacing="14px">
          <Access
            icon={<IconBluetooth />}
            title={t('common.bluetooth')}
            text={t('common.bluetoothText')}
            ok={!!allowed?.bluetooth}
          />
          <Access
            icon={<IconNotifications />}
            title={t('common.notifications')}
            text={t('common.notificationsText')}
            ok={!!allowed?.notifications}
          />
          <Access
            icon={<IconQr />}
            title={t('welcome.camera')}
            text={t('welcome.cameraText')}
            ok={!!allowed?.camera}
          />
          {ios ? (
            <Access
              icon={<IconLocation />}
              title={t('welcome.location')}
              text={t('welcome.locationText')}
              ok={!!allowed?.backgroundLocation}
            />
          ) : (
            <Access
              icon={<IconSync />}
              title={t('common.background')}
              text={t('welcome.backgroundText')}
              ok={!!allowed?.battery}
            />
          )}
          {allowed?.nfc && (
            <Access
              icon={<IconTap />}
              title={t('welcome.nfc')}
              text={allowed.nfcOn ? t('welcome.nfcOn') : t('welcome.nfcOff')}
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
                    label: t('welcome.allowAll'),
                    kind: 'main' as const,
                    onClick: () => nearby('permissions', { which: 'all' }),
                  },
                ]),
            ...(allowed?.nfc && !allowed.nfcOn
              ? [
                  {
                    label: t('welcome.turnOnNfc'),
                    onClick: () => nearby('nfcSettings'),
                  },
                ]
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
          {t('welcome.iosHint')}
        </Typography>
      )}

      <Actions
        actions={[
          {
            label: all ? t('welcome.start') : t('welcome.skip'),
            kind: all ? 'main' : 'secondary',
            onClick: finish,
          },
        ]}
      />
    </Stack>
  );
};

export default Welcome;
