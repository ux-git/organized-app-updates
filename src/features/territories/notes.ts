import type { Territory, TerritoryAssignment } from '@definition/territory';

// dd.mm.yyyy, as stored; kept here so the notes have no app imports
const dayOf = (value?: string) => {
  const [day, month, year] = (value ?? '').split('.').map(Number);
  if (!day || !month || !year) return 0;

  return new Date(year, month - 1, day).getTime();
};

// the newest return that came with a note: what the last publisher found
export const latestReturnNote = (assignments: TerritoryAssignment[]) =>
  [...assignments]
    .filter((item) => item.returnedOn && item.note?.trim())
    .sort((a, b) => dayOf(b.returnedOn) - dayOf(a.returnedOn))
    .at(0);

// a note on one line, for a list row
export const noteLine = (note: string) =>
  note.trim().replace(/\s*\n+\s*/g, ' · ');

// an assignment's finding joins the standing notes, a blank line apart
export const appendNote = (notes: string | undefined, note: string) =>
  [notes?.trim(), note.trim()].filter(Boolean).join('\n\n');

export const hasNewNote = (territory: Territory) =>
  !!territory.reviewNeeded && !!latestReturnNote(territory.assignments);
