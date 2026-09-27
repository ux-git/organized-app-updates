import { atom } from 'jotai';
import type { Person } from './persistence';

// Each device's picture and publisher, by device id, from the synced
// "profiles" table
export const PROFILES = 'profiles';

export const avatarsState = atom<Record<string, string>>({});

export const linksState = atom<Record<string, string>>({});

export const peopleState = atom<Person[]>([]);

export const myIdState = atom('');

export const myAvatarState = atom((get) => get(avatarsState)[get(myIdState)]);

export type Link = { person?: Person; missing?: boolean };

export const linkOf = (
  id: string,
  links: Record<string, string>,
  people: Person[]
): Link => {
  const linked = links[id];
  if (!linked) return {};
  const person = people.find((row) => row.id === linked && !row.group);
  return person ? { person } : { missing: true };
};

export const myLinkState = atom((get) =>
  linkOf(get(myIdState), get(linksState), get(peopleState))
);

export const avatarsFrom = (rows: { id: string; avatar?: unknown }[]) =>
  Object.fromEntries(
    rows
      .filter(
        (row) =>
          typeof row.avatar === 'string' && row.avatar.startsWith('data:image/')
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

/** The square middle of a photo, `size` px wide, as a small data URL. */
export const pictureFrom = async (file: Blob, size = 128) => {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
  image.close();
  // Safari before 17 can't encode WebP and hands back a PNG instead
  const webp = canvas.toDataURL('image/webp', 0.8);
  return webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', 0.8);
};
