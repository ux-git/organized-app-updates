import { ReactElement, ReactNode } from 'react';
import { Box, keyframes } from '@mui/material';
import { useAtomValue } from 'jotai';
import Badge from '@components/badge';
import Button from '@components/button';
import Typography from '@components/typography';
import { useBreakpoints } from '@hooks/index';
import { BadgeColor } from '@definition/app';
import { HOVER_ACTIONS } from '@features/territories/components/table_styles';
import { avatarsState, isProfilePicture } from '../../profiles';
import ProfilePicture from '@components/profile_picture';

const ripple = keyframes`
  from { transform: scale(1); opacity: 0.45; }
  to { transform: scale(1.7); opacity: 0; }
`;

/** A round icon that sends out waves while something is being looked for. */
export const Pulse = ({
  icon,
  active,
  size = 88,
  onWave,
  tone = 'var(--accent-150)',
}: {
  icon: ReactElement;
  active: boolean;
  size?: number;
  /** The circle's colour, red or green for an outcome. */
  tone?: string;
  /** As each wave sets out; with reduced motion none do. */
  onWave?: VoidFunction;
}) => (
  <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
    {active &&
      [0, 1].map((wave) => (
        <Box
          key={wave}
          onAnimationStart={onWave}
          onAnimationIteration={onWave}
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-300)',
            animation: `${ripple} 2.4s ease-out ${wave * 1.2}s infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      ))}
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: tone,
        color: 'var(--accent-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '& svg': { width: size * 0.42, height: size * 0.42 },
      }}
    >
      {icon}
    </Box>
  </Box>
);

// lub as it starts, dub 190 ms in, like the heartbeat haptic
const beat = keyframes`
  0%, 14%, 34%, 100% { transform: scale(1); }
  4% { transform: scale(1.06); }
  18% { transform: scale(1.04); }
`;

/**
 * Beats softly while `active`, calling `onBeat` as each beat starts; the
 * first a moment in, after the tap that started it.
 */
export const Heartbeat = ({
  active,
  onBeat,
  children,
}: {
  active: boolean;
  onBeat: VoidFunction;
  children: ReactNode;
}) => (
  <Box
    onAnimationStart={onBeat}
    onAnimationIteration={onBeat}
    sx={{
      animation: active ? `${beat} 1.2s ease-out 0.6s infinite` : 'none',
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    }}
  >
    {children}
  </Box>
);

// the Organized logo's four colours, so each phone keeps its own
const AVATAR_COLORS = ['#7D5FBD', '#E59A1F', '#1E9CC9', '#4E9E14'];

/** A device's picture when it has one (by its id), else its initials. */
export const Avatar = ({
  name,
  id,
  avatar,
}: {
  name: string;
  id?: string;
  avatar?: string;
}) => {
  const saved = useAtomValue(avatarsState)[id ?? ''];
  const picture = avatar ?? saved;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  const color =
    AVATAR_COLORS[
      [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        AVATAR_COLORS.length
    ];
  if (isProfilePicture(picture)) {
    return (
      <ProfilePicture type={picture} size={40} initials={initials} alt="" />
    );
  }
  if (picture) {
    return (
      <Box
        component="img"
        src={picture}
        alt=""
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        backgroundColor: color,
        color: 'var(--always-white)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Typography className="body-small-semibold" color="inherit">
        {initials}
      </Typography>
    </Box>
  );
};

export const PhoneRow = ({
  id,
  avatar,
  name,
  detail,
  onClick,
  trailing,
}: {
  id?: string;
  avatar?: string;
  name: string;
  detail: ReactNode;
  onClick?: VoidFunction;
  trailing?: ReactNode;
}) => (
  <Box
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={(event) => event.key === 'Enter' && onClick?.()}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px',
      marginInline: '-8px',
      borderRadius: 'var(--radius-l)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background-color 0.2s',
      '&:hover': onClick ? { backgroundColor: 'var(--accent-150)' } : {},
      ...(onClick && HOVER_ACTIONS),
    }}
  >
    <Avatar name={name} id={id} avatar={avatar} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{name}</Typography>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {detail}
      </Typography>
    </Box>
    {trailing}
  </Box>
);

export type Action = {
  label: string;
  onClick: VoidFunction;
  kind?: 'main' | 'secondary' | 'tertiary' | 'remove';
  disabled?: boolean;
};

// the order on a phone, top to bottom; a row shows the same buttons reversed
const RANK = { main: 0, secondary: 1, tertiary: 2, remove: 3 };

// Organized's DialogActions order everywhere: on a phone full width with the
// main action on top, on a tablet in a row with it at the end. A removal
// stays apart, last on a phone and at the start of the row.
export const Actions = ({ actions }: { actions: Action[] }) => {
  const { tabletUp } = useBreakpoints();
  if (!actions.length) return null;

  // actions of one kind keep the order they were given in
  const sorted = [...actions].sort(
    (a, b) => RANK[a.kind ?? 'secondary'] - RANK[b.kind ?? 'secondary']
  );

  const button = (action: Action) => {
    const kind = action.kind ?? 'secondary';
    return (
      <Button
        key={action.label}
        variant={kind === 'remove' ? 'tertiary' : kind}
        color={kind === 'remove' ? 'red' : undefined}
        disabled={action.disabled}
        disableAutoStretch={tabletUp}
        onClick={action.onClick}
        sx={tabletUp ? { minWidth: '96px' } : undefined}
      >
        {action.label}
      </Button>
    );
  };

  if (!tabletUp) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sorted.map(button)}
      </Box>
    );
  }

  const removals = sorted.filter((action) => action.kind === 'remove');
  const others = sorted
    .filter((action) => action.kind !== 'remove')
    .sort((a, b) => RANK[b.kind ?? 'secondary'] - RANK[a.kind ?? 'secondary']);

  return (
    <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {removals.map(button)}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: '8px',
          marginLeft: 'auto',
        }}
      >
        {others.map(button)}
      </Box>
    </Box>
  );
};

export type MethodState = { text: string; color: BadgeColor };

type PairChoice = { icon: ReactElement; label: string; onClick: VoidFunction };

// Pairing: the recommended way up front, the others as outlined buttons
export const PairOptions = ({
  icon,
  title,
  description,
  state,
  action,
  others,
  othersText,
}: {
  icon: ReactElement;
  title: string;
  description: string;
  state?: MethodState;
  action: { label: string; onClick: VoidFunction; disabled?: boolean };
  others: PairChoice[];
  othersText: string;
}) => {
  const { tabletUp } = useBreakpoints();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: tabletUp ? 'row' : 'column',
          alignItems: tabletUp ? 'center' : 'stretch',
          gap: '16px',
          padding: '16px',
          borderRadius: 'var(--radius-l)',
          backgroundColor: 'var(--accent-150)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 'var(--radius-m)',
              backgroundColor: 'var(--accent-200)',
              color: 'var(--accent-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                columnGap: '8px',
                rowGap: '6px',
                flexWrap: 'wrap',
                marginBottom: '4px',
              }}
            >
              <Typography className="h3">{title}</Typography>
              {state && (
                <Badge text={state.text} color={state.color} size="small" />
              )}
            </Box>
            <Typography className="label-small-regular" color="var(--grey-400)">
              {description}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="main"
          disabled={action.disabled}
          onClick={action.onClick}
          sx={{ flexShrink: 0, width: tabletUp ? 'auto' : '100%' }}
        >
          {action.label}
        </Button>
      </Box>

      {others.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {othersText}
          </Typography>
          <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {others.map((other) => (
              <Button
                key={other.label}
                variant="tertiary"
                startIcon={other.icon}
                onClick={other.onClick}
                sx={{ flex: tabletUp ? '0 0 auto' : '1 1 auto' }}
              >
                {other.label}
              </Button>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
