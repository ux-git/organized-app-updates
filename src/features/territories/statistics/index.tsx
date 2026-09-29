import { useState } from 'react';
import { Box, MenuItem, Stack } from '@mui/material';
import { useNavigate } from 'react-router';
import { Button, Select, Typography } from '@components/index';
import DatePicker from '@components/date_picker';
import { useAtomValue } from 'jotai';
import { format } from 'date-fns';
import { appLocaleState, monthShortNamesState } from '@states/app';
import { tx } from '@services/i18n/translation';
import { territoriesWithStatusState } from '@states/territories';
import {
  averageDuration,
  chartsCut,
  completionCounts,
  coverageRate,
  durationBuckets,
  trimEmptyBands,
  gapBuckets,
  serviceYear,
  inProgressPerMonth,
  periodWindow,
  rangeMonths,
  StatsRange,
  STATS_PERIODS,
  medianDuration,
  doNotCallAges,
} from '../helpers';
import { ChartCard, ColumnChart, Gauge, StatRow } from '../components/charts';
import StatTile from '../components/stat_tile';
import AttentionCard from './attention_card';
import CoverageGrid from './coverage_grid';
import {
  PublisherLoadCard,
  PublisherSplit,
  PublisherTrend,
} from './publisher_cards';
import CoverageCycleCard from './coverage_cycle_card';

const dayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayEnd = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

// a service year that has just begun has nothing to show yet
const defaultPeriod = () => {
  const month = new Date().getMonth();
  return month === 8 || month === 9 ? `sy${serviceYear() - 1}` : 'last12';
};

const TerritoriesStatistics = () => {
  const navigate = useNavigate();

  const territories = useAtomValue(territoriesWithStatusState);
  const monthNames = useAtomValue(monthShortNamesState);

  const locale = useAtomValue(appLocaleState);

  const [period, setPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  // the last complete From–To, kept on screen while a date is being fixed
  const [customRange, setCustomRange] = useState<StatsRange>();

  const current = serviceYear();
  const today = dayStart(new Date());
  const custom = period === 'custom';
  const range: StatsRange =
    (custom ? customRange : periodWindow(period)) ??
    periodWindow(defaultPeriod())!;
  const months = rangeMonths(range).map(({ month }) => monthNames[month]);

  const fromError = custom && !from ? tx('Pick a date') : '';
  const toError = !custom
    ? ''
    : !to
      ? tx('Pick a date')
      : from && from > to
        ? tx('Before the start date')
        : '';

  const rangeText = `${format(range.start, 'PP', { locale })} – ${format(
    range.end,
    'PP',
    { locale }
  )}`;

  // starts from the period on screen, so nothing jumps until a date changes
  const choosePeriod = (next: string) => {
    if (next === 'custom') {
      const start = dayStart(range.start);
      const end = range.end > today ? today : dayStart(range.end);

      setFrom(start);
      setTo(end);
      setCustomRange({ start, end: dayEnd(end) });
    }

    setPeriod(next);
  };

  const changeCustom = (nextFrom: Date | null, nextTo: Date | null) => {
    const start = nextFrom && dayStart(nextFrom);
    const end = nextTo && dayStart(nextTo);

    setFrom(start);
    setTo(end);

    if (start && end && start <= end) {
      setCustomRange({ start, end: dayEnd(end) });
    }
  };

  const rate = coverageRate(territories, range);
  const ages = doNotCallAges(territories, range);
  const buckets = trimEmptyBands(durationBuckets(territories, range));
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          mobile: 'minmax(0, 1fr)',
          tablet600: 'repeat(12, minmax(0, 1fr))',
        },
        gap: '16px',
        alignItems: 'stretch',
      }}
    >
      <Box
        sx={{
          gridColumn: '1 / -1',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <Box sx={{ width: { mobile: '100%', tablet600: '280px' } }}>
          <Select
            label={tx('Period')}
            value={period}
            onChange={(event) => choosePeriod(String(event.target.value))}
          >
            {STATS_PERIODS().map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <Typography className="body-regular">{option.label}</Typography>
              </MenuItem>
            ))}
          </Select>
        </Box>
        {custom && (
          // side by side even on a phone: two halves of one range
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              flex: { mobile: '1 1 100%', tablet600: '0 1 456px' },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DatePicker
                label={tx('From')}
                value={from}
                maxDate={to ?? today}
                error={!!fromError}
                helperText={fromError}
                onChange={(value) => changeCustom(value, to)}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DatePicker
                label={tx('To')}
                value={to}
                minDate={from}
                maxDate={today}
                error={!!toError}
                helperText={toError}
                onChange={(value) => changeCustom(from, value)}
              />
            </Box>
          </Box>
        )}
        {/* a complete From–To already says it */}
        {(!custom || fromError || toError) && (
          <Box
            sx={{
              minHeight: { tablet600: '48px' },
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Typography className="body-small-regular" color="var(--grey-400)">
              {custom
                ? tx('Still showing {{range}}', { range: rangeText })
                : rangeText}
            </Typography>
          </Box>
        )}
      </Box>

      <ChartCard
        title={tx('Coverage')}
        hint={tx('Territories covered at least once in this period')}
        span={4}
      >
        <Gauge
          value={rate.rate}
          label={tx('{{covered}} of {{total}} covered', {
            covered: rate.covered,
            total: rate.total,
          })}
        />

        <Stack spacing="12px">
          {completionCounts(territories, range).map((entry) => (
            <StatRow
              key={entry.label}
              label={entry.label}
              value={entry.value}
              max={territories.length}
              color={entry.color}
            />
          ))}
        </Stack>
      </ChartCard>

      <ChartCard
        title={tx('Time to cover a territory')}
        hint={tx('Median: {{median}} months · average: {{average}} months', {
          median: medianDuration(territories, range),
          average: averageDuration(territories, range),
        })}
        span={4}
      >
        <Stack spacing="12px">
          {buckets.map((bucket) => (
            <StatRow
              key={bucket.label}
              label={bucket.label}
              value={bucket.value}
              max={maxBucket}
            />
          ))}
        </Stack>
      </ChartCard>

      <ChartCard
        title={tx('Territories in work')}
        hint={
          chartsCut(range)
            ? tx(
                'How many were being worked in each of the last 24 months of the period'
              )
            : tx('How many were being worked in each month of the period')
        }
        span={4}
      >
        <ColumnChart
          values={inProgressPerMonth(territories, range)}
          labels={months}
        />
      </ChartCard>

      <CoverageCycleCard buckets={gapBuckets(territories, range)} />

      <PublisherLoadCard territories={territories} />

      <ChartCard
        title={tx('Do not call')}
        hint={tx('Added counts the chosen period')}
        span={4}
        action={
          <Button
            variant="small"
            disableAutoStretch
            minHeight={32}
            onClick={() =>
              navigate('/territories/do-not-calls', {
                state: { parent: 'Territory coverage statistics' },
              })
            }
          >
            {tx('See all')}
          </Button>
        }
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '8px',
          }}
        >
          <StatTile label={tx('Older than 2 years')} value={String(ages.old)} />
          <StatTile label={tx('Added')} value={String(ages.added)} />
          <StatTile label={tx('Total')} value={String(ages.total)} />
        </Box>

        <Stack spacing="12px">
          {[...territories]
            .sort((a, b) => b.doNotCalls.length - a.doNotCalls.length)
            .slice(0, 5)
            .map((territory) => (
              <StatRow
                key={territory.id}
                label={`${territory.number} · ${territory.name}`}
                value={territory.doNotCalls.length}
                max={Math.max(
                  ...territories.map((item) => item.doNotCalls.length),
                  1
                )}
              />
            ))}
        </Stack>
      </ChartCard>
      <CoverageGrid
        territories={territories}
        years={[current, current - 1, current - 2]}
      />

      <PublisherSplit territories={territories} />

      <PublisherTrend territories={territories} range={range} />

      <AttentionCard territories={territories} />
    </Box>
  );
};

export default TerritoriesStatistics;
