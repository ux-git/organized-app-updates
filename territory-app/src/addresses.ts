// house positions by street and number, from OpenStreetMap by a script into
// seed/addresses.json for a private build: [[street, number, lng, lat], ...]
const rows: [string, string, number, number][] =
  Object.values(
    import.meta.glob<[string, string, number, number][]>(
      '../seed/addresses.json',
      { import: 'default', eager: true }
    )
  )[0] ?? [];

const street = (value: string) =>
  value
    .toLocaleLowerCase('de')
    .replace(/strasse|str\.|str\b/g, 'straße')
    .replace(/[^a-zäöüß]/g, '');

const number = (value: string) =>
  value.toLocaleLowerCase('de').replace(/\s+/g, '');

type Point = [number, number];

// street -> house number -> positions; one street name can be in several villages
const streets = new Map<string, Map<string, Point[]>>();
for (const [name, house, lng, lat] of rows) {
  const key = street(name);
  if (!streets.has(key)) streets.set(key, new Map());
  const houses = streets.get(key)!;
  houses.set(number(house), [...(houses.get(number(house)) ?? []), [lng, lat]]);
}

// about 4 km: a house further from its territory is a namesake elsewhere
const REACH = 0.05;

const nearest = (points: Point[] | undefined, near: Point) => {
  const away = (point: Point) =>
    Math.hypot(point[0] - near[0], point[1] - near[1]);
  const best = points?.reduce((a, b) => (away(b) < away(a) ? b : a));
  return best && away(best) < REACH ? best : undefined;
};

// a long street name typed with a letter or two off is still that street; a short
// one has to match
const close = (a: string, b: string) => {
  const allowed = b.length >= 10 ? 2 : b.length >= 6 ? 1 : 0;
  if (!allowed || Math.abs(a.length - b.length) > allowed) return false;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    row = next;
  }
  return row[b.length] <= allowed;
};

// "Heidestraße 58b", "Rheinstr.51" or "Heidestraße 36a, hinten" -> the house's
// position nearest to the territory; a range like "1-3" takes its first number
export const positionOf = (address: string | undefined, near: Point) => {
  const match = (address ?? '').match(/^([^\d]+?)\s*(\d+\s*[a-zA-Z]?)\b/);
  if (!match) return;

  const name = street(match[1]);
  const house = number(match[2]);
  const exact = nearest(streets.get(name)?.get(house), near);
  if (exact) return exact;

  const similar = [...streets]
    .filter(([key, houses]) => houses.has(house) && close(key, name))
    .flatMap(([, houses]) => houses.get(house)!);
  return nearest(similar.length ? similar : undefined, near);
};
