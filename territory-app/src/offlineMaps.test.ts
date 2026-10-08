import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  protocol: vi.fn(),
  data: new Map<string, string>(),
}));
vi.mock('maplibre-gl', () => ({ addProtocol: mocks.protocol }));
vi.mock('./native', () => ({
  isNative: () => true,
  invoke: vi.fn(async (name, args) => {
    const key = `${args.scope}:${args.key}`;
    if (name === 'map_cache_get') return mocks.data.get(key) ?? null;
    if (name === 'map_cache_put') {
      mocks.data.set(key, args.data);
      return;
    }
    if (name === 'map_cache_clear')
      for (const key of mocks.data.keys())
        if (key.startsWith(args.scope + ':')) mocks.data.delete(key);
  }),
}));
vi.mock('@features/territories/map/constants', () => ({
  MAP_PROVIDERS: {
    test: {
      light: 'https://map.test/light',
      dark: 'https://map.test/dark',
      fonts: { regular: ['Regular'], bold: ['Bold'], number: ['Regular'] },
    },
  },
}));
const response = (body: unknown) => new Response(JSON.stringify(body));
const fetching = vi.fn(async (url: string) =>
  response(
    url.endsWith('/light') || url.endsWith('/dark')
      ? {
          version: 8,
          sources: {
            tiles: {
              type: 'vector',
              tiles: ['https://map.test/{z}/{x}/{y}'],
              maxzoom: 0,
            },
          },
          layers: [],
        }
      : { tile: true }
  )
);
beforeEach(() => {
  vi.resetModules();
  mocks.data.clear();
  mocks.protocol.mockClear();
  fetching.mockClear();
  vi.stubGlobal('fetch', fetching);
});
const setup = async () => {
  await import('./offlineMaps');
  const { mapDownloads, offlineMapState } =
    await import('@services/maps/offline');
  const { store } = await import('@states/index');
  return {
    downloads: mapDownloads()!,
    state: () => store.get(offlineMapState),
  };
};
test('saves both themes, serves them without network and removes the download', async () => {
  const { downloads, state } = await setup();
  await downloads.download([6, 51, 6.01, 51.01], 'test');
  expect(state().error).toBeUndefined();
  expect(state().region?.tiles).toBe(1);
  const handler = mocks.protocol.mock.calls[0][1];
  fetching.mockRejectedValueOnce(new Error('Offline'));
  const result = await handler(
    {
      url: 'territory-map://' + encodeURIComponent('https://map.test/dark'),
      type: 'json',
    },
    new AbortController()
  );
  expect(result.data.version).toBe(8);
  fetching.mockReset();
  await downloads.remove();
  expect(state().region).toBeUndefined();
  expect([...mocks.data.keys()].some((key) => key.startsWith('b:'))).toBe(
    false
  );
});
test('failed replacement keeps the complete previous download', async () => {
  fetching.mockImplementation(async (url: string) =>
    response(
      url.endsWith('/light') || url.endsWith('/dark')
        ? { version: 8, sources: {}, layers: [] }
        : {}
    )
  );
  const { downloads, state } = await setup();
  await downloads.download([6, 51, 6.01, 51.01], 'test');
  const previous = state().region;
  const metadata = mocks.data.get('meta:region');
  fetching.mockRejectedValue(new Error('Connection lost'));
  await downloads.download([7, 51, 7.01, 51.01], 'test');
  expect(state().region).toEqual(previous);
  expect(mocks.data.get('meta:region')).toBe(metadata);
  expect(state().busy).toBe(false);
  expect(state().error).toBe('Connection lost');
});
