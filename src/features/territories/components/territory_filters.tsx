import { ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import { Badge, Button, FilterChip, Typography } from '@components/index';
import { useAtomValue } from 'jotai';
import { territoryCategoriesState } from '@states/territories';
import {
  STATUS_LABEL,
  TerritoryFilters as Filters,
  TerritoryStatus,
  TerritoryType,
  TYPE_LABEL,
} from '@definition/territory';
import { useCurrentUser } from '@hooks/index';
import { appliedFilters, clearedFilters, COVERAGE_PERIODS } from '../helpers';
import HolderPicker from './holder_picker';
import { tx } from '@services/i18n/translation';

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <Typography className="body-small-regular" color="var(--grey-400)">
      {label}
    </Typography>
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '8px' }}>
      {children}
    </Stack>
  </Box>
);

const TerritoryFilters = ({
  filters,
  onChange,
  showTitle = true,
  showClear = true,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  showTitle?: boolean;
  // off where the page puts its own clear button next to its main action
  showClear?: boolean;
}) => {
  const categories = useAtomValue(territoryCategoriesState);

  const { isElder, isServiceCommittee } = useCurrentUser();
  const isTerritoryEditor = isElder || isServiceCommittee;

  const periods = COVERAGE_PERIODS();

  const toggleCoverage = (covered: boolean, period: string) => {
    const same =
      filters.coverage?.covered === covered &&
      filters.coverage?.period === period;

    onChange({ ...filters, coverage: same ? undefined : { covered, period } });
  };

  const applied = appliedFilters(filters);

  const toggle = <T extends string>(key: keyof Filters, value: T) => {
    const current = filters[key] as T[];

    onChange({
      ...filters,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* always shown, starting at 0, so picking a filter doesn't shift the list */}
      <Stack direction="row" spacing="12px" sx={{ alignItems: 'center' }}>
        {showTitle && (
          <Typography className="body-small-semibold" color="var(--black)">
            {tx('Filters')}
          </Typography>
        )}
        <Badge
          size="small"
          filled={false}
          color={applied > 0 ? 'accent' : 'grey'}
          text={tx('Applied: {{n}}', { n: applied })}
          sx={{ width: 'fit-content' }}
        />
      </Stack>

      {isTerritoryEditor && (
        <Group label={tx('Publisher')}>
          <HolderPicker
            onPick={(option) =>
              // someone without a territory now is looked up in the history
              onChange({
                ...filters,
                holder: option.name,
                holderPast: option.count === 0,
              })
            }
          />
          {filters.holder && (
            <>
              <FilterChip
                label={filters.holder}
                selected
                onClick={() =>
                  onChange({
                    ...filters,
                    holder: undefined,
                    holderPast: undefined,
                  })
                }
              />
              <FilterChip
                label={tx('Earlier territories too')}
                selected={!!filters.holderPast}
                onClick={() =>
                  onChange({ ...filters, holderPast: !filters.holderPast })
                }
              />
            </>
          )}
        </Group>
      )}

      <Group label={tx('Assignment')}>
        {(Object.keys(STATUS_LABEL) as TerritoryStatus[]).map((status) => (
          <FilterChip
            key={status}
            label={tx(STATUS_LABEL[status])}
            selected={filters.status.includes(status)}
            onClick={() => toggle('status', status)}
          />
        ))}
      </Group>

      <Group label={tx('Type')}>
        {(Object.keys(TYPE_LABEL) as TerritoryType[]).map((type) => (
          <FilterChip
            key={type}
            label={tx(TYPE_LABEL[type])}
            selected={filters.type.includes(type)}
            onClick={() => toggle('type', type)}
          />
        ))}
      </Group>

      <Group label={tx('Categories')}>
        {categories.map((category) => (
          <FilterChip
            key={category.id}
            label={tx(category.name)}
            selected={filters.categories.includes(category.id)}
            onClick={() => toggle('categories', category.id)}
          />
        ))}
      </Group>

      <Group label={tx('Card')}>
        <FilterChip
          label={tx('Lost')}
          selected={filters.cardLostOnly}
          onClick={() =>
            onChange({ ...filters, cardLostOnly: !filters.cardLostOnly })
          }
        />
      </Group>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Typography className="body-small-semibold" color="var(--black)">
          {tx('Work status')}
        </Typography>

        {[true, false].map((covered) => (
          <Group
            key={String(covered)}
            label={covered ? tx('Covered') : tx('Not covered')}
          >
            {periods.map((period) => (
              <FilterChip
                key={period.id}
                label={period.label}
                selected={
                  filters.coverage?.covered === covered &&
                  filters.coverage?.period === period.id
                }
                onClick={() => toggleCoverage(covered, period.id)}
              />
            ))}
          </Group>
        ))}
      </Box>

      {showClear && (
        <Button
          variant="secondary"
          disabled={applied === 0}
          onClick={() => onChange(clearedFilters(filters))}
        >
          {tx('Clear all')}
        </Button>
      )}
    </Box>
  );
};

export default TerritoryFilters;
