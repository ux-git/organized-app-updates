import type { TerritoryAssignee } from '@definition/territory';
import type {
  TerritoryCommand,
  TerritoryPendingChange,
} from '@definition/territory_sync';
import {
  encodeTerritory,
  encodeTerritoryAssignment,
  encryptTerritoryContent,
  TerritoryIdentityError,
} from '@services/app/territory_codec';

export const prepareTerritoryCommands = (
  change: TerritoryPendingChange,
  manager: boolean,
  assignees: TerritoryAssignee[],
  key: string
): TerritoryCommand[] => {
  const { before, after, baseRevision: expectedRevision } = change;
  if (manager) {
    if (!after) return [{ action: 'delete', expectedRevision }];
    return [
      {
        action: 'reconcile',
        expectedRevision,
        ...encodeTerritory(after, change.dataView, assignees, key),
      },
    ];
  }
  if (!before || !after)
    throw new TerritoryIdentityError(
      'A manager must import or delete territories'
    );
  const commands: TerritoryCommand[] = [];
  const add = (command: TerritoryCommand) =>
    commands.push({
      ...command,
      expectedRevision: expectedRevision + commands.length,
    });
  if (before.requestedBy !== after.requestedBy)
    add({
      action: after.requestedBy ? 'request' : 'cancel_request',
      expectedRevision,
    });
  const active = before.assignments.find((item) => !item.returnedOn);
  const updated = after.assignments.find((item) => item.id === active?.id);
  if (active && updated?.returnedOn) {
    const assignment = encodeTerritoryAssignment(updated, assignees, key);
    add({
      action: 'return',
      expectedRevision,
      returnedAt: assignment.returnedAt,
      completed: updated.completed !== false,
      notes: assignment.notes,
      households: after.households,
    });
  } else if (active && updated && active.note !== updated.note) {
    add({
      action: 'assignment_note',
      expectedRevision,
      notes: encryptTerritoryContent(updated.note ?? '', key),
    });
  }
  for (const entry of after.doNotCalls) {
    if (
      JSON.stringify(before.doNotCalls.find((item) => item.id === entry.id)) !==
      JSON.stringify(entry)
    )
      add({
        action: 'do_not_call',
        expectedRevision,
        entryId: entry.id,
        content: encryptTerritoryContent(entry, key),
      });
  }
  for (const entry of before.doNotCalls) {
    if (!after.doNotCalls.some((item) => item.id === entry.id))
      add({ action: 'do_not_call', expectedRevision, entryId: entry.id });
  }
  if (!commands.length)
    throw new TerritoryIdentityError('This change requires a manager');
  return commands;
};
