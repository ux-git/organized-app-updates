import {
  registerFileExporter,
  registerFileSharer,
} from '@services/files/export';
import { hasNearby, isNative, invoke, listen, nearby } from './native';

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

if (hasNearby())
  registerFileExporter(async (blob, name) => {
    const data = await base64(blob);
    const id = crypto.randomUUID();
    return new Promise<boolean>((resolve, reject) => {
      let stop: (() => void) | undefined;
      listen<{ id: string; saved?: boolean; error?: string }>(
        'export-result',
        (result) => {
          if (result.id !== id) return;
          stop?.();
          if (result.error) reject(new Error(result.error));
          else resolve(!!result.saved);
        }
      )
        .then((unlisten) => {
          stop = unlisten;
          nearby('exportFile', { id, name, base64: data, type: blob.type });
        })
        .catch((error) => {
          stop?.();
          reject(error);
        });
    });
  });
// Windows/Linux have no Nearby bridge; webview blob downloads are not a save API.
else if (isNative()) {
  registerFileExporter(async (blob, name) => {
    await invoke<string>('export_file', { name, data: await base64(blob) });
    return true;
  });
}

// a Windows or Linux build has no share sheet and falls back to saving
if (hasNearby())
  registerFileSharer(async (blob, name) => {
    nearby('shareFile', { name, base64: await base64(blob), type: blob.type });
  });
