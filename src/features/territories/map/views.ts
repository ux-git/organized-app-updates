import {
  STATUS_COLOR,
  STATUS_LABEL,
  Territory,
  TYPE_LABEL,
} from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { daysLabel, parseDate, periodWindow, serviceYear } from '../helpers';

export type ColorView =
  | 'status'
  | 'lastCovered'
  | 'heatmap'
  | 'type'
  | 'original';

export const HEATMAP_PERIODS = () => [
  { id: 'last6', label: tx('Last 6 months') },
  { id: 'last12', label: tx('Last 12 months') },
  ...[1, 2, 3].map((back) => ({
    id: `sy${serviceYear() - back}`,
    label: tx('{{year}} service year', { year: serviceYear() - back }),
  })),
];

export const COLOR_VIEWS = [
  {
    id: 'status' as ColorView,
    label: 'Status',
    description: 'Available, in work or overdue',
  },
  {
    id: 'lastCovered' as ColorView,
    label: 'Last covered',
    description: 'How long ago it was last worked',
  },
  {
    id: 'heatmap' as ColorView,
    label: 'Heatmap',
    description: 'How often it was worked in a chosen period',
  },
  {
    id: 'type' as ColorView,
    label: 'Type',
    description: 'Door to door or business',
  },
  {
    id: 'original' as ColorView,
    label: 'Own colors',
    description: 'The colors picked for each territory',
  },
];

type Bucket = { key: string; label: string; color: string };

const DAY = 86400000;

const RECENCY: Bucket[] = [
  { key: 'h0', label: 'Under 3 months', color: '--green-main' },
  { key: 'h1', label: '3 to 6 months', color: '--orange-main' },
  { key: 'h2', label: '6 to 12 months', color: '--orange-dark' },
  { key: 'h3', label: 'Over a year', color: '--red-main' },
  { key: 'never', label: 'No records yet', color: '--grey-350' },
];

const FREQUENCY: Bucket[] = [
  { key: 'f0', label: 'Not worked', color: '--accent-300' },
  { key: 'f1', label: 'Once', color: '--green-main' },
  { key: 'f2', label: 'Twice', color: '--orange-main' },
  { key: 'f3', label: '3 times', color: '--orange-dark' },
  { key: 'f4', label: '4 times or more', color: '--red-main' },
];

const TYPES: Bucket[] = [
  { key: 'door_to_door', label: 'Door to door', color: '--accent-main' },
  { key: 'business', label: 'Business', color: '--orange-main' },
];

const returns = (territory: Territory) =>
  territory.assignments
    .map((assignment) => parseDate(assignment.returnedOn)?.getTime())
    .filter((time): time is number => !!time);

const recencyKey = (territory: Territory) => {
  const last = Math.max(0, ...returns(territory));
  if (!last) return 'never';

  const days = (Date.now() - last) / DAY;

  if (days < 91) return 'h0';
  if (days < 182) return 'h1';
  if (days < 365) return 'h2';
  return 'h3';
};

const timesWorked = (territory: Territory, period: string) => {
  const window = periodWindow(period);
  if (!window) return 0;
  const { start, end } = window;

  return returns(territory).filter(
    (time) => time >= start.getTime() && time <= end.getTime()
  ).length;
};

const lastCoveredText = (territory: Territory) => {
  const last = Math.max(0, ...returns(territory));
  if (!last) return tx('Never');

  return daysLabel(Math.round((Date.now() - last) / DAY));
};

export const colorScheme = (view: ColorView, period = 'last12') => {
  if (view === 'lastCovered') {
    return {
      buckets: RECENCY,
      keyOf: recencyKey,
      detailOf: lastCoveredText,
    };
  }

  if (view === 'heatmap') {
    return {
      buckets: FREQUENCY,
      keyOf: (territory: Territory) =>
        `f${Math.min(timesWorked(territory, period), 4)}`,
      detailOf: (territory: Territory) => `${timesWorked(territory, period)}×`,
    };
  }

  if (view === 'original') {
    return {
      buckets: [] as Bucket[],
      keyOf: () => '',
      detailOf: () => '',
    };
  }

  if (view === 'type') {
    return {
      buckets: TYPES,
      keyOf: (territory: Territory) => territory.type,
      detailOf: (territory: Territory) => tx(TYPE_LABEL[territory.type]),
    };
  }

  return {
    buckets: (['available', 'in_work', 'overdue'] as const).map((status) => ({
      key: status,
      label: STATUS_LABEL[status],
      color: `--${STATUS_COLOR[status]}-main`,
    })),
    keyOf: (territory: Territory) => territory.status as string,
    detailOf: (territory: Territory) => tx(STATUS_LABEL[territory.status]),
  };
};
