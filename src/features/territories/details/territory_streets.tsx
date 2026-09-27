import { tx } from '@services/i18n/translation';
import { Stack } from '@mui/material';
import { Typography } from '@components/index';
import { Territory } from '@definition/territory';
import { territoryStreets } from '../helpers';

// from the street index a private build carries; nothing without one
const TerritoryStreets = ({ territory }: { territory: Territory }) => {
  const streets = territoryStreets(territory.number);
  if (!streets.length) return null;

  return (
    <Stack spacing="2px">
      <Typography className="body-small-semibold" color="var(--grey-400)">
        {tx('Streets')}
      </Typography>
      <Typography className="body-small-regular" color="var(--black)">
        {streets.join(', ')}
      </Typography>
    </Stack>
  );
};

export default TerritoryStreets;
