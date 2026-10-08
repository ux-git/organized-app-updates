import type { Territory } from '@definition/territory';

export type SelectionAction = { kind: 'assign' | 'return'; count: number };

// selected follows selection insertion order, regardless of the visible sort/filter.
export const selectionActions = (selected: Territory[]): SelectionAction[] => {
  const actions: SelectionAction[] = [];
  for (const territory of selected) {
    const kind =
      territory.status === 'available'
        ? 'assign'
        : territory.status === 'in_work' || territory.status === 'overdue'
          ? 'return'
          : undefined;
    if (!kind) continue;
    const action = actions.find((item) => item.kind === kind);
    if (action) action.count++;
    else actions.push({ kind, count: 1 });
  }
  return actions;
};
