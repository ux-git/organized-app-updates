import { tx } from '@services/i18n/translation';
import { Box } from '@mui/material';
import { daysLabel } from '../helpers';
import StatTile from '../components/stat_tile';
import { Territory } from '@definition/territory';

// the do-not-call count is the header badge's
const TerritoryStats = ({ territory }: { territory: Territory }) => {
  const months = territory.assignments.map((assignment) => assignment.months);

  const average = months.length
    ? Math.round(months.reduce((acc, value) => acc + value, 0) / months.length)
    : 0;

  // a new territory counts 0 days without ever having been worked
  const neverCovered =
    territory.daysSinceCovered === 0 &&
    !territory.assignments.some((assignment) => assignment.returnedOn);

  let covered = daysLabel(territory.daysSinceCovered);
  if (territory.daysSinceCovered === 0) covered = tx('Today');
  if (neverCovered) covered = tx('Never');

  const stats = [
    {
      id: 'covered',
      label: tx('Last covered'),
      value: covered,
    },
    {
      id: 'households',
      label: tx('Households'),
      value: String(territory.households),
    },
    average && {
      id: 'duration',
      label: tx('Usual duration'),
      value: tx('{{n}} mo', { n: average }),
    },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  return (
    <Box
      sx={{
        display: 'grid',
        gap: '8px',
        gridTemplateColumns: {
          mobile: 'repeat(2, minmax(0, 1fr))',
          tablet688: `repeat(${stats.length}, minmax(0, 1fr))`,
        },
        '& > :last-of-type:nth-of-type(odd)': {
          gridColumn: { mobile: 'span 2', tablet688: 'auto' },
        },
      }}
    >
      {stats.map((stat) => (
        <StatTile key={stat.id} label={stat.label} value={stat.value} />
      ))}
    </Box>
  );
};

export default TerritoryStats;
