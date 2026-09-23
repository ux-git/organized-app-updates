import { ReactElement, ReactNode } from 'react';
import { Box, keyframes } from '@mui/material';
import Badge from '@components/badge';
import Button from '@components/button';
import Typography from '@components/typography';
import { BadgeColor } from '@definition/app';

const ripple = keyframes`
  from { transform: scale(1); opacity: 0.45; }
  to { transform: scale(1.7); opacity: 0; }
`;

/** A round icon that sends out waves while something is being looked for. */
export const Pulse = ({
  icon,
  active,
  size = 88,
}: {
  icon: ReactElement;
  active: boolean;
  size?: number;
}) => (
  <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
    {active &&
      [0, 1].map((wave) => (
        <Box
          key={wave}
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
        backgroundColor: 'var(--accent-150)',
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

// the Organized logo's four colours, so each phone keeps its own
const AVATAR_COLORS = ['#7D5FBD', '#E59A1F', '#1E9CC9', '#4E9E14'];

export const Avatar = ({ name }: { name: string }) => {
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
  name,
  detail,
  onClick,
  trailing,
}: {
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
    }}
  >
    <Avatar name={name} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{name}</Typography>
      <Typography className="label-small-regular" color="var(--grey-400)">
        {detail}
      </Typography>
    </Box>
    {trailing}
  </Box>
);

export type MethodState = { text: string; color: BadgeColor };

/** One way of pairing or sharing: what it is, whether it can be used now, and its buttons. */
export const Method = ({
  icon,
  title,
  description,
  recommended,
  state,
  actions,
}: {
  icon: ReactElement;
  title: string;
  description: string;
  recommended?: boolean;
  state?: MethodState;
  actions: {
    label: string;
    onClick: VoidFunction;
    main?: boolean;
    disabled?: boolean;
  }[];
}) => (
  <Box
    sx={{
      display: 'flex',
      gap: '16px',
      padding: '16px',
      borderRadius: 'var(--radius-l)',
      border: recommended
        ? '1px solid var(--accent-main)'
        : '1px solid var(--accent-200)',
      backgroundColor: recommended ? 'var(--accent-100)' : 'var(--white)',
    }}
  >
    <Box
      sx={{
        width: 44,
        height: 44,
        borderRadius: 'var(--radius-m)',
        backgroundColor: 'var(--accent-150)',
        color: 'var(--accent-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <Typography className="h4">{title}</Typography>
        {recommended && (
          <Badge text="Recommended" color="accent" size="small" filled />
        )}
        {state && <Badge text={state.text} color={state.color} size="small" />}
      </Box>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {description}
      </Typography>
      <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.main ? 'main' : 'secondary'}
            disabled={action.disabled}
            disableAutoStretch
            onClick={action.onClick}
            sx={{ minHeight: '36px', height: '36px', paddingInline: '16px' }}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  </Box>
);
