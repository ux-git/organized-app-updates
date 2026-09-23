// Talks to the app's Rust core through Tauri's IPC, without the @tauri-apps
// packages (the main app doesn't depend on them).

type Internals = {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  transformCallback: (callback: (event: unknown) => void) => number;
};

// Android's Kotlin side, for Bluetooth, NFC and the background sync.
type NearbyBridge = {
  command: (name: string, args: string) => void;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Internals;
    TerritoryNearby?: NearbyBridge;
  }
}

export const isNative = () => !!window.__TAURI_INTERNALS__;

export const invoke = <T>(cmd: string, args?: Record<string, unknown>) => {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals) return Promise.reject(new Error('not in the app'));
  return internals.invoke<T>(cmd, args);
};

export const listen = async <T>(
  event: string,
  handler: (payload: T) => void
) => {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals) return () => {};
  const id = internals.transformCallback((message) =>
    handler((message as { payload: T }).payload)
  );
  const eventId = await internals.invoke<number>('plugin:event|listen', {
    event,
    target: { kind: 'Any' },
    handler: id,
  });
  return () => {
    internals
      .invoke('plugin:event|unlisten', { event, eventId })
      .catch(() => {});
  };
};

export const nearby = (name: string, args: Record<string, unknown> = {}) => {
  window.TerritoryNearby?.command(name, JSON.stringify(args));
};

export const hasNearby = () => !!window.TerritoryNearby;
