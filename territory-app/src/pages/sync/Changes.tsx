import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import Button from '@components/button';
import Checkbox from '@components/checkbox';
import Typography from '@components/typography';
import { play } from '../../haptics';
import { invoke, listen } from '../../native';
import { t } from '../../i18n';
import BorderSketch, { Drawing } from './BorderSketch';
import { Actions } from './parts';
import { fieldName, notify, show } from './text';

type Change = {
  id: number;
  table: string;
  record: string;
  /** `*` for a record that came in whole, `_deleted` for a deletion. */
  field: string;
  before: unknown;
  after: unknown;
  conflict: boolean;
  /** The incoming value was in effect right after the sync. */
  won: boolean;
  decision: 'theirs' | 'mine' | null;
  /** Nothing changed the field since the sync. */
  current: boolean;
  /** The device that decided it, when another one did. */
  decidedBy: string | null;
  /** The latest decision another device made about it. */
  remote: { kind: 'applied' | 'declined' | 'undone'; by: string } | null;
  by: string;
  territory: { id: string; number: unknown; name: unknown } | null;
  context: Record<string, unknown>;
};

type Outcome = { id: number; done: boolean; stale: boolean };

const BORDER = [
  'boundary',
  'boundaryStyle',
  'mapLines',
  'mapShapes',
  'mapMarkers',
];
const OWN_FIELDS = ['boundaryStyle', 'mapLines', 'mapShapes', 'mapMarkers'];

const isBorder = (change: Change) =>
  change.table === 'territories' && BORDER.includes(change.field);

const theirsInEffect = (change: Change) =>
  change.decision ? change.decision === 'theirs' : change.won;

const pending = (change: Change) => change.conflict && !change.decision;

const DATE = /^\d{4}-\d{2}-\d{2}/;

const text = (change: Change, value: unknown) => {
  if (change.field === '_deleted') {
    return value === true ? t('changes.deleted') : t('changes.kept');
  }
  if (change.field === '*') {
    if (value === null || value === undefined) return t('changes.notThere');
    const record = value as Record<string, unknown>;
    switch (change.table) {
      case 'assignments':
        return [show(record.publisher), dateOr(record.assignedOn)]
          .filter(Boolean)
          .join(', ');
      case 'do_not_calls':
        return show(record.address);
      default:
        return show(record.name ?? record.number);
    }
  }
  return dateOr(value);
};

const dateOr = (value: unknown) =>
  typeof value === 'string' && DATE.test(value)
    ? new Date(value).toLocaleDateString()
    : show(value);

const title = (change: Change) => {
  const number = change.territory?.number ?? '?';
  switch (change.table) {
    case 'territories':
      return t('decisions.territory', {
        number,
        name: change.territory?.name ?? '',
      }).trim();
    case 'assignments':
      return t('decisions.assignment', {
        number,
        publisher: show(change.context.publisher),
      });
    case 'do_not_calls':
      return t('decisions.doNotCall', {
        address: show(change.context.address),
      });
    case 'people':
      return show(change.context.name);
    default:
      return t('decisions.setting');
  }
};

const label = (change: Change) => {
  if (change.field === '*') return t('changes.added');
  if (change.field === '_deleted') return t('changes.deletion');
  if (OWN_FIELDS.includes(change.field)) return t(`changes.${change.field}`);
  return fieldName(change.field);
};

const status = (change: Change, name: string) => {
  const parts = [
    pending(change)
      ? t('changes.bothChanged')
      : change.decidedBy !== null && change.remote
        ? undefined
        : change.conflict
          ? change.decision === 'mine'
            ? t('changes.keptMine')
            : t('changes.tookTheirs', { name })
          : change.decision === 'mine'
            ? t('changes.undone')
            : t('changes.applied'),
    change.remote &&
      t(`changes.remote.${change.remote.kind}`, {
        name: change.remote.by || t('decisions.otherPhone'),
      }),
    !change.current && t('changes.changedSince'),
  ];
  return parts.filter(Boolean).join(' · ');
};

const drawing = (change: Change, value: unknown): Drawing => ({
  ...change.context,
  [change.field]: value,
});

const Chip = ({ children, old }: { children: ReactNode; old?: boolean }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-block',
      maxWidth: '100%',
      padding: '2px 8px',
      borderRadius: 'var(--radius-s)',
      backgroundColor: old ? 'var(--red-secondary)' : 'var(--green-secondary)',
      color: old ? 'var(--red-dark)' : 'var(--green-main)',
      textDecoration: old ? 'line-through' : undefined,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
    }}
    className="body-small-regular"
  >
    {children}
  </Box>
);

/** Before and after, as text or as two small border drawings. */
const BeforeAfter = ({ change }: { change: Change }) => {
  if (isBorder(change)) {
    const before = drawing(change, change.before);
    const after = drawing(change, change.after);
    return (
      <Box sx={{ display: 'flex', gap: '8px', maxWidth: '260px' }}>
        <BorderSketch
          label={t('changes.before')}
          drawing={before}
          other={after}
        />
        <BorderSketch
          label={t('changes.after')}
          drawing={after}
          other={before}
        />
      </Box>
    );
  }
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <Chip old>{text(change, change.before)}</Chip>
      <Typography className="body-small-regular" color="var(--grey-400)">
        →
      </Typography>
      <Chip>{text(change, change.after)}</Chip>
    </Box>
  );
};

/** One side of a clash, to pick. */
const Side = ({
  change,
  heading,
  value,
  active,
  onPick,
}: {
  change: Change;
  heading: string;
  value: unknown;
  active: boolean;
  onPick: VoidFunction;
}) => (
  <Box
    role="button"
    tabIndex={0}
    onClick={onPick}
    onKeyDown={(event) => event.key === 'Enter' && onPick()}
    sx={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '10px',
      borderRadius: 'var(--radius-l)',
      border: '1px solid',
      borderColor: active ? 'var(--accent-main)' : 'var(--accent-200)',
      backgroundColor: active ? 'var(--accent-150)' : 'var(--white)',
      cursor: 'pointer',
      '&:hover': { borderColor: 'var(--accent-main)' },
    }}
  >
    <Typography className="label-small-regular" color="var(--grey-400)">
      {active ? t('changes.inUse', { side: heading }) : heading}
    </Typography>
    {isBorder(change) ? (
      <BorderSketch
        label={heading}
        drawing={drawing(change, value)}
        other={drawing(
          change,
          value === change.after ? change.before : change.after
        )}
      />
    ) : (
      <Typography
        className="body-small-semibold"
        sx={{ overflowWrap: 'anywhere' }}
      >
        {text(change, value)}
      </Typography>
    )}
  </Box>
);

/**
 * Every field one sync brought, each on its own: what it was here, what
 * came in, and from which device. Each can be taken back or applied again,
 * and a field changed on both devices is picked side by side.
 */
const Changes = ({ syncId, name }: { syncId: number; name: string }) => {
  const [changes, setChanges] = useState<Change[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const refresh = useCallback(() => {
    invoke<Change[]>('sync_changes', { syncId })
      .then(setChanges)
      .catch(() => {});
  }, [syncId]);

  useEffect(() => {
    refresh();
    const stop = listen('store-changed', refresh);
    return () => {
      stop.then((unlisten) => unlisten());
    };
  }, [refresh]);

  const decide = async (ids: number[], theirs: boolean, force = false) => {
    if (!ids.length) return;
    play(theirs ? 'synced' : 'remove');
    try {
      const outcome = await invoke<Outcome[]>(
        theirs ? 'apply_changes' : 'undo_changes',
        { ids, force }
      );
      const stale = outcome.filter((item) => item.stale).length;
      if (stale) {
        notify(
          t('changes.staleTitle'),
          t('changes.stale', { count: stale }),
          'error'
        );
      }
      setSelected((current) => current.filter((id) => !ids.includes(id)));
    } catch (error) {
      notify(t('common.somethingWrong'), String(error), 'error');
    }
    refresh();
  };

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );

  if (!changes.length) return null;

  const clashes = changes.filter(pending);
  const rest = changes.filter((change) => !pending(change));
  const theirName = (change: Change) => change.by || name;

  const row = (change: Change, body: ReactNode) => (
    <Box
      key={change.id}
      sx={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 'var(--radius-l)',
        border: '1px solid',
        borderColor: pending(change)
          ? 'var(--orange-main)'
          : 'var(--accent-200)',
        backgroundColor: pending(change)
          ? 'var(--orange-secondary)'
          : 'var(--white)',
      }}
    >
      <Checkbox
        ariaLabel={t('changes.select', {
          field: label(change),
          what: title(change),
        })}
        checked={selected.includes(change.id)}
        onChange={() => toggle(change.id)}
        sx={{ marginTop: '-4px' }}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <Box>
          <Typography className="body-small-semibold">
            {title(change)} · {label(change)}
          </Typography>
          <Typography className="label-small-regular" color="var(--grey-400)">
            {theirName(change)} · {status(change, theirName(change))}
          </Typography>
        </Box>
        {body}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {clashes.length > 0 && (
        <Typography className="body-small-semibold" color="var(--orange-dark)">
          {t('changes.pickOne', { count: clashes.length })}
        </Typography>
      )}
      {clashes.map((change) =>
        row(
          change,
          <Box sx={{ display: 'flex', gap: '8px' }}>
            <Side
              change={change}
              heading={t('decisions.yours')}
              value={change.before}
              active={!theirsInEffect(change)}
              onPick={() => decide([change.id], false, !change.current)}
            />
            <Side
              change={change}
              heading={t('decisions.theirs', { name: theirName(change) })}
              value={change.after}
              active={theirsInEffect(change)}
              onPick={() => decide([change.id], true, !change.current)}
            />
          </Box>
        )
      )}
      {rest.map((change) => {
        const undo = theirsInEffect(change);
        return row(
          change,
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <BeforeAfter change={change} />
            <Button
              variant="small"
              disableAutoStretch
              onClick={() => decide([change.id], !undo, !change.current)}
            >
              {undo
                ? change.current
                  ? t('changes.undo')
                  : t('changes.undoAnyway')
                : t('changes.applyAgain')}
            </Button>
          </Box>
        );
      })}
      {selected.length > 0 && (
        <Actions
          actions={[
            {
              label: t('changes.keepMineSelected', { count: selected.length }),
              onClick: () => decide(selected, false),
            },
            {
              label: t('changes.applySelected', { count: selected.length }),
              kind: 'main',
              onClick: () => decide(selected, true),
            },
          ]}
        />
      )}
    </Box>
  );
};

export default Changes;
