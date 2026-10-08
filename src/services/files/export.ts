import { saveAs } from 'file-saver';

type Exporter = (blob: Blob, name: string) => Promise<boolean>;
let nativeExporter: Exporter | undefined;
export const registerFileExporter = (exporter: Exporter) => {
  nativeExporter = exporter;
};

/** False means the user cancelled; cancellation is never reported as a failure. */
export const exportFile: Exporter = async (blob, name) => {
  if (nativeExporter) return nativeExporter(blob, name);
  const file = new File([blob], name, { type: blob.type });
  const mobile =
    /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false;
      throw error;
    }
  }
  saveAs(blob, name);
  return true;
};
