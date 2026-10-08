import type { Territory, TerritoryAssignment } from '@definition/territory';
import {
  assignmentFromDates,
  parseDate,
  withAssignments,
} from '@features/territories/helpers';
import type { Person } from './persistence';

export type Resolution = { target?: string; completed: boolean };
export type PublisherChange = {
  mergeInto?: Person;
  resolutions: Record<string, Resolution>;
};
export const activeFor = (territory: Territory, name: string) =>
  territory.assignments.filter(
    (item) => item.publisher === name && !item.returnedOn
  );

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
        !territory.assignments.some((item) => item.publisher === person.name) &&
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
          item.publisher === person.name ? { ...item, publisher: target } : item
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
        if (resolution.target) return { ...item, publisher: resolution.target };
        return {
          ...assignmentFromDates(
            item,
            item.publisher,
            parseDate(item.assignedOn) ?? now,
            now
          ),
          completed: resolution.completed,
        };
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
