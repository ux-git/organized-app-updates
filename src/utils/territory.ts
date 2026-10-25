const territoryNumberCollator = new Intl.Collator(undefined, { numeric: true });

export const compareTerritoryNumbers = (first: string, second: string) =>
  territoryNumberCollator.compare(first, second);

export const territoryNumberKey = (number: string) =>
  number.normalize('NFKC').trim().toUpperCase();

// A suffix keeps a new part beside its original without renumbering neighbours.
export const suggestSplitTerritoryNumber = (
  number: string,
  taken: string[]
) => {
  const base = number.trim().replace(/^(.*\d)[A-Z]+$/i, '$1');
  if (!base) return '';

  const used = new Set(taken.map(territoryNumberKey));
  for (let index = 1; ; index++) {
    let value = index;
    let suffix = '';
    while (value > 0) {
      value--;
      suffix = String.fromCharCode(65 + (value % 26)) + suffix;
      value = Math.floor(value / 26);
    }
    const candidate = `${base}${suffix}`;
    if (!used.has(territoryNumberKey(candidate))) return candidate;
  }
};
