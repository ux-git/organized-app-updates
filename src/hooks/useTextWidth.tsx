import { useMemo } from 'react';

const canvas =
  typeof document !== 'undefined' ? document.createElement('canvas') : null;

export const useTextWidth = ({
  texts,
  font = '16px Inter, sans-serif',
  padding = 32,
}: {
  texts: string[];
  font?: string;
  padding?: number;
}) => {
  return useMemo(() => {
    if (!texts.length || !canvas) return 0;

    const context = canvas.getContext('2d');
    if (!context) return 0;

    context.font = font;

    let maxWidth = 0;

    for (let i = 0; i < texts.length; i++) {
      const width = context.measureText(texts[i]).width;
      if (width > maxWidth) maxWidth = width;
    }

    return Math.ceil(maxWidth + padding);
  }, [texts, font, padding]);
};
