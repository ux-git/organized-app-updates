import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { tx } from '@services/i18n/translation';
import { Box, Collapse, Stack } from '@mui/material';
import { Button, Typography } from '@components/index';
import { Territory } from '@definition/territory';
import { territoryTileStreetsState } from '@states/territories';

const SHOWN = 6;

const chips = (streets: string[]) =>
  streets.map((street) => (
    <Box
      key={street}
      sx={{
        padding: '2px 8px',
        borderRadius: 'var(--radius-s)',
        backgroundColor: 'var(--accent-150)',
      }}
    >
      <Typography className="body-small-regular" color="var(--black)">
        {street}
      </Typography>
    </Box>
  ));

const row = { flexWrap: 'wrap', gap: '6px' } as const;

// the streets the territory's small map finds inside its borders
const TerritoryStreets = ({ territory }: { territory: Territory }) => {
  const streets = useAtomValue(territoryTileStreetsState)[territory.id] ?? [];
  const [open, setOpen] = useState(false);

  if (!territory.boundary?.length || !streets.length) return null;

  const rest = streets.slice(SHOWN);

  return (
    <Stack spacing="6px">
      <Typography className="body-small-semibold" color="var(--grey-400)">
        {`${tx('Streets')} · ${streets.length}`}
      </Typography>

      <Stack direction="row" sx={row}>
        {chips(streets.slice(0, SHOWN))}
      </Stack>

      {rest.length > 0 && (
        <>
          <Collapse in={open}>
            <Stack direction="row" sx={row}>
              {chips(rest)}
            </Stack>
          </Collapse>

          <Button
            variant="small"
            disableAutoStretch
            minHeight={28}
            onClick={() => setOpen(!open)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {open
              ? tx('Show less')
              : tx('Show all {{n}} streets', { n: streets.length })}
          </Button>
        </>
      )}
    </Stack>
  );
};

export default TerritoryStreets;
