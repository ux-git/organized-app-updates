// react-pdf cannot measure before layout, so Inter's glyph widths by kind
// stand in; within about 3% of the real width for Latin text
const NARROW = new Set("ijlftrI.,:;!'|()[]-");
const WIDE = new Set('mwMW');
const SAFETY = 0.96;

const glyph = (char: string, bold: boolean) => {
  if (char === ' ') return bold ? 0.25 : 0.28;
  if (NARROW.has(char)) return bold ? 0.34 : 0.32;
  if (WIDE.has(char)) return bold ? 0.92 : 0.9;
  if (char === '…') return bold ? 0.96 : 0.87;
  if (/\d/.test(char)) return bold ? 0.61 : 0.6;
  // CJK and other full-width scripts
  if (char.codePointAt(0)! >= 0x2e80) return 1;
  if (char !== char.toLowerCase()) return bold ? 0.7 : 0.68;
  return bold ? 0.6 : 0.58;
};

export const textWidth = (text: string, size: number, bold = false) =>
  [...text].reduce((sum, char) => sum + glyph(char, bold), 0) * size;

export const fits = (width: number, room: number) => width <= room * SAFETY;

// cut at a word, so the ellipsis follows a whole word, unless that would
// leave a tenth of the row empty: then the next word is cut instead
export const fitText = (
  text: string,
  size: number,
  room: number,
  bold = false
) => {
  if (fits(textWidth(text, size, bold), room)) return text;

  const width = (value: string) => textWidth(`${value}…`, size, bold);
  const words = text.split(/\s+/);
  let kept = 0;
  while (
    kept < words.length &&
    fits(width(words.slice(0, kept + 1).join(' ')), room)
  )
    kept++;

  let cut = words.slice(0, kept).join(' ');
  if (kept < words.length && fits(width(cut), room * 0.9)) {
    const next = words[kept];
    let chars = 0;
    const partial = (n: number) => `${cut}${cut ? ' ' : ''}${next.slice(0, n)}`;
    while (chars < next.length && fits(width(partial(chars + 1)), room))
      chars++;
    if (chars > 0) cut = partial(chars);
  }
  return `${cut.replace(/[\s,;:.!?–-]+$/, '')}…`;
};
