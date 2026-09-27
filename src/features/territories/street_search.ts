// street name -> territory numbers
export type StreetIndex = Record<string, string[]>;

export type StreetMatch = { name: string; numbers: string[] };

// "Rheinstraße", "rheinstrasse" and "Rheinstr." read the same
export const streetWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.replace(/str$/, 'strasse'));

// every typed word starts a word of the name, or the whole starts the name
const matches = (query: string[], name: string[]) =>
  query.every((word) => name.some((part) => part.startsWith(word))) ||
  name.join('').startsWith(query.join(''));

export const matchStreets = (
  index: StreetIndex,
  query: string,
  limit = 8
): StreetMatch[] => {
  const words = streetWords(query);
  if (words.join('').length < 2) return [];

  const joined = words.join('');

  return Object.entries(index)
    .map(([name, numbers]) => ({ name, numbers, words: streetWords(name) }))
    .filter((street) => matches(words, street.words))
    .sort(
      (a, b) =>
        Number(!a.words.join('').startsWith(joined)) -
          Number(!b.words.join('').startsWith(joined)) ||
        a.name.localeCompare(b.name, 'de')
    )
    .slice(0, limit)
    .map(({ name, numbers }) => ({ name, numbers }));
};

// "M1", "M 1" and "M01" are the same territory
export const territoryKey = (number: string) =>
  number
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^([A-Z]*)0*(\d)/, '$1$2');

// the territory numbers whose streets match, for the list search; two letters
// would pull in half the town
export const streetTerritories = (index: StreetIndex, query: string) =>
  new Set(
    streetWords(query).join('').length < 3
      ? []
      : matchStreets(index, query, Infinity).flatMap((street) =>
          street.numbers.map(territoryKey)
        )
  );

export const streetsOf = (index: StreetIndex, number: string) => {
  const key = territoryKey(number);

  return Object.keys(index)
    .filter((name) => index[name].some((item) => territoryKey(item) === key))
    .sort((a, b) => a.localeCompare(b, 'de'));
};
