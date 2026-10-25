// Keep six percent of each dimension white on every side of exported maps.
const MAP_PADDING = 0.06;

export const mapExportImage = (
  source: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
) => {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;

  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Map export canvas is unavailable');

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      source,
      canvas.width * MAP_PADDING,
      canvas.height * MAP_PADDING,
      canvas.width * (1 - MAP_PADDING * 2),
      canvas.height * (1 - MAP_PADDING * 2)
    );
    return canvas.toDataURL(type, quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};
