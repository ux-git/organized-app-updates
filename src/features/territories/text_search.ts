import type { Territory } from '@definition/territory';

// number, name, locality, holder, categories and the territory's notes
export const matchesText = (territory: Territory, query: string) =>
  [
    territory.number,
    territory.name,
    territory.city,
    territory.holder ?? '',
    territory.categories.join(' '),
    territory.notes ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(query.toLowerCase());
