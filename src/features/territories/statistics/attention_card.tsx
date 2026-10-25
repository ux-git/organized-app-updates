import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import { Box, Stack } from '@mui/material';
import { Badge, Button, CustomDivider, Typography } from '@components/index';
import { ChartCard } from '@features/territories/components/charts';
import {
  CoveredBadge,
  StatusBadge,
} from '@features/territories/components/territory_badges';
import TruncatedText from '@features/territories/components/truncated_text';
import { daysLabel, waitingAge } from '@features/territories/helpers';
import { Territory } from '@definition/territory';

const AttentionCard = ({ territories }: { territories: Territory[] }) => {
  const { t } = useAppTranslation();

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
      title={t('tr_territoryWaitingTheLongest')}
      hint={`${t('tr_territoryOfTerritoriesOutOrWaitingForOverAYear', { over: overYear, total: territories.length })}${never ? ` · ${t('tr_territoryNeverCoveredCount', { never })}` : ''}`}
      note={t('tr_territoryAsOfToday')}
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
              key={`divider-${columnIndex}`}
              orientation="vertical"
              flexItem
              color="var(--accent-200)"
            />
          ),
          <Stack
            key={`column-${columnIndex}`}
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
                    state: {
                      parent: 'tr_territoryTerritoryCoverageStatistics',
                    },
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

                {/* too narrow for both, the badges go under the name */}
                <Box
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: '12px',
                    rowGap: '6px',
                  }}
                >
                  <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
                    <TruncatedText
                      className="body-small-regular"
                      color="var(--black)"
                      text={territory.name}
                    />
                    <TruncatedText
                      className="label-small-regular"
                      color="var(--grey-350)"
                      text={`${territory.city} · ${t(
                        'tr_territoryHouseholdsCount',
                        {
                          households: territory.households,
                        }
                      )}`}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <StatusBadge status={territory.status} />

                    {age.kind === 'never' ? (
                      <Badge
                        size="small"
                        filled={false}
                        color="red"
                        text={t('tr_territoryNeverCovered')}
                        sx={{ width: 'fit-content', flexShrink: 0 }}
                      />
                    ) : (
                      <CoveredBadge
                        days={age.days}
                        label={
                          age.kind === 'out'
                            ? t('tr_territoryOutFor', {
                                time: daysLabel(age.days),
                              })
                            : t('tr_territoryWaiting', {
                                time: daysLabel(age.days),
                              })
                        }
                      />
                    )}
                  </Box>
                </Box>
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
          {t('tr_territoryShowMore')}
        </Button>
      )}
    </ChartCard>
  );
};

export default AttentionCard;
