/**
 * Helpers for native (Tauri) integrations. All functions are safe no-ops when
 * the app runs as a regular PWA in the browser.
 */

export const isTauriNative = () => '__TAURI_INTERNALS__' in window;

/**
 * Triggers a light haptic impact on supported devices (Tauri mobile only).
 * Falls back to the WebView vibration API when the haptics plugin is
 * unavailable or fails.
 */
export const hapticFeedback = async () => {
  if (!isTauriNative()) return;

  try {
    const { impactFeedback } = await import('@tauri-apps/plugin-haptics');
    await impactFeedback('light');
  } catch {
    // haptics plugin unavailable — fall back to a short vibration
    try {
      navigator.vibrate?.(10);
    } catch {
      // vibration unsupported — ignore
    }
  }
};
