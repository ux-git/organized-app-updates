import { registerFileExporter } from '@services/files/export';
import { hasNearby, listen, nearby } from './native';

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
        .catch(reject);
    });
  });
