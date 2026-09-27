import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useBreakpoints } from '@hooks/index';
import { Box, Stack } from '@mui/material';
import { Badge, Button, CustomDivider, Typography } from '@components/index';
import { ChartCard } from '../components/charts';
import { CoveredBadge, StatusBadge } from '../components/territory_badges';
import TruncatedText from '../components/truncated_text';
import { daysLabel, waitingAge } from '../helpers';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

const AttentionCard = ({ territories }: { territories: Territory[] }) => {
  const navigate = useNavigate();

  const { laptopUp } = useBreakpoints();

  const [limit, setLimit] = useState(10);

  const aged = territories.map((territory) => ({
    territory,
    age: waitingAge(territory),
  }));

  // never covered comes first: it has waited longer than any date can show
  const rows = aged
    .sort(
      (a, b) =>
        Number(b.age.kind === 'never') - Number(a.age.kind === 'never') ||
        b.age.days - a.age.days
    )
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const half = Math.ceil(rows.length / 2);
  const columns = laptopUp ? [rows.slice(0, half), rows.slice(half)] : [rows];

  const overYear = aged.filter(
    ({ age }) => age.kind !== 'never' && age.days > 365
  ).length;
  const never = aged.filter(({ age }) => age.kind === 'never').length;

  return (
    <ChartCard
      title={tx('Waiting the longest')}
      hint={`${tx(
        '{{over}} of {{total}} territories out or waiting for over a year',
        { over: overYear, total: territories.length }
      )}${never ? ` · ${tx('{{never}} never covered', { never })}` : ''}`}
      span={12}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: laptopUp
            ? 'minmax(0, 1fr) auto minmax(0, 1fr)'
            : 'minmax(0, 1fr)',
          columnGap: '16px',
          rowGap: '4px',
          alignItems: 'stretch',
        }}
      >
        {columns.map((column, columnIndex) => [
          columnIndex > 0 && (
            <CustomDivider
              key={`divider-${column[0]?.rank}`}
              orientation="vertical"
              flexItem
              color="var(--accent-200)"
            />
          ),
          <Stack
            key={column[0]?.rank}
            spacing="4px"
            divider={<CustomDivider color="var(--accent-200)" />}
          >
            {column.map(({ territory, age, rank }) => (
              <Stack
                key={territory.id}
                direction="row"
                spacing="12px"
                onClick={() =>
                  navigate(`/territories/${territory.id}`, {
                    state: { parent: 'Territory coverage statistics' },
                  })
                }
                sx={{
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '10px 8px',
                  borderRadius: 'var(--radius-m)',
                  transition: 'background-color 0.15s ease',
                  '&:hover': { backgroundColor: 'var(--accent-100)' },
                }}
              >
                <Typography
                  className="label-small-regular"
                  color="var(--grey-350)"
                  sx={{ width: '20px', flexShrink: 0 }}
                >
                  {rank}
                </Typography>

                <Typography
                  className="body-small-semibold"
                  color="var(--black)"
                  sx={{ width: '48px', flexShrink: 0 }}
                >
                  {territory.number}
                </Typography>

                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <TruncatedText
                    className="body-small-regular"
                    color="var(--black)"
                    text={territory.name}
                  />
                  <TruncatedText
                    className="label-small-regular"
                    color="var(--grey-350)"
                    text={`${territory.city} · ${tx(
                      '{{households}} households',
                      {
                        households: territory.households,
                      }
                    )}`}
                  />
                </Box>

                <Box sx={{ width: 'fit-content', flexShrink: 0 }}>
                  <StatusBadge status={territory.status} />
                </Box>

                {age.kind === 'never' ? (
                  <Badge
                    size="small"
                    filled={false}
                    color="red"
                    text={tx('Never covered')}
                    sx={{ width: 'fit-content', flexShrink: 0 }}
                  />
                ) : (
                  <CoveredBadge
                    days={age.days}
                    label={
                      age.kind === 'out'
                        ? tx('Out for {{time}}', { time: daysLabel(age.days) })
                        : tx('Waiting {{time}}', { time: daysLabel(age.days) })
                    }
                  />
                )}
              </Stack>
            ))}
          </Stack>,
        ])}
      </Box>

      {territories.length > limit && (
        <Button
          variant="small"
          disableAutoStretch
          onClick={() => setLimit(limit + 10)}
          sx={{ alignSelf: 'flex-start' }}
        >
          {tx('Show more')}
        </Button>
      )}
    </ChartCard>
  );
};

export default AttentionCard;
