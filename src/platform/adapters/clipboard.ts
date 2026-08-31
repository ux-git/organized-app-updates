import { isNative } from '../detect';

/**
 * Copies text to the system clipboard.
 *
 * `navigator.clipboard` is unavailable inside the Tauri webview on Android
 * because `tauri.localhost` is not a secure context, so native hosts go
 * through the clipboard plugin instead.
 */
export const writeText = async (value: string) => {
  if (isNative()) {
    const { writeText: nativeWrite } = await import(
      '@tauri-apps/plugin-clipboard-manager'
    );
    await nativeWrite(value);
    return;
  }

  await navigator.clipboard.writeText(value);
};
