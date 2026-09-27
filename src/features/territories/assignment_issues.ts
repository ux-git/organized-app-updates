import type { TerritoryAssignment } from '@definition/territory';

export type AssignmentIssue =
  | 'assigned_future'
  | 'returned_future'
  | 'returned_before_assigned';

// dd.mm.yyyy, as stored; kept here so the check has no app imports
const dayOf = (value?: string) => {
  const [day, month, year] = (value ?? '').split('.').map(Number);
  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day).getTime();
};

// dates that can't be right, whether typed, imported or synced; none blocks saving
export const assignmentIssues = (
  assignment: Pick<TerritoryAssignment, 'assignedOn' | 'returnedOn'>,
  today = new Date()
) => {
  const now = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const assigned = dayOf(assignment.assignedOn);
  const returned = dayOf(assignment.returnedOn);

  const issues: AssignmentIssue[] = [];
  if (assigned !== null && assigned > now) issues.push('assigned_future');
  if (returned !== null && returned > now) issues.push('returned_future');
  if (assigned !== null && returned !== null && returned < assigned) {
    issues.push('returned_before_assigned');
  }

  return issues;
};

export const ISSUE_TEXT: Record<AssignmentIssue, string> = {
  assigned_future: 'Assigned date is in the future',
  returned_future: 'Returned date is in the future',
  returned_before_assigned: 'Returned before it was assigned',
};
