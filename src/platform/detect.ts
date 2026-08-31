/**
 * Platform layer.
 *
 * This is the only part of the app that is allowed to know whether it is
 * running as a PWA in a browser or inside a Tauri native shell. Feature code
 * must never import from `@tauri-apps/*` directly — it imports an adapter from
 * `@platform/adapters/*` and asks `capabilities.ts` what the current host can
 * do.
 *
 * Native modules are always loaded through dynamic `import()` so that a missing
 * or broken plugin degrades to the web behaviour instead of breaking the boot.
 */

export type PlatformName = 'web' | 'android' | 'ios' | 'desktop';

const detect = (): PlatformName => {
  if (typeof window === 'undefined') return 'web';
  if (!('__TAURI_INTERNALS__' in window)) return 'web';

  const ua = navigator.userAgent;

  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';

  // iPadOS reports itself as a Mac; inside a Tauri shell a touch-capable
  // "Mac" is an iPad.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';

  return 'desktop';
};

let cached: PlatformName | undefined;

/** The host the app is currently running on. Evaluated once per session. */
export const platform = (): PlatformName => (cached ??= detect());

/** True inside any Tauri shell (mobile or desktop), false in a browser. */
export const isNative = () => platform() !== 'web';

/** True inside a Tauri shell on a phone or tablet. */
export const isNativeMobile = () =>
  platform() === 'android' || platform() === 'ios';
