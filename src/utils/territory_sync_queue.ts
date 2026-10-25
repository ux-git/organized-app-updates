import type {
  TerritoryPendingChange,
  TerritoryPendingOperation,
} from '@definition/territory_sync';

/** Correct an unsent draft in place; never alter ciphertext that may already have reached the server. */
export const coalesceTerritoryChanges = (
  queue: TerritoryPendingOperation[],
  changes: TerritoryPendingChange[]
) => {
  const operation = [...queue]
    .reverse()
    .find(
      (item) =>
        !item.prepared &&
        changes.every((change) =>
          item.changes.some((previous) => previous.id === change.id)
        )
    );
  if (!operation) return false;
  for (const change of changes) {
    const previous = operation.changes.find((item) => item.id === change.id)!;
    previous.after = change.after;
  }
  operation.changes = operation.changes.filter(
    (change) => JSON.stringify(change.before) !== JSON.stringify(change.after)
  );
  return true;
};
