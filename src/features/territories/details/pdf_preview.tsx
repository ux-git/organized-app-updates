import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url';
import { tx } from '@services/i18n/translation';
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Typography } from '@components/index';

// embedded browsers and Android WebViews show a PDF in an iframe as a blank
// box, so the pages are drawn onto canvases instead
const PdfPreview = ({
  url,
  onSettled,
}: {
  url?: string;
  onSettled?: (url: string) => void;
}) => {
  const pages = useRef<HTMLDivElement>(null);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = pages.current;
    if (!url || !host) return;

    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    setFailed(false);

    const render = async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

      if (cancelled) return;
      loading = pdfjs.getDocument({ url });
      const document = await loading.promise;
      const canvases: HTMLCanvasElement[] = [];

      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const width = page.getViewport({ scale: 1 }).width;

        const viewport = page.getViewport({
          scale:
            (host.clientWidth / width) *
            Math.min(window.devicePixelRatio || 1, 1.5),
        });

        const canvas = window.document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // each page sits in its own frame, like the sheet it prints on
        canvas.style.width = '100%';
        canvas.style.display = 'block';
        canvas.style.boxSizing = 'border-box';
        canvas.style.backgroundColor = '#FFFFFF';
        canvas.style.border = '1px solid var(--accent-200)';
        canvas.style.borderRadius = 'var(--radius-l)';

        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;

        canvases.push(canvas);
      }

      host.replaceChildren(...canvases);
      setFailed(false);
      onSettled?.(url);
    };

    render().catch((error) => {
      if (!cancelled) {
        console.error('Territory PDF preview failed', error);
        setFailed(true);
        onSettled?.(url);
      }
    });

    return () => {
      cancelled = true;
      void loading?.destroy();
      host.replaceChildren();
    };
  }, [url, onSettled]);

  return (
    <Box sx={{ minHeight: 0, overflowY: 'auto' }}>
      {failed && (
        <Typography
          className="body-small-regular"
          color="var(--grey-400)"
          sx={{ padding: '16px', textAlign: 'center' }}
        >
          {tx('The preview could not be shown. Save the PDF to check it.')}
        </Typography>
      )}

      <Box
        ref={pages}
        sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      />
    </Box>
  );
};

export default PdfPreview;
