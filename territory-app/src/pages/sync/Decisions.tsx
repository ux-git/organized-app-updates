import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useAtom } from 'jotai';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { territoriesState } from '@states/territories';
import { Territory } from '@definition/territory';
import { play } from '../../haptics';
import { invoke, listen } from '../../native';
import { list, t } from '../../i18n';
import BorderSketch, { Drawing } from './BorderSketch';
import { Peer } from '../useNearby';
import { Actions, Avatar } from './parts';
import { notify } from './text';

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

const FIELDS = [
  'holder',
  'publisher',
  'assignedOn',
  'returnedOn',
  'status',
  'name',
  'number',
  'city',
  'notes',
  'address',
  'households',
  'cardLost',
  'group',
  'boundary',
];

// a border is drawn as one thing, so its parts are decided together
const BORDER = [
  'boundary',
  'boundaryStyle',
  'mapLines',
  'mapShapes',
  'mapMarkers',
];

const isBorder = (conflict: Conflict) =>
  conflict.table === 'territories' && BORDER.includes(conflict.field);

/** Deleted on one device and changed on another: the change brought it back. */
const isDeletion = (conflict: Conflict) => conflict.field === '_deleted';

/** The border as this phone had it, or as the other phone had it. */
const drawingOf = (group: Conflict[], mine: boolean): Drawing => {
  const drawing = { ...group[0].record };
  for (const conflict of group) {
    drawing[conflict.field] =
      conflict.mine === mine ? conflict.lost : conflict.kept;
  }
  return drawing;
};

const fieldName = (field: string) =>
  FIELDS.includes(field)
    ? t(`decisions.${field}`)
    : field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return t('decisions.empty');
  }
  if (typeof value === 'boolean') {
    return value ? t('decisions.yes') : t('decisions.no');
  }
  if (typeof value === 'object') return t('decisions.changed');
  return String(value);
};

/** Open assignments: without a return date. */
const open = (territory: Territory) =>
  territory.assignments.filter((assignment) => !assignment.returnedOn);

const Card = ({
  title,
  text,
  by,
  children,
}: {
  title: string;
  text: string;
  /** The other device whose change is on offer. */
  by?: { name: string; id?: string };
  children: ReactNode;
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}
  >
    <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      {by && <Avatar name={by.name} id={by.id} />}
      <Box sx={{ minWidth: 0 }}>
        <Typography className="h3">{title}</Typography>
        <Typography className="body-small-regular" color="var(--grey-400)">
          {text}
        </Typography>
      </Box>
    </Box>
    {children}
  </Box>
);

/**
 * What a sync couldn't settle by itself: a territory given out on two phones
 * at once, and details changed on both phones before they synced. The newer
 * change is already in place everywhere; this only offers the other one.
 */
const Decisions = () => {
  const [territories, setTerritories] = useAtom(territoriesState);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);

  const refresh = useCallback(() => {
    invoke<Conflict[]>('conflicts')
      .then(setConflicts)
      .catch(() => {});
    invoke<Peer[]>('peers')
      .then(setPeers)
      .catch(() => {});
  }, []);

  // a conflict names the device, not its id
  const device = (name?: string) =>
    name
      ? { name, id: peers.find((peer) => peer.name === name)?.id }
      : undefined;

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
        return t('decisions.territory', {
          number: record.number ?? '',
          name: record.name ?? '',
        }).trim();
      case 'assignments':
        return t('decisions.assignment', {
          number: numberOf(record.territory),
          publisher: show(record.publisher),
        });
      case 'do_not_calls':
        return t('decisions.doNotCall', { address: show(record.address) });
      case 'people':
        return show(record.name);
      default:
        return t('decisions.setting');
    }
  };

  const resolve = (conflict: Conflict, useOther: boolean) => {
    play(useOther ? 'synced' : 'remove');
    invoke('resolve_conflict', {
      table: conflict.table,
      id: conflict.id,
      field: conflict.field,
      useOther,
    })
      .then(refresh)
      .catch((error) =>
        notify(t('common.somethingWrong'), String(error), 'error')
      );
  };

  const resolveBorder = async (
    group: Conflict[],
    mine: boolean,
    name: string
  ) => {
    play(mine ? 'remove' : 'synced');
    const number = group[0].record.number ?? '';
    try {
      // the lost value is the one to bring back
      for (const conflict of group) {
        await invoke('resolve_conflict', {
          table: conflict.table,
          id: conflict.id,
          field: conflict.field,
          useOther: conflict.mine === mine,
        });
      }
      notify(
        t('decisions.borderKept'),
        mine
          ? t('decisions.borderKeptMine', { number })
          : name
            ? t('decisions.borderKeptOther', { number, name })
            : t('decisions.borderKeptOtherOne', { number })
      );
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    }
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
      ) && !isBorder(conflict)
  );
  const deletions = shown.filter(isDeletion);
  const fields = shown.filter((conflict) => !isDeletion(conflict));

  const borders = [
    ...conflicts
      .filter(isBorder)
      .reduce((groups, conflict) => {
        groups.set(conflict.id, [...(groups.get(conflict.id) ?? []), conflict]);
        return groups;
      }, new Map<string, Conflict[]>())
      .values(),
  ];

  if (!doubles.length && !shown.length && !borders.length) return null;

  return (
    <CardSection>
      <CardSectionHeader
        title={t('decisions.title')}
        description={t('decisions.text')}
      />
      <CardSectionContent>
        {doubles.map((territory) => {
          const assignments = open(territory);
          return (
            <Card
              key={territory.id}
              title={t('decisions.twice', { number: territory.number })}
              text={t('decisions.twiceText', {
                names: list(assignments.map((a) => a.publisher)),
              })}
            >
              <Actions
                actions={assignments.map((assignment) => ({
                  label: assignment.publisher,
                  onClick: () => keepAssignment(territory, assignment.id),
                }))}
              />
            </Card>
          );
        })}
        {borders.map((group) => {
          const by = group.find(
            (conflict) => !conflict.mine && conflict.by
          )?.by;
          const number = group[0].record.number ?? '';
          return (
            <Card
              key={`border/${group[0].id}`}
              title={t('decisions.border', { number })}
              text={t('decisions.borderText')}
              by={device(by)}
            >
              <Box sx={{ display: 'flex', gap: '12px' }}>
                <BorderSketch
                  label={t('decisions.yours')}
                  drawing={drawingOf(group, true)}
                  other={drawingOf(group, false)}
                />
                <BorderSketch
                  label={
                    by
                      ? t('decisions.theirs', { name: by })
                      : t('decisions.otherOne')
                  }
                  drawing={drawingOf(group, false)}
                  other={drawingOf(group, true)}
                />
              </Box>
              <Actions
                actions={[
                  {
                    label: t('decisions.keepMine'),
                    onClick: () => resolveBorder(group, true, by ?? ''),
                  },
                  {
                    label: by
                      ? t('decisions.useTheirs', { name: by })
                      : t('decisions.useOtherOne'),
                    kind: 'main',
                    onClick: () => resolveBorder(group, false, by ?? ''),
                  },
                ]}
              />
            </Card>
          );
        })}
        {deletions.map((conflict) => (
          <Card
            key={`${conflict.table}/${conflict.id}/${conflict.field}`}
            title={t('decisions.deleted', { what: label(conflict) })}
            by={conflict.mine ? undefined : device(conflict.by)}
            text={
              conflict.mine
                ? t('decisions.deletedHere')
                : t('decisions.deletedThere', {
                    other: conflict.by
                      ? t('decisions.theirPhone', { name: conflict.by })
                      : t('decisions.otherPhone'),
                  })
            }
          >
            <Actions
              actions={[
                {
                  label: t('decisions.keepIt'),
                  kind: 'main',
                  onClick: () => resolve(conflict, false),
                },
                {
                  label: t('decisions.deleteIt'),
                  onClick: () => resolve(conflict, true),
                },
              ]}
            />
          </Card>
        ))}
        {fields.map((conflict) => {
          const other = conflict.mine
            ? t('decisions.thisPhone')
            : conflict.by
              ? t('decisions.theirPhone', { name: conflict.by })
              : t('decisions.otherPhone');
          return (
            <Card
              key={`${conflict.table}/${conflict.id}/${conflict.field}`}
              title={`${label(conflict)}: ${fieldName(conflict.field)}`}
              by={conflict.mine ? undefined : device(conflict.by)}
              text={t('decisions.now', {
                kept: show(conflict.kept),
                other,
                lost: show(conflict.lost),
              })}
            >
              <Actions
                actions={[
                  {
                    label: t('decisions.keep', { value: show(conflict.kept) }),
                    kind: 'main',
                    onClick: () => resolve(conflict, false),
                  },
                  {
                    label: t('decisions.use', { value: show(conflict.lost) }),
                    onClick: () => resolve(conflict, true),
                  },
                ]}
              />
            </Card>
          );
        })}
      </CardSectionContent>
    </CardSection>
  );
};

export default Decisions;
