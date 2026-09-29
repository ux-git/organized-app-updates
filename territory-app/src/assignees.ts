import { atom } from 'jotai';
import { TerritoryAssignee } from '@definition/territory';
import { peopleState } from './profiles';

// Stands in for the main app's persons and field service groups: the people
// on this phone, groups first, each by name.

export const territoryAssigneesState = atom<TerritoryAssignee[]>((get) => {
  const people = get(peopleState);
  const sorted = (group: boolean) =>
    people
      .filter((person) => !!person.group === group)
      .map(({ id, name }) => ({ id, name, group }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return [...sorted(true), ...sorted(false)];
});

// the linked publisher, else this device's name; persistence sets it
export const currentPublisherState = atom('');
