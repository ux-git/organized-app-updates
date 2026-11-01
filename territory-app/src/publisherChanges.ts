import type { Territory, TerritoryAssignment } from '@definition/territory';
import {
  assignmentFromDates,
  parseDate,
  withAssignments,
} from '@features/territories/helpers';
import { revertAssignment } from '@features/territories/assignment_undo';
import type { Person } from './persistence';

export type Resolution = { target?: string };
export type PublisherChange = {
  mergeInto?: Person;
  resolutions: Record<string, Resolution>;
};
// a group's name is on its assignments as the group, a person's as the publisher
const names = (item: TerritoryAssignment, name: string) =>
  item.publisher === name || item.group === name;

const renamed = (
  item: TerritoryAssignment,
  name: string,
  target: string
): TerritoryAssignment => ({
  ...item,
  ...(item.publisher === name ? { publisher: target } : {}),
  ...(item.group === name ? { group: target } : {}),
});

export const activeFor = (territory: Territory, name: string) =>
  territory.assignments.filter((item) => names(item, name) && !item.returnedOn);

/** Pure preview: deleting a directory entry never deletes assignment records. */
export const changedTerritories = (
  territories: Territory[],
  person: Person,
  change: PublisherChange,
  now = new Date()
) =>
  territories.map((territory) => {
    const target = change.mergeInto?.name;
    if (target) {
      if (
        !territory.assignments.some((item) => names(item, person.name)) &&
        territory.holder !== person.name &&
        territory.requestedBy !== person.name
      )
        return territory;
      return withAssignments(
        {
          ...territory,
          requestedBy:
            territory.requestedBy === person.name
              ? target
              : territory.requestedBy,
        },
        territory.assignments.map((item) =>
          names(item, person.name) ? renamed(item, person.name, target) : item
        )
      );
    }
    const active = activeFor(territory, person.name);
    if (!active.length)
      return territory.requestedBy === person.name
        ? { ...territory, requestedBy: undefined }
        : territory;
    const resolution = change.resolutions[territory.id];
    if (!resolution)
      throw new Error('Choose how to resolve every active territory.');
    if (resolution.target === person.name)
      throw new Error('Choose another publisher.');
    if (
      resolution.target &&
      territory.assignments.some(
        (item) => !item.returnedOn && !active.includes(item)
      )
    )
      throw new Error(
        'Resolve the other open assignment before transferring this territory.'
      );
    if (
      !resolution.target &&
      active.some(
        (item) => (parseDate(item.assignedOn)?.getTime() ?? 0) > now.getTime()
      )
    )
      throw new Error(
        'An assignment starts in the future. Correct its date before returning it.'
      );
    const assignments: TerritoryAssignment[] = territory.assignments.map(
      (item) => {
        if (!active.includes(item)) return item;
        if (resolution.target)
          return renamed(item, person.name, resolution.target);
        return assignmentFromDates(
          item,
          item.publisher,
          parseDate(item.assignedOn) ?? now,
          now
        );
      }
    );
    return withAssignments(
      {
        ...territory,
        requestedBy:
          territory.requestedBy === person.name
            ? undefined
            : territory.requestedBy,
      },
      assignments
    );
  });

// undoes a removal or merge: what it changed goes back, later edits elsewhere stay
export const revertedTerritories = (
  current: Territory[],
  before: Territory[],
  after: Territory[]
) => {
  const changed = new Map(
    before.flatMap((old, index) =>
      old === after[index] ? [] : [[old.id, { old, new: after[index] }]]
    )
  );
  return current.map((territory) => {
    const change = changed.get(territory.id);
    if (!change) return territory;
    const touched = new Map(
      change.old.assignments
        .filter(
          (item) =>
            JSON.stringify(item) !==
            JSON.stringify(
              change.new.assignments.find((next) => next.id === item.id)
            )
        )
        .map((item) => [item.id, item])
    );
    if (
      [...touched.keys()].some(
        (id) =>
          JSON.stringify(
            territory.assignments.find((item) => item.id === id)
          ) !==
          JSON.stringify(change.new.assignments.find((item) => item.id === id))
      )
    )
      return territory;
    const reverted = revertAssignment(territory, change.old, [], change.new);
    if (reverted === territory) return territory;
    return {
      ...reverted,
      assignments: reverted.assignments.map(
        (item) => touched.get(item.id) ?? item
      ),
    };
  });
};

/** Given out twice: the other open one is returned the day the kept one began. */
export const keepOneAssignment = (territory: Territory, keptId: string) => {
  const kept = territory.assignments.find((item) => item.id === keptId);
  const end = parseDate(kept?.assignedOn);
  if (!kept || !end) return territory;
  return withAssignments(
    territory,
    territory.assignments.map((item) => {
      if (item === kept || item.returnedOn) return item;
      const start = parseDate(item.assignedOn) ?? end;
      return assignmentFromDates(
        item,
        item.publisher,
        start,
        start > end ? start : end
      );
    })
  );
};
