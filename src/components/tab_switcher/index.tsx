import { Box, ButtonBase, keyframes } from '@mui/material';
import { cloneElement, useState } from 'react';
import {
  TabSwitcherOption,
  TabSwitcherProps,
  TabSwitcherSurface,
} from './index.types';

// the thumb stretches a little mid-way; two names
// taken in turns restart it on every change
const stretch = (turn: number) => keyframes`
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.06); }
  100% { transform: scaleX(1); --turn: ${turn}; }
`;
const STRETCHES = [stretch(0), stretch(1)];

const PALETTE: Record<
  TabSwitcherSurface,
  { track: string; trackBorder: string; thumb: string; thumbBorder: string }
> = {
  tinted: {
    track: 'var(--accent-150)',
    trackBorder: 'var(--accent-200)',
    thumb: 'var(--accent-200)',
    thumbBorder: 'var(--accent-main)',
  },
  // the tinted look one step lighter, with a softer outline, so on white and
  // other light backgrounds the switch doesn't outshine the content around it
  light: {
    track: 'var(--accent-100)',
    trackBorder: 'var(--accent-200)',
    thumb: 'var(--accent-150)',
    thumbBorder: 'var(--accent-300)',
  },
};

/** Reusable segmented tab control. */
const TabSwitcher = <T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  surface = 'tinted',
  iconOnly = false,
  collapseBelow,
  sx,
}: TabSwitcherProps<T>) => {
  const palette = PALETTE[surface];

  const activeIndex = options.findIndex((option) => option.value === value);
  const [seen, setSeen] = useState(activeIndex);
  const [moves, setMoves] = useState(0);
  if (seen !== activeIndex) {
    setSeen(activeIndex);
    setMoves(moves + 1);
  }
  const gap = 8;
  const collapse = collapseBelow
    ? `@container (max-width: ${collapseBelow}px)`
    : undefined;

  return (
    <Box
      role="tablist"
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        display: 'flex',
        gap: `${gap}px`,
        padding: '4px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: palette.track,
        border: `1px solid ${palette.trackBorder}`,
        ...(collapse && { containerType: 'inline-size' }),
        ...sx,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: '4px',
          bottom: '4px',
          left: '4px',
          width: `calc((100% - ${(options.length - 1) * gap + 8}px) / ${options.length})`,
          transform: `translateX(calc(${Math.max(activeIndex, 0)} * (100% + ${gap}px)))`,
          // a quick spring: it overshoots a touch and settles
          // eases off gently and lands softly, never past the track's edge
          transition: 'transform 0.42s cubic-bezier(0.65, 0, 0.25, 1)',
          opacity: activeIndex === -1 ? 0 : 1,
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            // the track's radius-l less its 4px padding, so both curves run parallel
            borderRadius: 'var(--radius-s)',
            backgroundColor: palette.thumb,
            border: `1px solid ${palette.thumbBorder}`,
            animation: moves
              ? `${STRETCHES[moves % 2]} 0.42s ease-in-out`
              : 'none',
          }}
        />
      </Box>

      {options.map((option: TabSwitcherOption<T>) => {
        const isActive = option.value === value;

        return (
          <ButtonBase
            key={option.value}
            role="tab"
            className="body-small-regular"
            aria-selected={isActive}
            aria-label={iconOnly || collapse ? option.label : undefined}
            disabled={option.disabled}
            disableRipple
            onClick={() => onChange(option.value)}
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: iconOnly ? '4px 8px' : '4px 12px',
              minHeight: '28px',
              borderRadius: 'var(--radius-s)',
              fontFamily: 'inherit',
              color: isActive ? 'var(--accent-dark)' : 'var(--accent-400)',
              transition: 'color 0.2s ease-out',
              '&.Mui-disabled': { opacity: 0.5 },
              '& svg, & svg g, & svg g path': {
                fill: isActive ? 'var(--accent-dark)' : 'var(--accent-400)',
                transition: 'fill 0.16s ease-out',
              },
              '&:focus-visible': { outline: 'var(--accent-main) auto 1px' },
              ...(collapse && {
                [collapse]: {
                  padding: '4px 8px',
                  '& > span:last-of-type:not(:first-of-type)': {
                    display: 'none',
                  },
                },
              }),
            }}
          >
            {option.icon && (
              <Box
                component="span"
                sx={{ display: 'inline-flex', flexShrink: 0 }}
              >
                {cloneElement(option.icon, { width: 18, height: 18 })}
              </Box>
            )}
            {!iconOnly && (
              // the bold width is kept free, so the label doesn't jump as its
              // weight eases from regular to semibold
              <Box
                component="span"
                sx={{
                  display: 'grid',
                  minWidth: 0,
                  '& > span': {
                    gridArea: '1 / 1',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontWeight: isActive ? 600 : 400,
                    // a regular label spaced a touch wider is about as wide as
                    // its semibold, so the text hardly changes width
                    letterSpacing: isActive ? 'normal' : '0.025em',
                    transition:
                      'font-weight 0.2s ease-out, letter-spacing 0.2s ease-out',
                  }}
                >
                  {option.label}
                </Box>
                <Box
                  component="span"
                  aria-hidden
                  sx={{ fontWeight: 600, visibility: 'hidden' }}
                >
                  {option.label}
                </Box>
              </Box>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
};

export default TabSwitcher;
