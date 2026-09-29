import { BadgeColor } from '@definition/app';

export type TerritoryStatus = 'available' | 'in_work' | 'overdue';

export type TerritoryType = 'door_to_door' | 'business' | 'phone';

// a fixed set: the blue is the midweek meeting blue, not the theme accent,
// so a category keeps its colour whatever colour scheme the app uses
export type CategoryColor = 'blue' | 'green' | 'orange' | 'red' | 'grey';

export type TerritoryCategoryOption = {
  id: string;
  name: string;
  color: CategoryColor;
};

export type DoNotCall = {
  id: string;
  address: string;
  name?: string;
  date: string;
  addedBy: string;
};

// a closed ring of [longitude, latitude] pairs, in GeoJSON order
export type TerritoryBoundary = [number, number][];

export type MapColor = 'red' | 'blue' | 'green' | 'orange' | 'purple' | 'black';

export type PinType =
  | 'normal'
  | 'parking'
  | 'restaurant'
  | 'transport'
  | 'shop'
  | 'nature'
  | 'gas'
  | 'sight'
  | 'building'
  | 'school'
  | 'cart';

export type TerritoryMapMarker = {
  id: string;
  kind: 'pin' | 'text';
  position: [number, number];
  text?: string;
  pinType?: PinType;
  color?: MapColor;
};

export type MapStyle = {
  border: MapColor | 'transparent';
  fill: MapColor | 'transparent';
};

export type TerritoryMapShape = MapStyle & {
  id: string;
  path: TerritoryBoundary;
  label?: string;
};

export type TerritoryMapLine = {
  id: string;
  path: [number, number][];
  style: 'solid' | 'dashed';
};

export type TerritoryMapDraft = {
  boundary?: TerritoryBoundary;
  boundaryStyle?: MapStyle;
  shapes: TerritoryMapShape[];
  lines: TerritoryMapLine[];
  markers: TerritoryMapMarker[];
};

// how the territory went out: on the phone, or as a printed card to take back
export type AssignmentCard = 'digital' | 'printed';

export type TerritoryAssignment = {
  id: string;
  publisher: string;
  assignedOn: string;
  returnedOn?: string;
  // the service year the work was returned in, e.g. 2026 for Sep 2025 - Aug 2026
  serviceYear: number;
  months: number;
  startMonth: number;
  endMonth: number;
  // the special campaign it was worked for; `coverage` when the work counts
  // as regular coverage too
  campaign?: { id: string; name: string; coverage?: boolean };
  // what the publisher found this time, e.g. the languages spoken; never printed
  note?: string;
  // unset on records from before the choice existed
  card?: AssignmentCard;
};

// a "Special campaign" event in Organized, or the territory app's own entry;
// start and end are calendar days, yyyy-mm-dd
export type TerritoryCampaign = {
  id: string;
  name: string;
  start: string;
  end: string;
  group?: string;
};

export type Territory = {
  id: string;
  number: string;
  name: string;
  city: string;
  type: TerritoryType;
  status: TerritoryStatus;
  categories: string[];
  holder?: string;
  daysOut?: number;
  daysSinceCovered: number;
  households: number;
  cardLost: boolean;
  doNotCalls: DoNotCall[];
  assignments: TerritoryAssignment[];
  boundary?: TerritoryBoundary;
  boundaryStyle?: MapStyle;
  mapShapes?: TerritoryMapShape[];
  mapLines?: TerritoryMapLine[];
  mapMarkers?: TerritoryMapMarker[];
  phoneNumbers?: string[];
  requestedBy?: string;
  reviewNeeded?: boolean;
  // standing information, printed on the card: no names or addresses
  notes?: string;
};

// a publisher or a field service group a territory can go to
export type TerritoryAssignee = { id: string; name: string; group: boolean };

export type TerritoryFilters = {
  search: string;
  status: TerritoryStatus[];
  type: TerritoryType[];
  categories: string[];
  coverage?: { covered: boolean; period: string };
  cardLostOnly: boolean;
  // how the territory is out now; `unknown` for open records without the field
  card: (AssignmentCard | 'unknown')[];
  holder?: string;
  // the holder's earlier territories too, not only the ones held now
  holderPast?: boolean;
  // worked for the special campaign, or not yet assigned for it
  campaign?: { id: string; worked: boolean };
};

export type TerritoryAccess = 'own' | 'view' | 'request';

export type TerritoryRestrictions = {
  categories: string[];
  types: TerritoryType[];
};

export type TerritoryTab =
  | 'requests'
  | 'recommended'
  | 'all'
  | 'mine'
  | 'group'
  | 'requested';

export const STATUS_LABEL: Record<TerritoryStatus, string> = {
  available: 'Available',
  in_work: 'In work',
  overdue: 'Overdue',
};

export const STATUS_COLOR: Record<TerritoryStatus, BadgeColor> = {
  available: 'green',
  in_work: 'orange',
  overdue: 'red',
};

export const TYPE_LABEL: Record<TerritoryType, string> = {
  door_to_door: 'Door to door',
  business: 'Business',
  phone: 'Call',
};

export const CARD_LABEL: Record<AssignmentCard, string> = {
  digital: 'Digital',
  printed: 'Printed card',
};

export const DEFAULT_CATEGORIES: TerritoryCategoryOption[] = [
  { id: 'dangerous', name: 'Dangerous', color: 'red' },
  { id: 'dogs', name: 'Dogs', color: 'orange' },
  { id: 'gated', name: 'Gated access', color: 'blue' },
  { id: 'rural', name: 'Rural', color: 'green' },
];

export const CATEGORY_COLORS: CategoryColor[] = [
  'blue',
  'green',
  'orange',
  'red',
  'grey',
];

// one category per color, so each stays recognisable at a glance
export const MAX_CATEGORIES = CATEGORY_COLORS.length;

export const MAX_CATEGORY_NAME = 20;

// a territory's notes and an assignment's note alike
export const MAX_NOTE_LENGTH = 500;

export const CATEGORY_COLOR_LABEL: Record<CategoryColor, string> = {
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  red: 'Red',
  grey: 'Grey',
};
