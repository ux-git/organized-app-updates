import { addProtocol } from 'maplibre-gl';
import { store } from '@states/index';
import {
  configureMapDownloads,
  OfflineRegion,
  offlineMapState,
} from '@services/maps/offline';
import {
  MAP_PROVIDERS,
  MapProviderKey,
} from '@features/territories/map/constants';
import { invoke, isNative } from './native';
import { tileUrls, MAX_MAP_TILES } from '@services/maps/tiles';

type Scope = 'meta' | 'a' | 'b';
const urlKey = (key: string) =>
  `https://offline.territories.invalid/${encodeURIComponent(key)}`;
const bytes64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const read = async (
  scope: Scope,
  key: string
): Promise<ArrayBuffer | undefined> => {
  if (isNative()) {
    const data = await invoke<string | null>('map_cache_get', { scope, key });
    return data === null
      ? undefined
      : Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer;
  }
  return (
    await (await caches.open(`territory-map-${scope}`)).match(urlKey(key))
  )?.arrayBuffer();
};
const write = async (scope: Scope, key: string, data: ArrayBuffer) => {
  if (isNative())
    await invoke('map_cache_put', {
      scope,
      key,
      data: bytes64(new Uint8Array(data)),
    });
  else
    await (
      await caches.open(`territory-map-${scope}`)
    ).put(urlKey(key), new Response(data));
};
const clear = async (scope: Scope) => {
  if (isNative()) await invoke('map_cache_clear', { scope });
  else await caches.delete(`territory-map-${scope}`);
};
const encode = (data: unknown) =>
  new TextEncoder().encode(JSON.stringify(data)).buffer;
const decode = (data: ArrayBuffer) =>
  JSON.parse(new TextDecoder().decode(data));
let active: Scope = 'a';
let abort: AbortController | undefined;
let updating = false;
const initialise = async () => {
  try {
    const saved = await read('meta', 'region');
    if (saved) {
      const state = decode(saved) as { active: Scope; region?: OfflineRegion };
      active = state.active;
      store.set(offlineMapState, (value) => ({
        ...value,
        region: state.region,
      }));
    }
  } catch {
    store.set(offlineMapState, (value) => ({
      ...value,
      error: 'Offline map storage is unavailable.',
    }));
  }
};
const ready = initialise();
const fetchBytes = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      'The map download failed. Check the connection and try again.'
    );
  return response.arrayBuffer();
};
addProtocol('territory-map', async (request, controller) => {
  await ready;
  const url = decodeURIComponent(request.url.slice('territory-map://'.length));
  const data =
    (await read(active, url).catch(() => undefined)) ??
    (await fetchBytes(url, controller.signal));
  return { data: request.type === 'json' ? decode(data) : data };
});

const download = async (bounds: OfflineRegion['bounds'], provider: string) => {
  if (updating) return;
  updating = true;
  await ready;
  const next: Scope = active === 'a' ? 'b' : 'a';
  abort = new AbortController();
  const signal = abort.signal;
  store.set(offlineMapState, (value) => ({
    ...value,
    busy: true,
    done: 0,
    total: 0,
    error: undefined,
  }));
  try {
    const styles = MAP_PROVIDERS[provider as MapProviderKey];
    if (!styles) throw new Error('Unknown map provider.');
    await clear(next);
    const resources = new Map<string, ArrayBuffer>();
    const get = async (url: string) => {
      const data = resources.get(url) ?? (await fetchBytes(url, signal));
      resources.set(url, data);
      return decode(data);
    };
    const tiles = new Set<string>();
    const assets = new Set<string>();
    for (const styleUrl of [styles.light, styles.dark]) {
      const style = await get(styleUrl);
      for (const source of Object.values(style.sources) as {
        url?: string;
        tiles?: string[];
        minzoom?: number;
        maxzoom?: number;
        scheme?: string;
      }[]) {
        const sourceUrl = source.url
          ? new URL(source.url, styleUrl).href
          : styleUrl;
        if (source.url) source.url = sourceUrl;
        const metadata = source.url ? await get(sourceUrl) : source;
        if (metadata.tiles)
          metadata.tiles = metadata.tiles.map((url: string) =>
            new URL(url, sourceUrl).href
              .replaceAll('%7B', '{')
              .replaceAll('%7D', '}')
          );
        if (source.url) resources.set(sourceUrl, encode(metadata));
        for (const template of metadata.tiles ?? []) {
          for (const url of tileUrls(
            new URL(template, sourceUrl).href,
            bounds,
            metadata.minzoom ?? 0,
            metadata.maxzoom ?? 14,
            metadata.scheme
          ))
            tiles.add(url);
        }
      }
      if (style.glyphs)
        style.glyphs = new URL(style.glyphs, styleUrl).href
          .replaceAll('%7B', '{')
          .replaceAll('%7D', '}');
      if (typeof style.sprite === 'string')
        style.sprite = new URL(style.sprite, styleUrl).href;
      else if (Array.isArray(style.sprite))
        style.sprite = style.sprite.map((item: { url: string }) => ({
          ...item,
          url: new URL(item.url, styleUrl).href,
        }));
      resources.set(styleUrl, encode(style));
      const sprites =
        typeof style.sprite === 'string'
          ? [style.sprite]
          : (style.sprite ?? []).map((item: { url: string }) => item.url);
      for (const sprite of sprites)
        for (const suffix of ['.json', '.png', '@2x.json', '@2x.png'])
          assets.add(new URL(sprite + suffix, styleUrl).href);
      const fonts = new Set<string>();
      for (const layer of style.layers) {
        const font = layer.layout?.['text-font'];
        if (
          Array.isArray(font) &&
          font.every((part: unknown) => typeof part === 'string') &&
          !['match', 'case', 'get', 'literal'].includes(font[0])
        )
          fonts.add(font.join(','));
      }
      for (const font of [
        styles.fonts.regular.join(','),
        styles.fonts.bold.join(','),
        styles.fonts.number.join(','),
      ])
        fonts.add(font);
      if (style.glyphs)
        for (const font of fonts)
          for (const start of [0, 256, 512, 768, 8192])
            assets.add(
              style.glyphs
                .replace('{fontstack}', encodeURIComponent(font))
                .replace('{range}', `${start}-${start + 255}`)
            );
    }
    if (tiles.size > MAX_MAP_TILES)
      throw new Error(
        'This area is too large. Use a smaller congregation boundary.'
      );
    const urls = [...new Set([...resources.keys(), ...assets, ...tiles])];
    let bytes = 0;
    let done = 0;
    let cursor = 0;
    store.set(offlineMapState, (value) => ({ ...value, total: urls.length }));
    const worker = async () => {
      while (cursor < urls.length) {
        signal.throwIfAborted();
        const url = urls[cursor++];
        const data = resources.get(url) ?? (await fetchBytes(url, signal));
        bytes += data.byteLength;
        if (bytes > 300 * 1024 * 1024)
          throw new Error('The map exceeds the 300 MB download limit.');
        await write(next, url, data);
        done++;
        store.set(offlineMapState, (value) => ({ ...value, done }));
      }
    };
    let firstError: unknown;
    const workers = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        worker().catch((error) => {
          firstError ??= error;
          abort?.abort();
          throw error;
        })
      )
    );
    const failure = workers.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw firstError ?? failure.reason;
    signal.throwIfAborted();
    const region: OfflineRegion = {
      bounds,
      provider,
      tiles: tiles.size,
      bytes,
      date: new Date().toISOString(),
    };
    await write('meta', 'region', encode({ active: next, region }));
    const previous = active;
    active = next;
    store.set(offlineMapState, (value) => ({ ...value, region, busy: false }));
    await clear(previous).catch(() => {});
  } catch (error) {
    await clear(next).catch(() => {});
    store.set(offlineMapState, (value) => ({
      ...value,
      busy: false,
      error:
        (error as Error).name === 'AbortError'
          ? undefined
          : (error as Error).message,
    }));
  } finally {
    abort = undefined;
    updating = false;
  }
};
configureMapDownloads({
  download,
  cancel: () => abort?.abort(),
  remove: async () => {
    if (updating) return;
    await ready;
    await write('meta', 'region', encode({ active }));
    store.set(offlineMapState, (value) => ({ ...value, region: undefined }));
    await clear(active);
  },
});
