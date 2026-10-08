import { ReactElement, useEffect } from 'react';
import { Box, keyframes } from '@mui/material';
import Button from '@components/button';
import Typography from '@components/typography';
import { nearby } from '../../native';
import { t } from '../../i18n';
import { NearbyStatus } from '../useNearby';
import { IconBluetooth } from './icons';
import { Avatar, MethodState, Pulse } from './parts';

// ---- a phone's pairing card: the search runs while the page is open, the
// other ways wait below as cards ----

export type Way = {
  key: string;
  icon: ReactElement;
  label: string;
  text: string;
  onClick: VoidFunction;
};

const tile = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: 'var(--radius-l)',
  border: '1px solid var(--accent-200)',
  backgroundColor: 'var(--white)',
} as const;

const iconBox = {
  width: 32,
  height: 32,
  flexShrink: 0,
  borderRadius: 'var(--radius-m)',
  backgroundColor: 'var(--accent-150)',
  color: 'var(--accent-main)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { width: 20, height: 20 },
} as const;

const OtherWays = ({ ways }: { ways: Way[] }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <Typography className="label-small-medium" color="var(--grey-400)">
      {t('sync.otherWaysTitle')}
    </Typography>
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '8px',
      }}
    >
      {ways.map((way) => (
        <Box
          key={way.key}
          component="button"
          type="button"
          onClick={way.onClick}
          sx={{
            ...tile,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background-color 0.2s, border-color 0.2s',
            '&:hover': {
              backgroundColor: 'var(--accent-150)',
              borderColor: 'var(--accent-300)',
            },
          }}
        >
          <Box sx={iconBox}>{way.icon}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="body-small-semibold">{way.label}</Typography>
            <Typography className="label-small-regular" color="var(--grey-400)">
              {way.text}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  </Box>
);

const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

/** A device found nearby, ready to pair in one tap. */
const FoundDevice = ({
  name,
  avatar,
  onPair,
}: {
  name: string;
  avatar?: string;
  onPair: VoidFunction;
}) => (
  <Box sx={tile}>
    <Avatar name={name} avatar={avatar} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        className="body-regular"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </Typography>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {t('sync.nearby')}
      </Typography>
    </Box>
    <Button
      variant="main"
      disableAutoStretch
      onClick={onPair}
      sx={{ flexShrink: 0, minHeight: 36, padding: '6px 14px' }}
    >
      {t('common.pair')}
    </Button>
  </Box>
);

/** The search, live while the page is open, the pairing dialog included. */
const LiveSearch = ({
  status,
  onChoose,
}: {
  status: NearbyStatus;
  onChoose: (address: string) => void;
}) => {
  useEffect(() => {
    nearby('meetStart');
    return () => nearby('meetStop');
  }, []);
  const seen = status.seen ?? [];
  // waves and a breathing line while nothing is found yet
  const looking = !seen.length;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        borderRadius: 'var(--radius-xl)',
        backgroundColor: 'var(--accent-100)',
        border: '1px solid var(--accent-200)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Pulse
          icon={<IconBluetooth color="var(--always-white)" />}
          active={looking}
          size={48}
          tone="var(--accent-main)"
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography className="h3">{t('sync.pairNearbyTitle')}</Typography>
          <Typography
            className="label-small-regular"
            color="var(--grey-400)"
            sx={{
              animation: looking
                ? `${breathe} 2.4s ease-in-out infinite`
                : 'none',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            {looking
              ? t('sync.searching')
              : t('sync.found', { count: seen.length })}
          </Typography>
        </Box>
      </Box>
      {!looking && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {seen.map((phone) => (
            <FoundDevice
              key={phone.address}
              name={phone.name}
              avatar={phone.avatar}
              onPair={() => onChoose(phone.address)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

/** Bluetooth isn't ready: what is missing, and the one button to fix it. */
const BluetoothNeeded = ({
  state,
  label,
  onFix,
}: {
  state: MethodState;
  label: string;
  onFix: VoidFunction;
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '14px',
      padding: '16px',
      borderRadius: 'var(--radius-xl)',
      backgroundColor: 'var(--accent-100)',
      border: '1px solid var(--accent-200)',
    }}
  >
    <Box sx={{ ...iconBox, width: 48, height: 48, borderRadius: '50%' }}>
      <IconBluetooth />
    </Box>
    <Box sx={{ flex: 1, minWidth: 160 }}>
      <Typography className="h3">{t('sync.pairNearbyTitle')}</Typography>
      <Typography className="label-small-regular" color="var(--orange-dark)">
        {state.text}
      </Typography>
    </Box>
    <Button
      variant="main"
      disableAutoStretch
      onClick={onFix}
      sx={{ flexShrink: 0 }}
    >
      {label}
    </Button>
  </Box>
);

export const PhonePairing = ({
  bluetooth,
  ways,
  status,
  onChoose,
  onFix,
  fixLabel,
}: {
  /** Set when Bluetooth isn't ready, with why. */
  bluetooth?: MethodState;
  ways: Way[];
  status: NearbyStatus;
  onChoose: (address: string) => void;
  onFix: VoidFunction;
  fixLabel: string;
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    {bluetooth ? (
      <BluetoothNeeded state={bluetooth} label={fixLabel} onFix={onFix} />
    ) : (
      <LiveSearch status={status} onChoose={onChoose} />
    )}
    <OtherWays ways={ways} />
  </Box>
);
