/** A portable filename, including Windows device names and forbidden characters. */
export const exportFileName = (name: string) => {
  const cleaned = Array.from(name)
    .map((character) =>
      character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)
        ? '-'
        : character
    )
    .join('')
    .trim()
    .replace(/[. ]+$/, '');
  if (!cleaned || /^\.+$/.test(cleaned)) return 'export';
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(cleaned)
    ? `_${cleaned}`
    : cleaned;
};
