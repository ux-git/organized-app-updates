import type { Territory } from '@definition/territory';

// what an assign or return sets; other edits made since stay
const FIELDS = [
  'status',
  'holder',
  'holderGroup',
  'daysOut',
  'requestedBy',
  'daysSinceCovered',
  'reviewNeeded',
  'households',
] as const;

// only the open assignment gets closed, so only it goes back; `added` are the new ones
export const revertAssignment = (
  current: Territory,
  before: Territory,
  added: string[]
): Territory => {
  const reopened = new Map(
    before.assignments
      .filter((item) => !item.returnedOn)
      .map((item) => [item.id, item])
  );

  return {
    ...current,
    ...Object.fromEntries(FIELDS.map((key) => [key, before[key]])),
    assignments: current.assignments
      .filter((item) => !added.includes(item.id))
      .map((item) => reopened.get(item.id) ?? item),
  };
};
