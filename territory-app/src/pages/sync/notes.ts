import { Territory } from '@definition/territory';

// a territory's notes, and an assignment's note
export const NOTE_FIELDS = ['notes', 'note'];

/** Both texts a blank line apart, or nothing unless both are text. */
export const joinNotes = (kept: unknown, lost: unknown) =>
  typeof kept === 'string' &&
  typeof lost === 'string' &&
  kept.trim() &&
  lost.trim()
    ? `${kept.trim()}\n\n${lost.trim()}`
    : undefined;

/** The territories with one territory's notes, or one assignment's note, replaced. */
export const withNote = (
  territories: Territory[],
  table: string,
  id: string,
  text: string
) =>
  territories.map((territory) => {
    if (table === 'territories') {
      return territory.id === id ? { ...territory, notes: text } : territory;
    }
    if (
      table === 'assignments' &&
      territory.assignments.some((assignment) => assignment.id === id)
    ) {
      return {
        ...territory,
        assignments: territory.assignments.map((assignment) =>
          assignment.id === id ? { ...assignment, note: text } : assignment
        ),
      };
    }
    return territory;
  });
