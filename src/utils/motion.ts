import { keyframes } from '@mui/material';

// Material 3 motion tokens, so every view change in the app moves alike
export const EASE_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
export const EASE_DECELERATE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';
export const DURATION_SHORT = 200;
export const DURATION_MEDIUM = 300;

const rise = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;

// for a view kept mounted and switched with `hidden`: each time it is shown
// again it rises into place, as the animation restarts with the display
export const revealSx = {
  '&:not([hidden])': {
    animation: `${rise} ${DURATION_MEDIUM}ms ${EASE_DECELERATE}`,
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};
