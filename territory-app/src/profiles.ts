import { atom } from 'jotai';
import type { Person } from './persistence';
import avatarTypes from './avatar-types.json';
import {
  AVATAR_IMAGE_NAMES,
  AVATAR_ICON_NAMES,
  AvatarType,
} from '@definition/settings';

export const isProfilePicture = (value: unknown): value is AvatarType =>
  typeof value === 'string' &&
  ['default', 'initials', ...AVATAR_ICON_NAMES, ...AVATAR_IMAGE_NAMES].includes(
    value
  );

// Each device's picture and publisher, by device id, from the synced
// "profiles" table
export const PROFILES = 'profiles';

export const avatarsState = atom<Record<string, string>>({});

export const linksState = atom<Record<string, string>>({});

export const peopleState = atom<Person[]>([]);

export const myIdState = atom('');

export const myAvatarState = atom((get) => get(avatarsState)[get(myIdState)]);

/** `group`: the linked publisher was turned into a group. */
export type Link = { person?: Person; missing?: boolean; group?: boolean };

export const linkOf = (
  id: string,
  links: Record<string, string>,
  people: Person[]
): Link => {
  const linked = links[id];
  if (!linked) return {};
  const person = people.find((row) => row.id === linked);
  if (!person) return { missing: true };
  return person.group ? { missing: true, group: true } : { person };
};

/** How many devices are linked to this publisher. */
export const linkedDevices = (id: string, links: Record<string, string>) =>
  Object.values(links).filter((person) => person === id).length;

export const myLinkState = atom((get) =>
  linkOf(get(myIdState), get(linksState), get(peopleState))
);

export const avatarsFrom = (rows: { id: string; avatar?: unknown }[]) =>
  Object.fromEntries(
    rows
      .filter(
        (row) =>
          typeof row.avatar === 'string' &&
          (isProfilePicture(row.avatar) || row.avatar.startsWith('data:image/'))
      )
      .map((row) => [row.id, row.avatar as string])
  );

export const linksFrom = (rows: { id: string; person?: unknown }[]) =>
  Object.fromEntries(
    rows
      .filter((row) => typeof row.person === 'string' && row.person)
      .map((row) => [row.id, row.person as string])
  );

export const bufferOf = (dataUrl: string) => {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0)).buffer;
};

/** The optional suffix fits in a Bluetooth scan response; old names still work. */
export const nearbyProfile = (
  name: string
): { name: string; avatar?: string } => {
  const match = /~([0-9a-f]{2})$/i.exec(name);
  if (!match) return { name };
  const avatar = avatarTypes[parseInt(match[1], 16) - 1];
  return avatar ? { name: name.slice(0, -3), avatar } : { name };
};
