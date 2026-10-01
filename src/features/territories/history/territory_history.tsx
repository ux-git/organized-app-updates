import { Stack } from '@mui/material';
import { Typography } from '@components/index';
import Card from '@components/card';
import { daysLabel, withAssignments } from '../helpers';
import TerritoryAssignments from '../details/territory_assignments';
import TerritorySummary from '../components/territory_summary';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

// editors open a record to read and fix it; everyone else only reads
const TerritoryHistory = ({
  territory,
  onChange,
}: {
  territory: Territory;
  onChange?: (territory: Territory) => void;
}) => (
  <Card>
    <Stack spacing="4px">
      <Typography className="h2" color="var(--black)">
        {tx('Territory {{number}}', { number: territory.number })}
      </Typography>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {territory.name} · {territory.city}
      </Typography>
    </Stack>

    <TerritorySummary
      territory={territory}
      meta={tx('Last covered {{days}} ago', {
        days: daysLabel(territory.daysSinceCovered),
      })}
    />

    <TerritoryAssignments
      territory={territory}
      onChange={
        onChange && ((next) => onChange(withAssignments(territory, next)))
      }
      onNotes={onChange && ((notes) => onChange({ ...territory, notes }))}
    />
  </Card>
);

export default TerritoryHistory;
