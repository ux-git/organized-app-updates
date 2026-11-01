import { withAssignments } from '@utils/territory_dates';
import type { Territory, DoNotCall } from '@definition/territory';
import type { TerritoryAccessContext } from '@definition/territory_access';

export const territoryPermissions = (
  territory: Territory,
  context: TerritoryAccessContext
) => {
  // Assignment history is authoritative when stored status or holder fields lag.
  // Legacy records without history still use their stored assignment summary.
  if (territory.assignments.length > 0) {
    territory = withAssignments(territory, territory.assignments);
  }

  const { editor, publisher, access, groupHolder, restricted } = context;
  const held = territory.holderId
    ? territory.holderId === context.publisherId
    : context.legacyIdentitySafe !== false &&
      !!publisher &&
      territory.holder === publisher;
  const requested =
    !!territory.requestedBy &&
    (territory.requestedById
      ? territory.requestedById === context.publisherId
      : context.legacyIdentitySafe !== false &&
        !!publisher &&
        territory.requestedBy === publisher);
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
      territory.assignments.some(
        (assignment) =>
          !!assignment.publisherId &&
          assignment.publisherId === context.publisherId
      ) ||
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
  publisher: string,
  publisherId?: string,
  legacyIdentitySafe?: boolean
) => {
  const ownsEntry = (entry: DoNotCall) =>
    entry.addedById
      ? entry.addedById === publisherId
      : legacyIdentitySafe !== false &&
        !!publisher &&
        entry.addedBy === publisher;
  const owned = new Set(current.filter(ownsEntry).map((entry) => entry.id));
  const protectedIds = new Set(
    current.filter((entry) => !owned.has(entry.id)).map((entry) => entry.id)
  );
  const entries = new Map<string, DoNotCall>();

  for (const entry of next) {
    if (!entry.id || protectedIds.has(entry.id)) continue;
    if (!ownsEntry(entry) || !entry.address.trim()) continue;
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
      if (context.publisherId) changes.requestedById = context.publisherId;
    } else if (permissions.cancelRequest && !next.requestedBy) {
      changes.requestedBy = undefined;
      if (current.requestedById) changes.requestedById = undefined;
      if (current.requestPending) changes.requestPending = false;
    }
  }

  if (permissions.editDoNotCalls && next.doNotCalls !== current.doNotCalls) {
    changes.doNotCalls = publisherDoNotCalls(
      current.doNotCalls,
      next.doNotCalls,
      context.publisher,
      context.publisherId,
      context.legacyIdentitySafe
    );
  }

  return changes;
};

export const territoryHistoryForPublisher = (
  territories: Territory[],
  publisher: string,
  publisherId?: string,
  legacyIdentitySafe?: boolean
) =>
  publisher || publisherId
    ? territories.flatMap((territory) => {
        const assignments = territory.assignments.filter((assignment) =>
          assignment.publisherId
            ? assignment.publisherId === publisherId
            : legacyIdentitySafe !== false &&
              !!publisher &&
              assignment.publisher === publisher
        );
        return assignments.length ? [{ ...territory, assignments }] : [];
      })
    : [];
