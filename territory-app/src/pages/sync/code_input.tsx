import { KeyboardEvent, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, keyframes } from '@mui/material';
import { MuiOtpInput } from 'mui-one-time-password-input';
import Typography from '@components/typography';
import { t } from '../../i18n';

// ---- the 6 digits of a pairing code, in blocks like the app lock's PIN:
// an empty block holds a soft shape, a typed one its digit ----

const LENGTH = 6;
const CELL = 46;
// the cells and gaps shrink together on a narrow phone, up to full size
const GAP = 'clamp(4px, 2vw, 8px)';
const cell = {
  flex: '1 1 0',
  minWidth: 0,
  maxWidth: CELL,
  aspectRatio: '1',
} as const;

// the app lock's PIN symbols (feat/app-lock), as plain shapes
const SHAPES = [
  { box: '-2 -2 20 20', d: 'M7.92 -1.24 17.09 7.92 7.92 17.09 -1.24 7.92Z' },
  {
    box: '-1 -1 20 18',
    d: 'M6.83 1.21C7.81-.4 10.19-.4 11.17 1.21L14.49 6.69 17.67 12.24C18.61 13.88 17.42 15.9 15.5 15.93L9 16 2.5 15.93C.58 15.9-.61 13.88.33 12.24L3.51 6.69Z',
  },
  {
    box: '-1 -1 18 18',
    d: 'M14.92 6.23C16.27 7 16.27 8.93 14.92 9.7L12.08 11.33C11.76 11.51 11.51 11.76 11.33 12.07L9.7 14.92C8.94 16.27 7 16.27 6.23 14.92L4.6 12.07C4.43 11.76 4.17 11.51 3.86 11.33L1.01 9.7C-.34 8.93-.34 7 1.01 6.23L3.86 4.6C4.17 4.42 4.43 4.17 4.6 3.86L6.23 1.01C7-.34 8.94-.34 9.7 1.01L11.33 3.86C11.51 4.17 11.76 4.42 12.08 4.6Z',
  },
  {
    box: '-1 -1 18 18',
    d: 'M14.32 3.16C16.48 6.01 16.48 9.94 14.32 12.79 13.03 14.5 11.09 15.61 8.96 15.88 5.42 16.33 2.01 14.36.63 11.07-.21 9.09-.21 6.86.63 4.88 2.01 1.59 5.42-.38 8.96.06 11.09.33 13.03 1.45 14.32 3.16Z',
  },
  {
    box: '-1 -1 18 19',
    d: 'M14.77 6.31C16.04 7.09 16.04 8.94 14.77 9.72L14.25 10.03C13.58 10.44 13.22 11.21 13.31 11.99L13.39 12.59C13.57 14.07 12.13 15.22 10.72 14.71L10.15 14.51C9.41 14.24 8.59 14.43 8.04 14.99L7.62 15.42C6.57 16.49 4.77 16.08 4.29 14.66L4.1 14.09C3.85 13.35 3.18 12.82 2.4 12.74L1.8 12.68C.31 12.53-.49 10.86.32 9.6L.65 9.1C1.07 8.44 1.07 7.59.65 6.93L.32 6.42C-.49 5.16.31 3.5 1.8 3.35L2.4 3.29C3.18 3.21 3.85 2.68 4.1 1.93L4.29 1.36C4.77-.06 6.57-.47 7.62.6L8.04 1.03C8.59 1.6 9.41 1.78 10.15 1.52L10.72 1.31C12.13.8 13.57 1.95 13.39 3.44L13.31 4.04C13.22 4.82 13.58 5.58 14.25 5.99Z',
  },
  {
    box: '-1 -1 20 19',
    d: 'M17.61 7.01C17.97 7.63 17.97 8.39 17.61 9.01L14.14 15.02C13.79 15.64 13.13 16.02 12.41 16.02H5.47C4.76 16.02 4.1 15.64 3.74 15.02L.27 9.01C-.09 8.39-.09 7.63.27 7.01L3.74 1C4.1.38 4.76 0 5.47 0H12.41C13.13 0 13.79.38 14.14 1Z',
  },
];

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const pop = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(1.07); }
  100% { transform: scale(1); }
`;

const shake = keyframes`
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-6px); }
  40%  { transform: translateX(5px); }
  60%  { transform: translateX(-3px); }
  80%  { transform: translateX(2px); }
  100% { transform: translateX(0); }
`;

const isDigit = (text: string) => /^\d$/.test(text);

const CodeInput = ({
  value,
  onChange,
  onComplete,
  error = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
}) => {
  const box = useRef<HTMLDivElement>(null);
  // the dialog takes focus as it opens; the first block takes it back
  useEffect(() => {
    const timer = setTimeout(
      () => box.current?.querySelector('input')?.focus(),
      150
    );
    return () => clearTimeout(timer);
  }, []);
  // a fresh mix of shapes each time the dialog opens
  const shapes = useMemo(
    () =>
      [...SHAPES.keys()]
        .map((index) => ({ index, key: Math.random() }))
        .sort((a, b) => a.key - b.key)
        .map(({ index }) => SHAPES[index]),
    []
  );

  // one press deletes one digit, and the cursor follows
  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && value.length === LENGTH) {
        event.preventDefault();
        onComplete?.(value);
        return;
      }
      if (event.key !== 'Backspace' || !value.length) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const next = value.slice(0, -1);
      onChange(next);
      requestAnimationFrame(() =>
        box.current?.querySelectorAll('input')[next.length]?.focus()
      );
    },
    [value, onChange, onComplete]
  );

  const color = (filled: boolean) =>
    error
      ? 'var(--red-dark)'
      : filled
        ? 'var(--accent-main)'
        : 'var(--accent-300)';

  return (
    <Box
      ref={box}
      role="group"
      aria-label={t('invite.codeLabel')}
      onKeyDownCapture={onKeyDownCapture}
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: CELL * LENGTH + 8 * (LENGTH - 1),
        margin: '0 auto',
        animation: error ? `${shake} 320ms ease-in-out` : 'none',
      }}
    >
      <MuiOtpInput
        value={value}
        onChange={(next) => {
          const digits = next.replace(/\D/g, '').slice(0, LENGTH);
          onChange(digits);
          // only the digit typed last completes it, not a full code shown
          // again, which would start the pairing over and over
          if (digits.length === LENGTH && value.length < LENGTH) {
            onComplete?.(digits);
          }
        }}
        length={LENGTH}
        autoFocus
        display="flex"
        gap={GAP}
        validateChar={isDigit}
        TextFieldsProps={(index) => {
          const filled = !!value[index];
          return {
            autoComplete: 'off',
            type: 'tel',
            inputProps: {
              inputMode: 'numeric',
              pattern: '[0-9]*',
              autoComplete: 'one-time-code',
              'aria-label': t('invite.digit', { position: index + 1 }),
            },
            sx: {
              ...cell,
              '.MuiOutlinedInput-input': {
                color: 'transparent',
                caretColor: 'transparent',
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                padding: 0,
                textAlign: 'center',
                '&::selection': { backgroundColor: 'transparent' },
              },
              '.MuiOutlinedInput-root': {
                height: '100%',
                animation: filled ? `${pop} 220ms ${SPRING} both` : 'none',
                '& fieldset, &:hover fieldset': {
                  border: `1px solid ${color(filled)}`,
                  borderRadius: 'var(--radius-l)',
                  transition: 'border-color 150ms ease',
                },
                '&.Mui-focused fieldset': {
                  border: `1px solid ${error ? 'var(--red-dark)' : 'var(--accent-main)'}`,
                },
              },
            },
          };
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          gap: GAP,
          pointerEvents: 'none',
        }}
      >
        {shapes.slice(0, LENGTH).map((shape, index) => {
          const digit = value[index];
          return (
            <Box
              key={index}
              sx={{
                ...cell,
                display: 'grid',
                placeItems: 'center',
                '& > *': { gridArea: '1 / 1' },
              }}
            >
              <Box
                component="svg"
                viewBox={shape.box}
                sx={{
                  width: 16,
                  height: 16,
                  fill: 'var(--accent-300)',
                  opacity: digit ? 0 : 0.5,
                  transform: digit ? 'scale(0.6) rotate(25deg)' : 'scale(1)',
                  transition: `opacity 180ms ease, transform 220ms ${SPRING}`,
                }}
              >
                <path d={shape.d} />
              </Box>
              <Typography
                className="h2"
                color={error ? 'var(--red-dark)' : 'var(--accent-main)'}
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  opacity: digit ? 1 : 0,
                  transform: digit ? 'scale(1)' : 'scale(0.7)',
                  transition: `opacity 180ms ease, transform 220ms ${SPRING}`,
                }}
              >
                {digit ?? ''}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default CodeInput;
