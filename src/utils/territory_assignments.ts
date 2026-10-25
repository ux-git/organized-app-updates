import type { TerritoryAssignment } from '@definition/territory';

const calendarDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const storedDay = (value: string) => {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) return undefined;
  const [day, month, year] = value.split('.').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  )
    return undefined;
  return date.getTime();
};

export const parseTerritoryHouseholds = (text: string, fallback: number) => {
  if (!text.trim()) return fallback;
  if (!/^\d+$/.test(text.trim())) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : undefined;
};

export const territoryReturnDateError = (
  assignments: Pick<TerritoryAssignment, 'assignedOn' | 'returnedOn'>[],
  returnedOn: Date | null,
  today = new Date()
) => {
  if (!returnedOn || !Number.isFinite(returnedOn.getTime()))
    return 'tr_territoryDateRequired';
  const end = calendarDay(returnedOn);
  if (end > calendarDay(today)) return 'tr_territoryDateFuture';
  for (const assignment of assignments) {
    if (assignment.returnedOn) continue;
    const start = storedDay(assignment.assignedOn);
    if (start === undefined) return 'tr_territoryAssignmentDateInvalid';
    if (end < start) return 'tr_territoryReturnBeforeAssigned';
  }
  return undefined;
};
