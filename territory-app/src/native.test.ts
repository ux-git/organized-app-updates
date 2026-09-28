import { afterAll, expect, test, vi } from 'vitest';

const internals = {
  invoke: vi.fn(async () => 7),
  transformCallback: vi.fn(() => 42),
  unregisterCallback: vi.fn(),
};
vi.stubGlobal('window', { __TAURI_INTERNALS__: internals });
afterAll(() => vi.unstubAllGlobals());

const { listen } = await import('./native');

test('stopping a listener also drops its callback', async () => {
  const stop = await listen('store-changed', () => {});
  stop();
  expect(internals.unregisterCallback).toHaveBeenCalledWith(42);
  expect(internals.invoke).toHaveBeenLastCalledWith('plugin:event|unlisten', {
    event: 'store-changed',
    eventId: 7,
  });
});
