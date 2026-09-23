import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Stack } from '@mui/material';
import { useAtom } from 'jotai';
import Button from '@components/button';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { territoriesState } from '@states/territories';
import { Territory } from '@definition/territory';
import { play } from '../../haptics';
import { invoke, listen } from '../../native';

type Conflict = {
  table: string;
  id: string;
  field: string;
  kept: unknown;
  lost: unknown;
  /** The losing value was written on this phone. */
  mine: boolean;
  by: string;
  at: number;
  record: Record<string, unknown>;
};

const FIELDS: Record<string, string> = {
  holder: 'Assigned to',
  publisher: 'Publisher',
  assignedOn: 'Assigned on',
  returnedOn: 'Returned on',
  status: 'Status',
  name: 'Name',
  number: 'Number',
  city: 'City',
  notes: 'Notes',
  address: 'Address',
  households: 'Households',
  cardLost: 'Card lost',
  group: 'Field service group',
  boundary: 'Map',
};

const fieldName = (field: string) =>
  FIELDS[field] ??
  field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return 'Changed';
  return String(value);
};

/** Open assignments: without a return date. */
const open = (territory: Territory) =>
  territory.assignments.filter((assignment) => !assignment.returnedOn);

const Card = ({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '16px',
      borderRadius: 'var(--radius-l)',
      border: '1px solid var(--orange-main)',
      backgroundColor: 'var(--orange-secondary)',
    }}
  >
    <Box>
      <Typography className="h4">{title}</Typography>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {text}
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{children}</Box>
  </Box>
);

const small = { minHeight: '36px', height: '36px', paddingInline: '16px' };

/**
 * What a sync couldn't settle by itself: a territory given out on two phones
 * at once, and details changed on both phones before they synced. The newer
 * change is already in place everywhere; this only offers the other one.
 */
const Decisions = () => {
  const [territories, setTerritories] = useAtom(territoriesState);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const refresh = useCallback(() => {
    invoke<Conflict[]>('conflicts')
      .then(setConflicts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const stops = [listen('store-changed', refresh), listen('synced', refresh)];
    return () => stops.forEach((stop) => stop.then((unlisten) => unlisten()));
  }, [refresh]);

  const doubles = useMemo(
    () => territories.filter((territory) => open(territory).length > 1),
    [territories]
  );

  const numberOf = (id: unknown) =>
    territories.find((territory) => territory.id === id)?.number ?? '?';

  const label = (conflict: Conflict) => {
    const record = conflict.record;
    switch (conflict.table) {
      case 'territories':
        return `Territory ${record.number ?? ''} ${record.name ?? ''}`.trim();
      case 'assignments':
        return `Territory ${numberOf(record.territory)}, assignment of ${show(record.publisher)}`;
      case 'do_not_calls':
        return `Do not call: ${show(record.address)}`;
      case 'people':
        return show(record.name);
      default:
        return 'A setting';
    }
  };

  const resolve = async (conflict: Conflict, useOther: boolean) => {
    play(useOther ? 'synced' : 'remove');
    await invoke('resolve_conflict', {
      table: conflict.table,
      id: conflict.id,
      field: conflict.field,
      useOther,
    });
    refresh();
  };

  const keepAssignment = (territory: Territory, keptId: string) => {
    const kept = territory.assignments.find((item) => item.id === keptId);
    if (!kept) return;
    play('synced');
    setTerritories(
      territories.map((item) =>
        item.id === territory.id
          ? {
              ...item,
              holder: kept.publisher,
              assignments: item.assignments.filter(
                (assignment) =>
                  assignment.returnedOn || assignment.id === keptId
              ),
            }
          : item
      )
    );
    // the holder clash, if any, is settled with it
    invoke('resolve_conflict', {
      table: 'territories',
      id: territory.id,
      field: 'holder',
      useOther: false,
    })
      .then(refresh)
      .catch(() => {});
  };

  const shown = conflicts.filter(
    (conflict) =>
      !(
        conflict.table === 'territories' &&
        doubles.some((territory) => territory.id === conflict.id)
      )
  );

  if (!doubles.length && !shown.length) return null;

  return (
    <CardSection>
      <CardSectionHeader
        title="Needs your decision"
        description="Your phones synced, but these were changed on two phones before that. The newer change is in place for now."
      />
      <Stack spacing="12px">
        {doubles.map((territory) => {
          const assignments = open(territory);
          return (
            <Card
              key={territory.id}
              title={`Territory ${territory.number} was assigned twice`}
              text={`To ${assignments.map((a) => a.publisher).join(' and ')}, probably on two phones at the same time. Who keeps it?`}
            >
              {assignments.map((assignment) => (
                <Button
                  key={assignment.id}
                  variant="secondary"
                  disableAutoStretch
                  sx={small}
                  onClick={() => keepAssignment(territory, assignment.id)}
                >
                  {assignment.publisher}
                </Button>
              ))}
            </Card>
          );
        })}
        {shown.map((conflict) => {
          const other = conflict.mine
            ? 'this phone'
            : `${conflict.by || 'the other phone'}’s phone`;
          return (
            <Card
              key={`${conflict.table}/${conflict.id}/${conflict.field}`}
              title={`${label(conflict)}: ${fieldName(conflict.field)}`}
              text={`Now “${show(conflict.kept)}”. On ${other} it was “${show(conflict.lost)}”.`}
            >
              <Button
                variant="secondary"
                disableAutoStretch
                sx={small}
                onClick={() => resolve(conflict, false)}
              >
                Keep “{show(conflict.kept)}”
              </Button>
              <Button
                variant="tertiary"
                disableAutoStretch
                sx={small}
                onClick={() => resolve(conflict, true)}
              >
                Use “{show(conflict.lost)}”
              </Button>
            </Card>
          );
        })}
      </Stack>
    </CardSection>
  );
};

export default Decisions;
