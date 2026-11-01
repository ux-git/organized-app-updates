// Provider and data credits are part of a map export, not the interactive controls.
export const MAP_EXPORT_ATTRIBUTION =
  '© OpenMapTiles © OpenStreetMap contributors';

export const paintMapAttribution = (
  canvas: HTMLCanvasElement,
  printedLongSide: number
) => {
  const context = canvas.getContext('2d');
  if (!context) return;

  // the smallest size still readable on paper, independent of capture resolution
  const fontSize =
    (4.5 * Math.max(canvas.width, canvas.height)) / printedLongSide;
  const inset = fontSize / 2;
  context.save();
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = 'top';
  context.textAlign = 'right';
  // no box: a thin white halo keeps the grey text readable over the map
  context.lineJoin = 'round';
  context.lineWidth = fontSize / 4;
  context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  context.fillStyle = '#6B6B6B';
  const right = canvas.width - inset * 2;
  const maxWidth = canvas.width - inset * 4;
  context.strokeText(MAP_EXPORT_ATTRIBUTION, right, inset * 2, maxWidth);
  context.fillText(MAP_EXPORT_ATTRIBUTION, right, inset * 2, maxWidth);
  context.restore();
};
