import type { Person } from './persistence';
import type { Territory } from '@definition/territory';

export type PublisherSort = 'first' | 'last';

// Names are stored as one field; the last word is the surname sorting key.
// A comma explicitly separates a surname entered as "Surname, First name".
export const publisherNameParts = (name: string) => {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  const comma = cleaned.indexOf(',');
  if (comma >= 0)
    return {
      first: cleaned.slice(comma + 1).trim(),
      last: cleaned.slice(0, comma).trim(),
    };
  const words = cleaned.split(' ');
  return {
    first: words.slice(0, -1).join(' ') || cleaned,
    last: words.at(-1) ?? cleaned,
  };
};

export const sortPublishers = (
  people: Person[],
  sort: PublisherSort,
  language: string
) => {
  const compare = new Intl.Collator(language, {
    numeric: true,
    sensitivity: 'base',
  }).compare;
  return [...people].sort((a, b) => {
    if (a.group || b.group) return compare(a.name, b.name);
    const left = publisherNameParts(a.name),
      right = publisherNameParts(b.name);
    return (
      compare(left[sort], right[sort]) ||
      compare(a.name, b.name) ||
      compare(a.id, b.id)
    );
  });
};

export const currentPublisherTerritories = (
  territories: Territory[],
  name: string
) =>
  territories.filter((territory) =>
    territory.assignments.some(
      (assignment) =>
        (assignment.publisher === name || assignment.group === name) &&
        !assignment.returnedOn
    )
  );
