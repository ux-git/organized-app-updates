import { describe, expect, it } from 'vitest';
import { fitText, textWidth } from '@views/territories/shared/textWidth';

const LONG =
  'Bitte beachten: Die Zufahrt über die Ringstraße ist wegen einer Baustelle bis Ende des Jahres gesperrt';

describe('fitText', () => {
  it('keeps a warning that fits', () => {
    expect(fitText('Hund im Hof', 7, 300, true)).toBe('Hund im Hof');
  });

  it('ends a long warning in an ellipsis and fills most of the row', () => {
    for (const room of [60, 120, 200, 365]) {
      const text = fitText(LONG, 7, room, true);
      expect(text.endsWith('…')).toBe(true);
      expect(textWidth(text, 7, true)).toBeLessThanOrEqual(room);
      expect(textWidth(text, 7, true)).toBeGreaterThan(room * 0.85);
    }
  });

  it('cuts a single long word and full-width scripts', () => {
    const word = fitText(
      'Donaudampfschifffahrtsgesellschaftskapitän',
      7,
      100,
      true
    );
    expect(word.endsWith('…')).toBe(true);
    expect(textWidth(word, 7, true)).toBeLessThanOrEqual(100);

    const cjk = fitText(
      '注意：大きな犬がいます。門は常に閉めてください。',
      7,
      100,
      true
    );
    expect(textWidth(cjk, 7, true)).toBeLessThanOrEqual(100);
  });
});
