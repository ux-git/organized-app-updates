import { useState } from 'react';
import { Box, ButtonBase, Stack } from '@mui/material';
import { Typography } from '@components/index';
import { tx } from '@services/i18n/translation';
import { Bucket } from './views';

const Dot = ({ color }: { color: string }) => (
  <Box
    component="span"
    sx={{
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      flexShrink: 0,
      backgroundColor: `var(${color})`,
    }}
  />
);

const Entry = ({ item }: { item: Bucket }) => (
  <Stack direction="row" sx={{ alignItems: 'center', gap: '6px' }}>
    <Dot color={item.color} />
    <Typography className="label-small-regular" color="var(--grey-400)">
      {tx(item.label)}
    </Typography>
  </Stack>
);

const MapLegend = ({ items }: { items: Bucket[] }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
    {items.map((item) => (
      <Entry key={item.key} item={item} />
    ))}
  </Box>
);

// on a phone it stays folded into its dots until tapped, so it leaves the territories free
export const LegendIsland = ({ items }: { items: Bucket[] }) => {
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  return (
    <ButtonBase
      disableRipple
      aria-expanded={open}
      aria-label={open ? tx('Hide the legend') : tx('Show the legend')}
      onClick={() => setOpen(!open)}
      sx={{
        padding: open ? '8px 12px' : '12px 10px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--white)',
        border: '1px solid var(--accent-200)',
        boxShadow: 'var(--hover-shadow)',
        '&:focus-visible': { outline: 'var(--accent-main) auto 1px' },
      }}
    >
      {open ? (
        <Stack sx={{ gap: '4px', alignItems: 'flex-start' }}>
          {items.map((item) => (
            <Entry key={item.key} item={item} />
          ))}
        </Stack>
      ) : (
        <Stack direction="row" sx={{ gap: '4px' }}>
          {items.map((item) => (
            <Dot key={item.key} color={item.color} />
          ))}
        </Stack>
      )}
    </ButtonBase>
  );
};

export default MapLegend;
