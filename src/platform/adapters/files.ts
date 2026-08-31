import { can } from '../capabilities';

/**
 * Hands a generated file to the user.
 *
 * In a browser this is a download. Inside the native shell there is no
 * download concept: the bytes are written to the app cache and handed to the
 * OS, which offers the user the apps that can open or share the file.
 */
export const saveFile = async (blob: Blob, filename: string) => {
  if (!can('file-share')) {
    const { saveAs } = await import('file-saver');
    saveAs(blob, filename);
    return;
  }

  const [{ writeFile, mkdir, BaseDirectory }, { openPath }] = await Promise.all(
    [import('@tauri-apps/plugin-fs'), import('@tauri-apps/plugin-opener')]
  );

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = `shared/${filename}`;

  await mkdir('shared', {
    baseDir: BaseDirectory.AppCache,
    recursive: true,
  });
  await writeFile(path, bytes, { baseDir: BaseDirectory.AppCache });

  const { appCacheDir } = await import('@tauri-apps/api/path');
  await openPath(`${await appCacheDir()}/${path}`);
};
