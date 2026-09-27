import { useState } from 'react';
import { Box, Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import { Typography } from '@components/index';
import Tooltip from '@components/tooltip';
import {
  publisherCoverage,
  PublisherSort,
  publishersPerMonth,
  rangeMonths,
  StatsRange,
} from '../helpers';
import { ChartCard, ColumnChart } from '../components/charts';
import PublisherLoad, {
  PublisherSortButton,
} from '../components/publisher_load';
import { Territory } from '@definition/territory';
import { monthShortNamesState } from '@states/app';
import { tx } from '@services/i18n/translation';

export const PublisherSplit = ({
  territories,
}: {
  territories: Territory[];
}) => {
  const { withTerritory, without, never } = publisherCoverage(territories);

  const [open, setOpen] = useState<string>();
  const [sort, setSort] = useState<PublisherSort>('count');

  const total = withTerritory.length + without.length + never.length || 1;
  const share = Math.round((withTerritory.length / total) * 100);

  const rows = [
    {
      label: 'With territory',
      tooltip: '{{n}} with a territory',
      entries: withTerritory,
      color: 'var(--accent-main)',
    },
    {
      label: 'Without territory',
      tooltip: '{{n}} without one now',
      entries: without,
      color: 'var(--accent-300)',
    },
    {
      label: 'Never had a territory',
      tooltip: '{{n}} never had a territory',
      entries: never,
      color: 'var(--orange-main)',
    },
  ].map((row) => ({ ...row, value: row.entries.length }));

  const opened = rows.find((row) => row.label === open);

  return (
    <ChartCard
      title={tx('Publishers with a territory')}
      hint={tx('{{share}}% of publishers and groups hold at least one', {
        share,
      })}
      span={4}
      action={opened && <PublisherSortButton sort={sort} onChange={setSort} />}
    >
      <Stack direction="row" spacing="4px" sx={{ height: '20px' }}>
        {rows.map((row) => (
          <Tooltip key={row.label} title={tx(row.tooltip, { n: row.value })}>
            <Box
              sx={{
                flexGrow: row.value || 0.02,
                borderRadius: 'var(--radius-s)',
                backgroundColor: row.color,
              }}
            />
          </Tooltip>
        ))}
      </Stack>

      <Stack spacing="2px">
        {rows.map((row) => (
          <Stack
            key={row.label}
            direction="row"
            spacing="8px"
            onClick={() => setOpen(open === row.label ? undefined : row.label)}
            sx={{
              alignItems: 'center',
              cursor: 'pointer',
              padding: '6px 8px',
              margin: '0 -8px',
              borderRadius: 'var(--radius-m)',
              transition: 'background-color 0.15s ease',
              backgroundColor:
                open === row.label ? 'var(--accent-150)' : undefined,
              '&:hover': { backgroundColor: 'var(--accent-100)' },
            }}
          >
            <Box
              sx={{
                width: '10px',
                height: '10px',
                borderRadius: 'var(--radius-max)',
                backgroundColor: row.color,
              }}
            />
            <Typography className="body-small-regular" color="var(--black)">
              {tx(row.label)}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Typography className="body-small-semibold" color="var(--black)">
              {row.value}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {opened && (
        <PublisherLoad
          key={opened.label}
          entries={opened.entries}
          sort={sort}
        />
      )}
    </ChartCard>
  );
};

export const PublisherLoadCard = ({
  territories,
}: {
  territories: Territory[];
}) => {
  const [sort, setSort] = useState<PublisherSort>('count');

  return (
    <ChartCard
      title={tx('Publishers')}
      hint={
        sort === 'count'
          ? tx('Most territories held')
          : tx('Territories held, by name')
      }
      span={4}
      action={<PublisherSortButton sort={sort} onChange={setSort} />}
    >
      <PublisherLoad
        entries={publisherCoverage(territories).withTerritory}
        sort={sort}
        limit={9}
      />
    </ChartCard>
  );
};

export const PublisherTrend = ({
  territories,
  range,
}: {
  territories: Territory[];
  range: StatsRange;
}) => {
  const monthNames = useAtomValue(monthShortNamesState);

  const months = rangeMonths(range).map(({ month }) => monthNames[month]);
  const values = publishersPerMonth(territories, range);

  return (
    <ChartCard
      title={tx('Publishers holding a territory')}
      hint={tx('Each month of the period')}
      span={8}
    >
      <ColumnChart values={values} labels={months} />
    </ChartCard>
  );
};
