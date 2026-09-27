import { Box, Stack } from '@mui/material';
import { Typography } from '@components/index';
import { Territory } from '@definition/territory';
import { streetMatches } from '../helpers';
import { territoryKey } from '../street_search';
import { clickableRow } from './table_styles';
import { tx } from '@services/i18n/translation';

// "Rheinstraße → M12, M14": which territories a searched street runs through
const StreetResults = ({
  search,
  territories,
  onOpen,
}: {
  search: string;
  territories: Territory[];
  onOpen: (id: string) => void;
}) => {
  const streets = streetMatches(search);
  if (!streets.length) return null;

  const byKey = new Map(
    territories.map((territory) => [territoryKey(territory.number), territory])
  );

  return (
    <Stack spacing="8px">
      <Typography className="body-small-semibold" color="var(--grey-400)">
        {tx('Streets')}
      </Typography>

      {streets.map((street) => (
        <Stack
          key={street.name}
          direction="row"
          sx={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          <Typography className="body-small-semibold">{street.name}</Typography>
          <Typography className="body-small-regular" color="var(--grey-350)">
            →
          </Typography>

          {street.numbers.map((number) => {
            const territory = byKey.get(territoryKey(number));

            return (
              <Box
                key={number}
                {...(territory ? clickableRow(() => onOpen(territory.id)) : {})}
                sx={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-s)',
                  backgroundColor: 'var(--accent-150)',
                  ...(territory && {
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'var(--accent-200)' },
                  }),
                }}
              >
                <Typography
                  className="body-small-semibold"
                  color={territory ? 'var(--accent-main)' : 'var(--grey-400)'}
                >
                  {territory?.number ?? number}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
};

export default StreetResults;
