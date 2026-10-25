import type { Territory, DoNotCall } from '@definition/territory';
import type { TerritoryAccessContext } from '@definition/territory_access';

export const territoryPermissions = (
  territory: Territory,
  context: TerritoryAccessContext
) => {
  const { editor, publisher, access, groupHolder, restricted } = context;
  const held = territory.holderId
    ? territory.holderId === context.publisherId
    : !!publisher && territory.holder === publisher;
  const requested = territory.requestedById
    ? territory.requestedById === context.publisherId
    : !!publisher && territory.requestedBy === publisher;
  const group = territory.holderGroupId
    ? territory.holderGroupId === context.groupId
    : !!groupHolder &&
      (territory.holderGroup === groupHolder ||
        territory.holder === groupHolder);
  const offered =
    !restricted.types.includes(territory.type) &&
    !territory.categories.some((category) =>
      restricted.categories.includes(category)
    );
  const available = territory.status === 'available';

  return {
    view:
      editor ||
      held ||
      group ||
      requested ||
      (access !== 'own' && available && offered),
    private: editor || held || group,
    request:
      !!publisher &&
      context.eligiblePublisher &&
      access === 'request' &&
      available &&
      !territory.cardLost &&
      offered &&
      !territory.requestedBy &&
      !territory.requestPending,
    cancelRequest: requested,
    return: !available && (editor || (access === 'request' && (held || group))),
    editDoNotCalls: editor || held,
  };
};

const publisherDoNotCalls = (
  current: DoNotCall[],
  next: DoNotCall[],
  publisher: string
) => {
  const owned = new Set(
    current
      .filter((entry) => entry.addedBy === publisher)
      .map((entry) => entry.id)
  );
  const protectedIds = new Set(
    current.filter((entry) => !owned.has(entry.id)).map((entry) => entry.id)
  );
  const entries = new Map<string, DoNotCall>();

  for (const entry of next) {
    if (!entry.id || protectedIds.has(entry.id)) continue;
    if (entry.addedBy !== publisher || !entry.address.trim()) continue;
    entries.set(entry.id, entry);
  }

  return [
    ...current.filter((entry) => protectedIds.has(entry.id)),
    ...entries.values(),
  ];
};

// A publisher can change their request or their own do-not-call records,
// without replacing the rest of a territory from a stale details form.
export const publisherTerritoryChanges = (
  current: Territory,
  next: Territory,
  context: TerritoryAccessContext
): Partial<Territory> => {
  if (current.id !== next.id) return {};
  const permissions = territoryPermissions(current, context);
  const changes: Partial<Territory> = {};

  if (next.requestedBy !== current.requestedBy) {
    if (permissions.request && next.requestedBy === context.publisher) {
      changes.requestedBy = context.publisher;
    } else if (permissions.cancelRequest && !next.requestedBy) {
      changes.requestedBy = undefined;
    }
  }

  if (permissions.editDoNotCalls && next.doNotCalls !== current.doNotCalls) {
    changes.doNotCalls = publisherDoNotCalls(
      current.doNotCalls,
      next.doNotCalls,
      context.publisher
    );
  }

  return changes;
};

export const territoryHistoryForPublisher = (
  territories: Territory[],
  publisher: string
) =>
  publisher
    ? territories.flatMap((territory) => {
        const assignments = territory.assignments.filter(
          (assignment) => assignment.publisher === publisher
        );
        return assignments.length ? [{ ...territory, assignments }] : [];
      })
    : [];
