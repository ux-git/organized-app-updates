import { describe, expect, test } from 'vitest';
import { Territory } from '@definition/territory';
import { joinNotes, withNote } from './notes';

describe('joinNotes', () => {
  test('both texts a blank line apart, trimmed', () => {
    expect(joinNotes('Gate code 1234 ', '\nMany dogs')).toBe(
      'Gate code 1234\n\nMany dogs'
    );
  });

  test('nothing unless both sides are text', () => {
    expect(joinNotes('Many dogs', '')).toBeUndefined();
    expect(joinNotes('  ', 'Many dogs')).toBeUndefined();
    expect(joinNotes(null, 'Many dogs')).toBeUndefined();
    expect(joinNotes(3, 'Many dogs')).toBeUndefined();
  });
});

describe('withNote', () => {
  const territories = [
    {
      id: 't1',
      notes: 'old',
      assignments: [{ id: 'a1', note: 'one' }, { id: 'a2' }],
    },
    { id: 't2', assignments: [{ id: 'a3', note: 'three' }] },
  ] as Territory[];

  test('replaces a territory’s notes and leaves the rest alone', () => {
    const next = withNote(territories, 'territories', 't1', 'joined');
    expect(next[0].notes).toBe('joined');
    expect(next[0].assignments).toBe(territories[0].assignments);
    expect(next[1]).toBe(territories[1]);
  });

  test('replaces an assignment’s note in the territory that holds it', () => {
    const next = withNote(territories, 'assignments', 'a3', 'joined');
    expect(next[0]).toBe(territories[0]);
    expect(next[1].assignments).toEqual([{ id: 'a3', note: 'joined' }]);
  });

  test('an unknown record changes nothing', () => {
    expect(withNote(territories, 'assignments', 'a9', 'x')).toEqual(
      territories
    );
    expect(withNote(territories, 'do_not_calls', 'a1', 'x')).toEqual(
      territories
    );
  });
});
