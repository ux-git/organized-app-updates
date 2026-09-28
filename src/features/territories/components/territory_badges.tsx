import { Box, Stack } from '@mui/material';
import Tooltip from '@components/tooltip';
import { Badge } from '@components/index';
import { IconCancelCicle, IconRaiseHand } from '@icons/index';
import { daysLabel, doNotCallLabel, olderOpenAssignments } from '../helpers';
import { categoryBadge } from '../category_colors';
import { useAtomValue } from 'jotai';
import { territoryCategoriesState } from '@states/territories';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  Territory,
  TerritoryStatus,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';

// in a tight row a badge shortens its text instead of dropping out of view;
// long names give up their space first, so short ones stay readable
const shrink = (text: string) => ({
  flexShrink: text.length > 8 ? text.length : 0.1,
  minWidth: '28px',
  overflow: 'hidden',
  '& > div': { minWidth: 0 },
  // doubled to outrank the badge text's own flex display, which hides the ellipsis
  '&& p': {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export const StatusBadge = ({ status }: { status: TerritoryStatus }) => (
  <Badge
    size="small"
    color={STATUS_COLOR[status]}
    text={tx(STATUS_LABEL[status])}
    filled={false}
    sx={{ width: 'fit-content', flexShrink: 0 }}
  />
);

const coveredColor = (days: number) => {
  if (days > 365) return 'red';
  if (days > 182) return 'orange';
  return 'grey';
};

export const CoveredBadge = ({
  days,
  label = daysLabel(days),
}: {
  days: number;
  label?: string;
}) => {
  return (
    <Badge
      size="small"
      filled={false}
      color={coveredColor(days)}
      text={label}
      sx={{ width: 'fit-content', flexShrink: 0 }}
    />
  );
};

export const RequestBadge = ({ territory }: { territory: Territory }) => {
  if (!territory.requestedBy) return null;

  return (
    <Badge
      size="small"
      color="orange"
      filled={false}
      text={tx('Requested')}
      icon={<IconRaiseHand color="var(--orange-dark)" />}
      sx={{ width: 'fit-content', ...shrink(tx('Requested')) }}
    />
  );
};

export const DoNotCallBadge = ({
  territory,
  onClick,
}: {
  territory: Territory;
  onClick?: VoidFunction;
}) => {
  const count = territory.doNotCalls.length;

  if (count === 0) return null;

  const label = doNotCallLabel(count, territory.type === 'phone');

  return (
    <Tooltip title={label}>
      {/* the tooltip needs a DOM child to anchor to */}
      <Box
        aria-label={label}
        {...(onClick
          ? { component: 'button', type: 'button', onClick }
          : { role: 'img' })}
        sx={{
          width: 'fit-content',
          flexShrink: 0,
          ...(onClick && {
            display: 'block',
            padding: 0,
            border: 'none',
            background: 'none',
            borderRadius: 'var(--radius-s)',
            cursor: 'pointer',
            '&:focus-visible': { outline: 'var(--red-main) auto 1px' },
          }),
        }}
      >
        <Badge
          size="small"
          color="red"
          filled={false}
          text={String(count)}
          icon={<IconCancelCicle color="var(--red-dark)" />}
          sx={{ width: 'fit-content' }}
        />
      </Box>
    </Tooltip>
  );
};

// two devices handed it out while apart; the territory's page closes the older one
export const AssignedTwiceBadge = ({ territory }: { territory: Territory }) => {
  if (olderOpenAssignments(territory.assignments).length === 0) return null;

  return (
    <Tooltip
      title={tx(
        'Two open assignments after a sync. Open the territory to end the older one.'
      )}
    >
      {/* the tooltip needs a DOM child to anchor to */}
      <Box sx={{ width: 'fit-content', minWidth: 0 }}>
        <Badge
          size="small"
          color="orange"
          filled={false}
          text={tx('Assigned twice')}
          sx={{ width: 'fit-content', ...shrink(tx('Assigned twice')) }}
        />
      </Box>
    </Tooltip>
  );
};

export const CardLostBadge = ({ territory }: { territory: Territory }) => {
  if (!territory.cardLost) return null;

  return (
    <Badge
      size="small"
      color="red"
      filled={false}
      text={tx('Reprint')}
      sx={{ width: 'fit-content', ...shrink(tx('Reprint')) }}
    />
  );
};

export const CategoryBadges = ({
  territory,
  max = Infinity,
  wrap = false,
}: {
  territory: Territory;
  max?: number;
  // onto more lines instead of shortening the names
  wrap?: boolean;
}) => {
  const categories = useAtomValue(territoryCategoriesState);

  const known = categories.filter((category) =>
    territory.categories.includes(category.id)
  );

  if (known.length === 0) return null;

  const shown = known.slice(0, max);
  const rest = known.length - shown.length;

  return (
    <Stack
      direction="row"
      sx={{
        flexShrink: 1,
        minWidth: 0,
        gap: '4px',
        ...(wrap ? { flexWrap: 'wrap' } : { overflow: 'hidden' }),
      }}
    >
      {shown.map((category) => {
        const badge = categoryBadge(category.color);

        return (
          <Badge
            key={category.id}
            size="small"
            color={badge.color}
            text={tx(category.name)}
            filled={false}
            sx={{
              width: 'fit-content',
              ...shrink(tx(category.name)),
              ...badge.sx,
            }}
          />
        );
      })}
      {rest > 0 && (
        <Tooltip
          title={known
            .slice(max)
            .map((category) => tx(category.name))
            .join(', ')}
        >
          {/* the tooltip needs a DOM child to anchor to */}
          <Box sx={{ width: 'fit-content' }}>
            <Badge size="small" color="grey" text={`+${rest}`} filled={false} />
          </Box>
        </Tooltip>
      )}
    </Stack>
  );
};
