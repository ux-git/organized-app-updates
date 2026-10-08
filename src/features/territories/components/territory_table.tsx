import { ReactNode, useMemo, useState } from 'react';
import usePhoneSelection from './usePhoneSelection';
import { Box, Menu, Stack } from '@mui/material';
import MenuItem from '@components/menuitem';
import { dropdownPaper } from '@components/select/index.styles';
import IconButton from '@components/icon_button';
import {
  Button,
  Checkbox,
  CustomDivider,
  InfoNote,
  Typography,
} from '@components/index';
import {
  IconClock,
  IconHome,
  IconPerson,
  IconReturn,
  IconSortDown,
  IconSortUp,
} from '@icons/index';
import { useAtomValue } from 'jotai';
import Tooltip from '@components/tooltip';
import { useBreakpoints } from '@hooks/index';
import { shortDateFormatState } from '@states/settings';
import { displayDate, parseDate, emptyListMessage } from '../helpers';
import { currentPublisherState } from '../assignees';
import { isCoverage } from '../coverage_rate';
import { territoryCampaignsState } from '../campaigns';
import { campaignEnded } from '../campaign_filter';
import {
  STATUS_LABEL,
  Territory,
  TerritoryStatus,
} from '@definition/territory';
import AssignButton from './assign_button';
import { clickableRow, rowStates } from './table_styles';
import TruncatedText from './truncated_text';
import {
  AssignedTwiceBadge,
  CardLostBadge,
  CategoryBadges,
  ListDoNotCallBadge as DoNotCallBadge,
  NewNoteBadge,
  RequestBadge,
} from './territory_badges';
import { territoryHolderText } from '../group_holder';
import { tx } from '@services/i18n/translation';

type TerritoryTableProps = {
  territories: Territory[];
  checked: Set<string>;
  onCheck: (id: string) => void;
  onCheckMany: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onOpenAssign: (id: string) => void;
  onDecline: (id: string) => void;
  onReturn: (id: string) => void;
  showHouseholds?: boolean;
  // off on lists made only of requests, where the badge would repeat itself
  showRequested?: boolean;
  // off for publishers: no selection, no assigning; a row only opens
  actions?: boolean;
  // publishers see whether a territory is free, not who is working it
  showHolder?: boolean;
  // like the details page: elders see every count, a publisher only on their own
  showDoNotCalls?: boolean;
  emptyMessage?: string;
  title?: string;
  selectionBar?: ReactNode;
  layoutSwitch?: ReactNode;
  selecting?: boolean;
  onSelectingChange?: (value: boolean) => void;
};

type SortKey =
  | 'number'
  | 'locality'
  | 'person'
  | 'households'
  | 'status'
  | 'date';

const SORTS: Record<SortKey, { label: string; directions: [string, string] }> =
  {
    number: { label: 'Number', directions: ['1 → 9', '9 → 1'] },
    locality: { label: 'Locality', directions: ['A → Z', 'Z → A'] },
    person: { label: 'Person', directions: ['A → Z', 'Z → A'] },
    households: {
      label: 'Households',
      directions: ['Most first', 'Fewest first'],
    },
    status: {
      label: 'Status',
      directions: ['Overdue first', 'Available first'],
    },
    date: {
      label: 'Time out',
      directions: ['Longest first', 'Shortest first'],
    },
  };

const STATUS_WEIGHT: Record<TerritoryStatus, number> = {
  overdue: 0,
  in_work: 1,
  available: 2,
};

const time = (value?: string) => parseDate(value)?.getTime() ?? 0;

const openAssignment = (territory: Territory) =>
  territory.assignments
    .filter((assignment) => !assignment.returnedOn)
    .sort((a, b) => time(b.assignedOn) - time(a.assignedOn))
    .at(0);

const lastReturn = (territory: Territory) =>
  territory.assignments
    .filter(isCoverage)
    .map((assignment) => assignment.returnedOn)
    .filter((value): value is string => !!value)
    .sort((a, b) => time(b) - time(a))
    .at(0);

const compare =
  (key: SortKey, reversed: boolean) => (a: Territory, b: Territory) => {
    const byNumber = a.number.localeCompare(b.number, undefined, {
      numeric: true,
    });

    if (key === 'locality') {
      return a.city.localeCompare(b.city) || byNumber;
    }

    // grouped by who holds them; the free ones always come last, whichever way
    if (key === 'person') {
      const [holderA, holderB] = [a, b].map(territoryHolderText);
      if (!holderA || !holderB) {
        return Number(!holderA) - Number(!holderB) || byNumber;
      }

      const byHolder = holderA.localeCompare(holderB);

      return (reversed ? -byHolder : byHolder) || byNumber;
    }

    if (key === 'households') {
      return b.households - a.households || byNumber;
    }

    if (key === 'status') {
      return STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] || byNumber;
    }

    if (key === 'date') {
      return (b.daysOut ?? -1) - (a.daysOut ?? -1) || byNumber;
    }

    return byNumber;
  };

const StatusLine = ({
  territory,
  showHolder = true,
}: {
  territory: Territory;
  showHolder?: boolean;
}) => {
  const shortDateFormat = useAtomValue(shortDateFormatState);
  const campaigns = useAtomValue(territoryCampaignsState);

  const date = (value?: string) => displayDate(value, shortDateFormat);

  if (territory.status === 'available') {
    const returned = lastReturn(territory);

    return (
      <Stack direction="row" spacing="4px" sx={{ alignItems: 'center' }}>
        <IconReturn color="var(--green-main)" width={16} height={16} />
        <Typography
          className="label-small-regular"
          color="var(--green-main)"
          noWrap
        >
          {returned ? date(returned) : tx('Never covered')}
        </Typography>
      </Stack>
    );
  }

  const overdue = territory.status === 'overdue';
  const open = openAssignment(territory);
  const assigned = open?.assignedOn;

  // the holder's own row asks for the territory back once its campaign is over
  const status =
    open && campaignEnded(open, campaigns)
      ? tx('Campaign over – please return')
      : tx(STATUS_LABEL[territory.status]);

  return (
    <Stack
      direction="row"
      spacing="4px"
      sx={{ alignItems: 'center', minWidth: 0 }}
    >
      {overdue ? (
        <IconClock color="var(--red-main)" width={16} height={16} />
      ) : (
        <IconPerson color="var(--grey-400)" width={16} height={16} />
      )}
      <TruncatedText
        className="label-small-regular"
        color={overdue ? 'var(--red-main)' : 'var(--grey-400)'}
        text={[
          showHolder ? territoryHolderText(territory) : status,
          assigned && date(assigned),
        ]
          .filter(Boolean)
          .join(' · ')}
      />
    </Stack>
  );
};

// they wrap onto another line rather than cut their names short
const badges = (
  territory: Territory,
  showRequested: boolean,
  showDoNotCalls: boolean,
  me: string,
  withDoNotCalls = true
) => (
  <>
    {withDoNotCalls && (showDoNotCalls || territory.holder === me) && (
      <DoNotCallBadge territory={territory} />
    )}
    {showRequested && <RequestBadge territory={territory} />}
    {showDoNotCalls && <NewNoteBadge territory={territory} />}
    <AssignedTwiceBadge territory={territory} />
    <CardLostBadge territory={territory} />
    <CategoryBadges territory={territory} wrap />
  </>
);

const BADGE_ROW = {
  alignItems: 'center',
  gap: '4px',
  flexWrap: 'wrap',
  minWidth: 0,
} as const;

export const Households = ({
  count,
  // --grey-350 passes on white; tinted cards pass their own colour
  color = 'var(--grey-350)',
}: {
  count: number;
  color?: string;
}) => (
  <Stack
    direction="row"
    spacing="2px"
    // the house glyph is inset 3px in its box; a transform pulls it level
    // with the number, because the column's spacing resets margins
    sx={{ alignItems: 'center', transform: 'translateX(-3px)' }}
  >
    <IconHome color={color} width={16} height={16} />
    <Typography
      className="label-small-medium"
      color={color}
      // the house is heavier at the bottom, so the digits sit 1px lower to look centred
      sx={{
        fontVariantNumeric: 'tabular-nums',
        position: 'relative',
        top: '1px',
      }}
    >
      {count}
    </Typography>
  </Stack>
);

const TerritoryTable = ({
  territories,
  checked,
  onCheck,
  onCheckMany,
  onOpen,
  onOpenAssign,
  onDecline,
  onReturn,
  showHouseholds = true,
  showRequested = true,
  actions = true,
  showHolder = true,
  showDoNotCalls = false,
  emptyMessage = emptyListMessage(),
  title,
  selectionBar,
  layoutSwitch,
  selecting = false,
  onSelectingChange,
}: TerritoryTableProps) => {
  const { tablet688Up, tablet600Up, laptopUp } = useBreakpoints();
  const phone = !tablet600Up;
  const selectionMode = selecting || checked.size > 0;
  const showCheckboxes = !phone || selectionMode;
  const longPress = usePhoneSelection(phone && actions, (id) => {
    if (!checked.has(id)) onCheck(id);
  });
  const selectionSlot = {
    display: 'grid',
    gridTemplateColumns: showCheckboxes ? '1fr' : '0fr',
    opacity: showCheckboxes ? 1 : 0,
    marginRight: showCheckboxes ? (tablet688Up ? '12px' : '8px') : 0,
    transition:
      'grid-template-columns 150ms ease, opacity 150ms ease, margin-right 150ms ease',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  };

  const me = useAtomValue(currentPublisherState);

  const [sortBy, setSortBy] = useState<SortKey>('number');
  const [reversed, setReversed] = useState(false);

  const sorted = useMemo(() => {
    const list = [...territories].sort(compare(sortBy, reversed));

    // the person sort flips only the names, so free territories stay last
    return reversed && sortBy !== 'person' ? list.reverse() : list;
  }, [territories, sortBy, reversed]);

  const [sortMenu, setSortMenu] = useState<HTMLElement | null>(null);

  const arrow = reversed ? (
    <IconSortUp color="var(--black)" width={20} height={20} />
  ) : (
    <IconSortDown color="var(--black)" width={20} height={20} />
  );

  const pickSort = (key: SortKey) => {
    if (key === sortBy) {
      setReversed(!reversed);
    } else {
      setSortBy(key);
      setReversed(false);
    }

    setSortMenu(null);
  };

  const sortButton = (
    <>
      <Tooltip
        title={`${tx(SORTS[sortBy].label)} · ${tx(SORTS[sortBy].directions[reversed ? 1 : 0])}`}
      >
        <IconButton
          aria-label={tx('Sort')}
          onClick={(event) => setSortMenu(event.currentTarget)}
          sx={{ padding: '6px', margin: 0, borderRadius: 'var(--radius-m)' }}
        >
          {arrow}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={sortMenu}
        open={!!sortMenu}
        onClose={() => setSortMenu(null)}
        disableScrollLock
        slotProps={{
          paper: { sx: dropdownPaper, className: 'small-card-shadow' },
        }}
      >
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <MenuItem
            key={key}
            selected={key === sortBy}
            onClick={() => pickSort(key)}
            sx={{
              '&.Mui-selected svg path': { fill: 'var(--accent-main)' },
              '&:hover svg path': { fill: 'var(--accent-dark)' },
            }}
          >
            <Stack
              direction="row"
              sx={{ alignItems: 'center', gap: '12px', width: '100%' }}
            >
              <Typography className="body-regular" sx={{ flexGrow: 1 }}>
                {tx(SORTS[key].label)}
              </Typography>
              {key === sortBy && arrow}
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );

  const allChecked =
    sorted.length > 0 && sorted.every((territory) => checked.has(territory.id));

  const someChecked = sorted.some((territory) => checked.has(territory.id));

  const heading = title && (
    <Typography
      component={actions ? 'div' : 'h2'}
      className={actions ? 'h3' : 'h2'}
      noWrap={actions}
    >
      {phone && checked.size > 0
        ? tx('Selected: {{n}}', { n: checked.size })
        : title}
    </Typography>
  );

  if (territories.length === 0) {
    return (
      <Stack spacing="12px" sx={{ paddingTop: actions ? '16px' : 0 }}>
        {heading}
        {actions && selectionBar}
        <InfoNote message={emptyMessage} />
      </Stack>
    );
  }

  return (
    <Stack spacing={actions ? '4px' : '12px'}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: actions ? '12px 8px 8px' : 0,
        }}
      >
        {actions && showCheckboxes && (
          <Checkbox
            sx={{ padding: 0, margin: 0 }}
            checked={allChecked}
            indeterminate={someChecked && !allChecked}
            onChange={() => onCheckMany(sorted.map((t) => t.id))}
          />
        )}

        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: '4px',
            flexGrow: 1,
            minWidth: 0,
            minHeight: actions ? '40px' : undefined,
          }}
        >
          {heading}
          {sortButton}
        </Stack>

        {actions && phone && !selectionMode && (
          <Button
            variant="small"
            disableAutoStretch
            onClick={() => onSelectingChange?.(true)}
            ariaLabel={tx('Select territories')}
          >
            {tx('Select')}
          </Button>
        )}
        {actions && phone && selectionMode && checked.size === 0 && (
          <Button
            variant="small"
            disableAutoStretch
            onClick={() => onSelectingChange?.(false)}
          >
            {tx('Cancel')}
          </Button>
        )}
        {actions && selectionBar}

        {layoutSwitch}
      </Stack>

      <Stack
        spacing="2px"
        divider={<CustomDivider color="var(--accent-200)" />}
      >
        {sorted.map((territory) => (
          <Stack
            key={territory.id}
            direction="row"
            // tighter on a phone, where every pixel goes to the name
            spacing={tablet688Up ? '12px' : '8px'}
            {...clickableRow(() => {
              if (longPress.consumeClick(territory.id)) return;
              if (phone && actions && selectionMode) onCheck(territory.id);
              else onOpen(territory.id);
            })}
            {...longPress.handlers(territory.id)}
            sx={{
              alignItems: 'center',
              padding: '8px',
              borderRadius: 'var(--radius-m)',
              ...rowStates(checked.has(territory.id)),
              ...(phone &&
                actions && { userSelect: 'none', WebkitTouchCallout: 'none' }),
            }}
          >
            {actions && (
              <Box
                sx={{
                  ...selectionSlot,
                  '&&': { marginLeft: 0 },
                  flexShrink: 0,
                }}
                aria-hidden={!showCheckboxes}
              >
                <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
                  <Checkbox
                    stopPropagation
                    disabled={!showCheckboxes}
                    sx={{ padding: 0, margin: 0 }}
                    checked={checked.has(territory.id)}
                    onChange={() => onCheck(territory.id)}
                  />
                </Box>
              </Box>
            )}

            {/* Compact personal lists share the history layout on phones. */}
            {(tablet688Up || actions) && (
              <Stack
                spacing="4px"
                sx={{
                  width: tablet688Up ? '48px' : '40px',
                  flexShrink: 0,
                  ...(actions && { '&&': { marginLeft: 0 } }),
                }}
              >
                <Typography
                  className="body-small-semibold"
                  color="var(--black)"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {territory.number}
                </Typography>
                {showHouseholds && <Households count={territory.households} />}
              </Stack>
            )}

            <Stack spacing="4px" sx={{ flexGrow: 1, minWidth: 0 }}>
              <TruncatedText
                className="body-small-semibold"
                text={[
                  !tablet688Up && !actions && territory.number,
                  [territory.city, territory.name].filter(Boolean).join(' • '),
                ]
                  .filter(Boolean)
                  .join(' ')}
              />

              <Stack
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: '4px 12px',
                  flexWrap: 'wrap',
                  minWidth: 0,
                }}
              >
                {!tablet688Up && !actions && showHouseholds && (
                  <Households count={territory.households} />
                )}
                <StatusLine territory={territory} showHolder={showHolder} />

                {!laptopUp && (
                  <Stack direction="row" sx={BADGE_ROW}>
                    {badges(territory, showRequested, showDoNotCalls, me)}
                  </Stack>
                )}
              </Stack>
            </Stack>

            {laptopUp && (
              <Stack
                direction="row"
                sx={{ ...BADGE_ROW, flexShrink: 0, maxWidth: '45%' }}
              >
                {badges(territory, showRequested, showDoNotCalls, me, false)}
              </Stack>
            )}

            {/* on a wide screen the do-not-calls keep a column of their own,
                and the action sits at the far end of a fixed one, so both line up row by row */}
            {laptopUp && (
              <Box
                sx={{
                  flexShrink: 0,
                  width: '56px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                {(showDoNotCalls || territory.holder === me) && (
                  <DoNotCallBadge territory={territory} />
                )}
              </Box>
            )}

            {actions && (
              <Box
                sx={{
                  flexShrink: 0,
                  ...(laptopUp && {
                    minWidth: '176px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }),
                }}
              >
                <AssignButton
                  territory={territory}
                  onOpenAssign={onOpenAssign}
                  onDecline={onDecline}
                  onReturn={onReturn}
                  compact={!tablet688Up}
                />
              </Box>
            )}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
};

export default TerritoryTable;
