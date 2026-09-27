import { Box } from '@mui/material';
import Typography from '@components/typography';
import {
  MapStyle,
  TerritoryMapLine,
  TerritoryMapMarker,
  TerritoryMapShape,
} from '@definition/territory';
import {
  DEFAULT_BOUNDARY_STYLE,
  MAP_COLORS,
} from '@features/territories/map/constants';

type Point = [number, number];

/** The drawn fields of a territory, as a conflict hands them over. */
export type Drawing = Record<string, unknown>;

const list = <T,>(value: unknown) =>
  Array.isArray(value) ? (value as T[]) : [];

const parts = (drawing: Drawing) => ({
  boundary: list<Point>(drawing.boundary),
  style:
    (drawing.boundaryStyle as MapStyle | undefined) ?? DEFAULT_BOUNDARY_STYLE,
  shapes: list<TerritoryMapShape>(drawing.mapShapes),
  lines: list<TerritoryMapLine>(drawing.mapLines),
  markers: list<TerritoryMapMarker>(drawing.mapMarkers),
});

const SIZE = 160;
const PAD = 12;

/** One frame for both versions, so a moved border shows as moved. */
const frameOf = (drawings: Drawing[]) => {
  const all = drawings.flatMap((drawing) => {
    const { boundary, shapes, lines, markers } = parts(drawing);
    return [
      ...boundary,
      ...shapes.flatMap((shape) => shape.path),
      ...lines.flatMap((line) => line.path),
      ...markers.map((marker) => marker.position),
    ];
  });
  if (!all.length) return undefined;

  const k = Math.cos(
    (all.reduce((sum, p) => sum + p[1], 0) / all.length) * (Math.PI / 180)
  );
  const xs = all.map((p) => p[0] * k);
  const ys = all.map((p) => -p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const [width, height] = [Math.max(...xs) - minX, Math.max(...ys) - minY];
  const scale = (SIZE - 2 * PAD) / Math.max(width, height, 1e-9);
  const dx = PAD + (SIZE - 2 * PAD - width * scale) / 2;
  const dy = PAD + (SIZE - 2 * PAD - height * scale) / 2;

  return (path: Point[]) =>
    path
      .map(([lng, lat]) =>
        [dx + (lng * k - minX) * scale, dy + (-lat - minY) * scale]
          .map((n) => n.toFixed(1))
          .join(',')
      )
      .join(' ');
};

const color = (value: MapStyle['border'], fallback: string) =>
  value === 'transparent' ? fallback : MAP_COLORS[value];

/**
 * A small drawing of one version of a border, with the other version dashed
 * underneath. Static, so it works without map tiles.
 */
const BorderSketch = ({
  label,
  drawing,
  other,
}: {
  label: string;
  drawing: Drawing;
  other: Drawing;
}) => {
  const project = frameOf([drawing, other]);
  const mine = parts(drawing);
  const theirs = parts(other);
  const stroke = color(mine.style.border, MAP_COLORS.blue);
  const fill =
    mine.style.fill === 'transparent' ? 'none' : MAP_COLORS[mine.style.fill];

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        maxWidth: '200px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <Typography className="body-small-semibold" noWrap>
        {label}
      </Typography>
      <Box
        sx={{
          aspectRatio: '1',
          borderRadius: 'var(--radius-l)',
          backgroundColor: 'var(--accent-100)',
          border: '1px solid var(--accent-200)',
          overflow: 'hidden',
        }}
      >
        {project && (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width="100%"
            height="100%"
            role="img"
            aria-label={label}
          >
            {theirs.boundary.length > 2 && (
              <polygon
                points={project(theirs.boundary)}
                fill="none"
                stroke="var(--grey-300)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {mine.shapes.map((shape) => (
              <polygon
                key={shape.id}
                points={project(shape.path)}
                fill={
                  shape.fill === 'transparent' ? 'none' : MAP_COLORS[shape.fill]
                }
                fillOpacity={0.2}
                stroke={color(shape.border, 'none')}
                strokeWidth={1.5}
              />
            ))}
            {mine.boundary.length > 2 && (
              <polygon
                points={project(mine.boundary)}
                fill={fill}
                fillOpacity={0.15}
                stroke={stroke}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}
            {mine.lines.map((line) => (
              <polyline
                key={line.id}
                points={project(line.path)}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                strokeDasharray={line.style === 'dashed' ? '4 3' : undefined}
              />
            ))}
            {mine.markers.map((marker) => {
              const [x, y] = project([marker.position]).split(',').map(Number);
              return (
                <circle
                  key={marker.id}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={
                    marker.color ? MAP_COLORS[marker.color] : MAP_COLORS.red
                  }
                />
              );
            })}
          </svg>
        )}
      </Box>
    </Box>
  );
};

export default BorderSketch;
