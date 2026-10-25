import type { Territory, DoNotCall } from '@definition/territory';
import type { TerritoryAccessContext } from '@definition/territory_access';

export const territoryPermissions = (
  territory: Territory,
  context: TerritoryAccessContext
) => {
  const { editor, publisher, access, groupHolder, restricted } = context;
  const held = !!publisher && territory.holder === publisher;
  const requested = !!publisher && territory.requestedBy === publisher;
  const group =
    !!groupHolder &&
    (territory.holderGroup === groupHolder || territory.holder === groupHolder);
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
      offered &&
      !territory.requestedBy,
    cancelRequest: requested,
    return: !available && (editor || (access === 'request' && (held || group))),
    editDoNotCalls: editor || held,
  };
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
    const owned = new Set(
      current.doNotCalls
        .filter((entry) => entry.addedBy === context.publisher)
        .map((entry) => entry.id)
    );
    const protectedIds = new Set(
      current.doNotCalls
        .filter((entry) => !owned.has(entry.id))
        .map((entry) => entry.id)
    );
    const entries = new Map<string, DoNotCall>();

    for (const entry of next.doNotCalls) {
      if (!entry.id || protectedIds.has(entry.id)) continue;
      if (entry.addedBy !== context.publisher || !entry.address.trim())
        continue;
      entries.set(entry.id, entry);
    }

    changes.doNotCalls = [
      ...current.doNotCalls.filter((entry) => protectedIds.has(entry.id)),
      ...entries.values(),
    ];
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
