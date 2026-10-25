import type {
  AssignmentHolder,
  Territory,
  TerritoryAssignment,
} from '@definition/territory';

// group first, "?" while nobody is named as having taken it
export const holderText = ({ publisher, group }: Partial<AssignmentHolder>) =>
  group ? `${group} · ${publisher || '?'}` : (publisher ?? '');

export const territoryHolderText = (territory: Territory) =>
  holderText({ publisher: territory.holder, group: territory.holderGroup });

export const holderOf = ({
  publisher,
  group,
}: AssignmentHolder): AssignmentHolder =>
  group ? { publisher, group } : { publisher };

export const missingPublisher = (item: Partial<AssignmentHolder>) =>
  !!item.group && !item.publisher;

const migrated = (
  item: TerritoryAssignment,
  groups: Set<string>
): TerritoryAssignment =>
  groups.has(item.publisher)
    ? { ...item, group: item.group || item.publisher, publisher: '' }
    : item;

// old records named a group as the publisher: the name moves to the group,
// and who took it is left to fill in
export const withGroupHolders = (
  territories: Territory[],
  groupNames: string[]
) => {
  const groups = new Set(groupNames.filter(Boolean));

  return territories.map((territory) => {
    const named = (name?: string) => !!name && groups.has(name);
    if (
      !named(territory.holder) &&
      !territory.assignments.some((item) => named(item.publisher))
    )
      return territory;

    return {
      ...territory,
      ...(named(territory.holder)
        ? {
            holder: '',
            holderGroup: territory.holderGroup || territory.holder,
          }
        : {}),
      assignments: territory.assignments.map((item) => migrated(item, groups)),
    };
  });
};
