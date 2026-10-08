import { locateMap } from '@services/maps/location';
import { mapRequest } from '@services/maps/offline';
import {
  applyMapTier,
  downgradeMapTier,
  mapDetail,
  mapPerformanceOptions,
  watchMapPerformance,
} from '@services/maps/performance';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import * as maplibregl from 'maplibre-gl';
import { IconCheckCircle } from '@icons/index';
import { displaySnackNotification } from '@services/states/app';
import { tx } from '@services/i18n/translation';
import { getCSSPropertyValue, localStorageGetItem } from '@utils/common';
import { isDarkThemeState } from '@states/app';
import {
  congregationBorderColorState,
  congregationBorderDashedState,
  congregationBoundaryState,
  territoriesShowDoNotCallMapState,
  territoriesState,
  territoriesWithStatusState,
} from '@states/territories';
import { TerritoryBoundary } from '@definition/territory';
import {
  MAP_PROVIDERS,
  CONGREGATION_FILL_LAYER,
  CONGREGATION_HIT_LAYER,
  CONGREGATION_LINE_LAYER,
  CONGREGATION_SOURCE,
  DEFAULT_BOUNDARY_STYLE,
  DEFAULT_CENTER,
  DEFAULT_PROVIDER,
  DEFAULT_ZOOM,
  FILL_LAYER,
  LABEL_CAPTION_LAYER,
  LABEL_LAYER,
  LABELS_SOURCE,
  LINE_LAYER,
  MAP_COLORS,
  MapProviderKey,
  SOURCE_ID,
  styleUrl,
} from './constants';
import { ColorView, colorScheme } from './views';
import {
  addAttribution,
  addHouseIcon,
  addLabelBackground,
  LABEL_BACKGROUND,
  CAPTION_FILTER,
  CAPTION_TEXT_SIZE,
  captionPlacement,
  captionText,
  LABEL_DETAIL_ZOOM,
  LABEL_FILTER,
  LABEL_TEXT_SIZE,
  labelOpacity,
  numberText,
  resolveColor,
  resolveLightColor,
  allMarkers,
  letterFrames,
  boundaryBounds,
  boundaryCollection,
  congregationBounds,
  drawnColor,
  labelCollection,
  mapLocale,
  sanitizeBoundary,
  counterClockwise,
} from './helpers';
import {
  applyBasemapOptions,
  BasemapOptions,
  DEFAULT_BASEMAP,
  hideStylePlaces,
  LayerSwitch,
  PlaceType,
} from './basemap';
import {
  addBoundaryLayers,
  addDoNotCallLayer,
  setDoNotCallData,
  addDrawingLayers,
  FILL_OPACITY,
  setDrawingData,
} from './layers';
import { MARKER_ICON_ZOOM, MarkerRegistry, syncMarkers } from './markers';
import useFullscreen from './useFullscreen';
import useMapEditor, { EditScope } from './useMapEditor';

const ZOOM_STEP = 0.5;

// per device, like the theme: another phone may load one provider better
const PROVIDER_KEY = 'territory_map_provider';

const savedProvider = (): MapProviderKey => {
  const saved = localStorageGetItem(PROVIDER_KEY);

  return saved && saved in MAP_PROVIDERS
    ? (saved as MapProviderKey)
    : DEFAULT_PROVIDER;
};

// the padding a map keeps around the area it opens on
const FIT_PADDING = 80;

// the congregation's outline stands out from the territories' borders at
// every zoom, and runs just outside them so it hides none
const BORDER_LINE: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  9,
  4,
  13,
  6,
  16,
  9,
];
const BORDER_OFFSET: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  9,
  2,
  13,
  3,
  16,
  4.5,
];

const useTerritoriesMap = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const setTerritories = useSetAtom(territoriesState);
  const withStatus = useAtomValue(territoriesWithStatusState);
  const showDoNotCalls = useAtomValue(territoriesShowDoNotCallMapState);

  const territories = useMemo(
    () => withStatus.filter((territory) => territory.type !== 'phone'),
    [withStatus]
  );
  const [congregationBoundary, setCongregationBoundary] = useAtom(
    congregationBoundaryState
  );
  const isDark = useAtomValue(isDarkThemeState);

  const wrapper = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>(null);
  const markers = useRef<MarkerRegistry>(new Map());
  const style = useRef('');

  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [generation, setGeneration] = useState(0);
  const reloadMap = () => {
    setMapError(false);
    setReady(false);
    setGeneration((value) => value + 1);
  };
  const [styleVersion, setStyleVersion] = useState(0);
  const [colorView, setColorView] = useState<ColorView>('status');
  const [editMode, setEditMode] = useState(false);
  const [borderColor, setBorderColor] = useAtom(congregationBorderColorState);
  const [borderDashed, setBorderDashed] = useAtom(
    congregationBorderDashedState
  );
  const borderDashedRef = useRef(borderDashed);
  borderDashedRef.current = borderDashed;
  const borderColorRef = useRef(borderColor);
  borderColorRef.current = borderColor;
  const editAreaRef = useRef<VoidFunction>(undefined);

  const [heatmapPeriod, setHeatmapPeriod] = useState('last12');

  const scheme = useMemo(
    () => colorScheme(colorView, heatmapPeriod),
    [colorView, heatmapPeriod]
  );
  const [provider, setProviderState] = useState(savedProvider);

  const setProvider = useCallback((value: MapProviderKey) => {
    setProviderState(value);
    localStorage.setItem(PROVIDER_KEY, value);
  }, []);

  const [layers, setLayers] = useState<BasemapOptions>(DEFAULT_BASEMAP);
  const [showNumbers, setShowNumbers] = useState(true);
  const [showHouseholds, setShowHouseholds] = useState(false);

  const { fullscreen, toggleFullscreen } = useFullscreen(wrapper, map);

  const selectedId = searchParams.get('territory') ?? undefined;
  const selected = territories.find((item) => item.id === selectedId);

  const mapped = territories.filter((item) => item.boundary?.length).length;

  const flyToBoundary = useCallback((boundary: TerritoryBoundary) => {
    const [west, south, east, north] = boundaryBounds(boundary);

    map.current?.fitBounds([west, south, east, north], {
      padding: FIT_PADDING,
      maxZoom: 16,
    });
  }, []);

  const handleEditStart = useCallback(
    (boundary?: TerritoryBoundary) => {
      if (boundary?.length) flyToBoundary(boundary);
    },
    [flyToBoundary]
  );

  const editor = useMapEditor({ map, onStart: handleEditStart });
  // editing shows every territory in its own colours, not a status
  const shownView: ColorView =
    editMode || editor.editing ? 'original' : colorView;

  const visible = territories;

  const areaPaint = (resolve: (color: string) => string) => {
    const colors = new Map(
      scheme.buckets.map((entry) => [entry.key, resolve(entry.color)])
    );
    return {
      colorOf: (territory: (typeof territories)[number]) =>
        shownView === 'original'
          ? drawnColor(
              (territory.boundaryStyle ?? DEFAULT_BOUNDARY_STYLE).border
            ) || MAP_COLORS.blue
          : (colors.get(scheme.keyOf(territory)) ?? ''),
      fillOf:
        shownView === 'original'
          ? (territory: (typeof territories)[number]) =>
              drawnColor(
                (territory.boundaryStyle ?? DEFAULT_BOUNDARY_STYLE).fill
              )
          : undefined,
    };
  };

  const data = useMemo(() => {
    const hiddenId =
      editor.editing && editor.scope === 'territory' ? selectedId : undefined;

    const rest = territories.filter((item) => item.id !== hiddenId);

    const detail = mapDetail();
    const borderCoords = congregationBoundary?.length
      ? counterClockwise(
          detail.sanitizeGeometry
            ? sanitizeBoundary(congregationBoundary)
            : congregationBoundary
        )
      : undefined;

    const border: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features:
        borderCoords && !(editor.editing && editor.scope === 'congregation')
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [borderCoords],
                },
              },
            ]
          : [],
    };

    return {
      border,
      areas: boundaryCollection(territories, {
        ...areaPaint(resolveColor),
        detailOf: scheme.detailOf,
        selectedId,
        hiddenId,
      }),
      rest,
      selectedId,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    territories,
    congregationBoundary,
    editor.editing,
    editor.scope,
    selectedId,
    scheme,
    shownView,
    isDark,
  ]);

  const basemap = useRef({ provider, layers });
  basemap.current = { provider, layers };

  const labelOptions = useRef({ showNumbers, showHouseholds, provider });
  labelOptions.current = { showNumbers, showHouseholds, provider };

  const dataRef = useRef(data);
  dataRef.current = data;

  const setSelectedId = useCallback(
    (id?: string) => {
      setSearchParams(id ? { territory: id } : {}, { replace: true });
    },
    [setSearchParams]
  );

  // in edit mode a picked territory opens straight in the editor
  const [pendingEdit, setPendingEdit] = useState<string>();

  const pickTerritory = useCallback(
    (id?: string) => {
      setSelectedId(id);
      if (editMode && id) setPendingEdit(id);
    },
    [editMode, setSelectedId]
  );

  const pickRef = useRef(pickTerritory);
  pickRef.current = pickTerritory;

  // layers live on the style, so they are re-applied whenever the style is swapped
  const applyLayers = useCallback(() => {
    const instance = map.current;
    if (!instance || instance.getSource(SOURCE_ID)) return;

    const current = dataRef.current;

    addHouseIcon(instance, getCSSPropertyValue('--black')).catch(console.error);
    addLabelBackground(
      instance,
      getCSSPropertyValue('--white'),
      getCSSPropertyValue('--accent-200')
    );

    const detail = mapDetail();

    instance.addSource(CONGREGATION_SOURCE, {
      type: 'geojson',
      data: current.border,
      tolerance: detail.tolerance,
      buffer: detail.buffer,
      maxzoom: detail.sourceMaxZoom,
    });
    instance.addSource(SOURCE_ID, {
      type: 'geojson',
      data: current.areas,
      tolerance: detail.tolerance,
      buffer: detail.buffer,
      maxzoom: detail.sourceMaxZoom,
    });
    instance.addSource(LABELS_SOURCE, {
      type: 'geojson',
      data: labelCollection(current.areas, {
        households: labelOptions.current.showHouseholds,
      }),
    });

    instance.addLayer({
      id: CONGREGATION_FILL_LAYER,
      type: 'fill',
      source: CONGREGATION_SOURCE,
      paint: {
        'fill-color': getCSSPropertyValue('--accent-main'),
        'fill-opacity': 0.06,
      },
    });

    instance.addLayer({
      id: CONGREGATION_LINE_LAYER,
      type: 'line',
      source: CONGREGATION_SOURCE,
      layout: {
        'line-join': detail.lineJoin,
        'line-cap': detail.lineJoin === 'round' ? 'round' : 'butt',
      },
      paint: {
        'line-color': MAP_COLORS[borderColorRef.current],
        'line-width': BORDER_LINE,
        'line-offset': BORDER_OFFSET,
        // weak devices draw it solid; dashes cost them frames
        ...(detail.dashedBorder &&
          borderDashedRef.current && { 'line-dasharray': [4, 3] }),
      },
    });

    // a wide, invisible band over the outline, so it's easy to hit in edit mode
    instance.addLayer({
      id: CONGREGATION_HIT_LAYER,
      type: 'line',
      source: CONGREGATION_SOURCE,
      paint: { 'line-width': 16, 'line-opacity': 0 },
    });

    addBoundaryLayers(instance, SOURCE_ID, {
      fill: FILL_LAYER,
      line: LINE_LAYER,
    });

    addDrawingLayers(instance, current.rest, 'drawing', current.selectedId);
    addDoNotCallLayer(instance);

    // with 150+ territories the overview keeps to borders and numbers
    if (detail.drawingZoom) {
      for (const layer of instance.getStyle().layers) {
        if (layer.id.startsWith('drawing-')) {
          instance.setLayerZoomRange(layer.id, detail.drawingZoom, 24);
        }
      }
    }

    const fonts = MAP_PROVIDERS[labelOptions.current.provider].fonts;
    const caption = captionPlacement(labelOptions.current.showNumbers);

    // the caption goes first, so the number badge draws on top of it
    instance.addLayer({
      id: LABEL_CAPTION_LAYER,
      type: 'symbol',
      source: LABELS_SOURCE,
      minzoom: LABEL_DETAIL_ZOOM + detail.captionDelay,
      filter: CAPTION_FILTER,
      layout: {
        'text-field': captionText(labelOptions.current, fonts),
        'text-font': [...fonts.regular],
        'text-size': CAPTION_TEXT_SIZE,
        'text-line-height': 1.2,
        'text-anchor': caption.anchor,
        'text-offset': caption.offset,
        // its own badge would hide it; captionZoom keeps the neighbours clear
        'text-allow-overlap': true,
        'symbol-sort-key': ['get', 'labelZoom'],
      },
      paint: {
        'text-opacity': labelOpacity(1, 'captionZoom'),
        'text-color': getCSSPropertyValue('--black'),
        // a thin, softened halo keeps small text readable over any tile
        'text-halo-color': getCSSPropertyValue('--white'),
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5,
      },
    });

    instance.addLayer({
      id: LABEL_LAYER,
      type: 'symbol',
      source: LABELS_SOURCE,
      filter: LABEL_FILTER,
      layout: {
        visibility: labelOptions.current.showNumbers ? 'visible' : 'none',
        'text-field': numberText(fonts),
        'text-font': [...fonts.number],
        'text-size': LABEL_TEXT_SIZE,
        'text-line-height': 1.15,
        'text-allow-overlap': false,
        'icon-image': LABEL_BACKGROUND,
        'icon-text-fit': 'both',
        // the font keeps extra room above capitals and digits, so the box
        // gives less at the top and more at the bottom to look centred
        'icon-text-fit-padding': [-2, 4, 4, 4],
        'icon-allow-overlap': false,
        // the biggest territories claim their place first
        'symbol-sort-key': ['get', 'labelZoom'],
      },
      paint: {
        'text-color': getCSSPropertyValue('--black'),
        'text-opacity': labelOpacity(1),
        'icon-opacity': labelOpacity(0.92),
      },
    });
  }, []);

  useEffect(() => {
    if (!container.current || map.current) return;

    style.current = styleUrl(provider, isDark);

    // a map with nothing picked opens on the congregation's own area
    const area = congregationBounds(territories, congregationBoundary);

    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: style.current,
        ...(area
          ? { bounds: area, fitBoundsOptions: { padding: FIT_PADDING } }
          : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }),
        transformRequest: mapRequest,
        attributionControl: false,
        locale: mapLocale(),
        ...mapPerformanceOptions(),
      });
    } catch {
      setMapError(true);
      return;
    }
    // reloading opens the map a step lighter, so it fits the next time
    instance.on('webglcontextlost', () => {
      downgradeMapTier();
      setMapError(true);
      setReady(false);
    });
    instance.on('webglcontextrestored', () => {
      applyMapTier(instance);
      setMapError(false);
      setReady(true);
    });
    watchMapPerformance(instance);

    addAttribution(instance);

    instance.scrollZoom.setWheelZoomRate(1 / 900);
    instance.scrollZoom.setZoomRate(1 / 200);

    map.current = instance;

    // 'style.load' is the first point a custom layer is accepted, and it fires
    // again after the theme swaps the basemap
    instance.on('style.load', () => {
      applyBasemapOptions(
        instance,
        basemap.current.provider,
        basemap.current.layers
      );
      applyLayers();
      setReady(true);
      setStyleVersion((version) => version + 1);
    });

    instance.on('click', FILL_LAYER, (event: maplibregl.MapLayerMouseEvent) => {
      if (editor.active.current) return;
      // in edit mode a click on the outline takes the whole area, not the
      // territory under it
      if (
        editAreaRef.current &&
        instance.queryRenderedFeatures(event.point, {
          layers: [CONGREGATION_HIT_LAYER],
        }).length
      )
        return;

      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') pickRef.current(id);
    });

    instance.on('mouseenter', FILL_LAYER, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });

    // in edit mode the congregation's outline is something to pick, like a
    // territory: a click opens it
    instance.on('click', CONGREGATION_HIT_LAYER, () => {
      if (editor.active.current) return;
      editAreaRef.current?.();
    });
    instance.on('mouseenter', CONGREGATION_HIT_LAYER, () => {
      if (!editAreaRef.current || editor.active.current) return;
      instance.getCanvas().style.cursor = 'pointer';
    });
    instance.on('mouseleave', CONGREGATION_HIT_LAYER, () => {
      instance.getCanvas().style.cursor = '';
    });

    instance.on('mouseleave', FILL_LAYER, () => {
      instance.getCanvas().style.cursor = '';
    });

    const registry = markers.current;

    return () => {
      syncMarkers(instance, [], registry);
      instance.remove();
      map.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  useEffect(() => {
    if (!map.current || !ready) return;
    map.current.setPaintProperty(
      CONGREGATION_LINE_LAYER,
      'line-color',
      MAP_COLORS[borderColor]
    );
    map.current.setPaintProperty(
      CONGREGATION_LINE_LAYER,
      'line-dasharray',
      borderDashed && mapDetail().dashedBorder ? [4, 3] : undefined
    );
  }, [borderColor, borderDashed, ready, styleVersion]);

  useEffect(() => {
    if (!map.current || !ready) return;

    applyBasemapOptions(map.current, provider, layers);
  }, [provider, layers, ready, styleVersion]);

  // swapping the style drops every other layer, terra draw's too, so only on a real basemap change
  useEffect(() => {
    const next = styleUrl(provider, isDark);

    if (!map.current || !ready || next === style.current) return;

    style.current = next;
    map.current.setStyle(next);
  }, [isDark, provider, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const source = (id: string) =>
      instance.getSource(id) as maplibregl.GeoJSONSource | undefined;

    source(CONGREGATION_SOURCE)?.setData(data.border);
    source(SOURCE_ID)?.setData(data.areas);
    source(LABELS_SOURCE)?.setData(
      labelCollection(data.areas, { households: showHouseholds })
    );
    setDrawingData(instance, data.rest, 'drawing', data.selectedId);
    setDoNotCallData(instance, showDoNotCalls ? territories : []);
    // the territory being edited is out of data.rest; its notes come from the draft
    const drafted = editor.editing ? editor.draft.markers : [];
    instance.getContainer().dataset.editing = editor.editing ? '1' : '';
    const updateMarkers = () => {
      const bounds = instance.getBounds();
      const { markerDelay, maxMarkers } = mapDetail();
      // the edited territory's own pins and notes show at any zoom, as chips
      // rather than bare points
      const others =
        instance.getZoom() < MARKER_ICON_ZOOM + markerDelay
          ? []
          : allMarkers(data.rest);
      const items = [...others, ...drafted]
        .filter((item) => bounds.contains(item.position))
        .slice(0, maxMarkers);
      syncMarkers(
        instance,
        items,
        markers.current,
        editor.selected === undefined ? undefined : String(editor.selected),
        letterFrames(data.rest)
      );
    };
    updateMarkers();
    instance.on('moveend', updateMarkers);

    // without this the first frame can stay empty until something else moves
    instance.triggerRepaint();
    return () => {
      instance.off('moveend', updateMarkers);
    };
  }, [
    data,
    ready,
    showHouseholds,
    showDoNotCalls,
    territories,
    editor.editing,
    editor.draft.markers,
    editor.selected,
  ]);

  // while one territory is edited the rest step back, so the drawing stands out
  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleVersion) return;

    const fade = editor.editing ? 0.5 : 1;

    const set = (
      layer: string,
      property: Parameters<maplibregl.Map['setPaintProperty']>[1],
      value: Parameters<maplibregl.Map['setPaintProperty']>[2]
    ) => {
      if (instance.getLayer(layer)) {
        instance.setPaintProperty(layer, property, value);
      }
    };

    set(FILL_LAYER, 'fill-opacity', ['*', fade, FILL_OPACITY]);
    set(LINE_LAYER, 'line-opacity', fade);
    set(CONGREGATION_FILL_LAYER, 'fill-opacity', 0.06 * fade);
    set(CONGREGATION_LINE_LAYER, 'line-opacity', fade);
    set('drawing-shapes-fill', 'fill-opacity', 0.35 * fade);

    for (const layer of [
      'drawing-shapes-line',
      'drawing-shapes-line-dashed',
      'drawing-lines-solid-selected',
      'drawing-lines-dashed-selected',
    ]) {
      set(layer, 'line-opacity', fade);
    }
    set('drawing-lines-solid', 'line-opacity', labelOpacity(fade));
    set('drawing-lines-dashed', 'line-opacity', labelOpacity(fade));

    set(LABEL_LAYER, 'text-opacity', labelOpacity(fade));
    set(LABEL_LAYER, 'icon-opacity', labelOpacity(0.92 * fade));
    set(LABEL_CAPTION_LAYER, 'text-opacity', labelOpacity(fade, 'captionZoom'));
  }, [editor.editing, styleVersion]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleVersion) return;

    hideStylePlaces(instance);
  }, [styleVersion]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !styleVersion || !instance.getLayer(LABEL_LAYER)) return;

    const fonts = MAP_PROVIDERS[provider].fonts;
    const caption = captionPlacement(showNumbers);

    instance.setLayoutProperty(
      LABEL_LAYER,
      'visibility',
      showNumbers ? 'visible' : 'none'
    );
    instance.setLayoutProperty(LABEL_LAYER, 'text-field', numberText(fonts));
    instance.setLayoutProperty(LABEL_LAYER, 'text-font', [...fonts.number]);

    instance.setLayoutProperty(
      LABEL_CAPTION_LAYER,
      'text-field',
      captionText({ showHouseholds }, fonts)
    );
    instance.setLayoutProperty(LABEL_CAPTION_LAYER, 'text-font', [
      ...fonts.regular,
    ]);
    instance.setLayoutProperty(
      LABEL_CAPTION_LAYER,
      'text-anchor',
      caption.anchor
    );
    instance.setLayoutProperty(
      LABEL_CAPTION_LAYER,
      'text-offset',
      caption.offset
    );
  }, [showNumbers, showHouseholds, provider, styleVersion]);

  useEffect(() => {
    if (!ready || !selected?.boundary?.length) return;

    flyToBoundary(selected.boundary);
  }, [selectedId, ready, selected?.boundary, flyToBoundary]);

  // set when editing was opened from a territory's page, so saving goes back there
  const returnTo = useRef<string>(undefined);

  // a step that would throw away unsaved drawing waits here for a confirmation
  const [pendingLeave, setPendingLeave] = useState<VoidFunction>();

  const startEditing = useCallback(
    (scope: EditScope = 'territory') => {
      if (scope === 'territory' && !selected) return;

      editor.start(
        scope,
        selected,
        congregationBoundary,
        borderColor,
        borderDashed
      );
    },
    [editor, selected, congregationBoundary, borderColor, borderDashed]
  );

  // set while edit mode waits for a pick, so a click on the outline opens it
  editAreaRef.current =
    editMode && !editor.editing
      ? () => startEditing('congregation')
      : undefined;

  const editRequested = searchParams.get('edit') === '1';

  useEffect(() => {
    if (!ready || !editRequested || !selected || editor.editing) return;

    returnTo.current = `/territories/${selected.id}`;

    setSearchParams({ territory: selected.id }, { replace: true });
    startEditing('territory');
  }, [
    ready,
    editRequested,
    selected,
    editor.editing,
    setSearchParams,
    startEditing,
  ]);

  const goBack = useCallback(() => {
    const target = returnTo.current;
    returnTo.current = undefined;

    if (target) navigate(target);

    return !!target;
  }, [navigate]);

  const cancelEditing = useCallback(() => {
    editor.finish();
    goBack();
  }, [editor, goBack]);

  const requestLeave = useCallback(
    (action: VoidFunction) => {
      if (editor.dirty) setPendingLeave(() => action);
      else action();
    },
    [editor.dirty]
  );

  // the breadcrumb's step up: from a territory to the whole area's outline
  const editArea = useCallback(
    () =>
      requestLeave(() => {
        editor.finish();
        startEditing('congregation');
      }),
    [requestLeave, editor, startEditing]
  );

  const confirmLeave = useCallback(() => {
    pendingLeave?.();
    setPendingLeave(undefined);
  }, [pendingLeave]);

  useEffect(() => {
    if (!pendingEdit || selected?.id !== pendingEdit || editor.editing) return;

    setPendingEdit(undefined);
    startEditing('territory');
  }, [pendingEdit, selected, editor.editing, startEditing]);

  const isEditMode = editMode || editor.editing;

  const setMode = useCallback(
    (mode: 'view' | 'edit') => {
      if (mode === 'edit') {
        setEditMode(true);
        return;
      }

      const leave = () => {
        if (editor.editing) cancelEditing();
        setEditMode(false);
      };

      requestLeave(leave);
    },
    [editor.editing, cancelEditing, requestLeave]
  );

  // Abbrechen and Esc, one level at a time; the model is written up in useMapEditor
  const leaveTerritory = useCallback(
    () =>
      requestLeave(() => {
        editor.finish();
        if (!goBack()) setSelectedId(undefined);
      }),
    [editor, goBack, requestLeave, setSelectedId]
  );

  const stepBack = useCallback(() => {
    if (!editor.editing) setEditMode(false);
    else if (!editor.leaveTool()) leaveTerritory();
  }, [editor, leaveTerritory]);

  // an open dialog, or full screen, takes Esc first
  useEffect(() => {
    if (!isEditMode || pendingLeave || editor.labelling !== undefined) return;
    if (fullscreen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;

      stepBack();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditMode, pendingLeave, editor.labelling, fullscreen, stepBack]);

  const save = useCallback(() => {
    const { draft, scope } = editor;

    if (!draft.boundary?.length) return;

    if (scope === 'congregation') {
      setCongregationBoundary(draft.boundary);
      if (editor.boundaryStyle.border !== 'transparent') {
        setBorderColor(editor.boundaryStyle.border);
      }
      setBorderDashed(!!editor.boundaryStyle.dashed);

      displaySnackNotification({
        header: tx('Congregation border saved'),
        message: tx('The outer border of the congregation was updated.'),
        severity: 'success',
        icon: <IconCheckCircle color="var(--white)" />,
      });
    } else if (selected) {
      setTerritories((prev) =>
        prev.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                boundary: draft.boundary,
                boundaryStyle: draft.boundaryStyle,
                mapShapes: draft.shapes,
                mapLines: draft.lines,
                mapMarkers: draft.markers,
              }
            : item
        )
      );

      displaySnackNotification({
        header: tx('Map saved'),
        message: tx('The map of territory {{number}} was saved.', {
          number: selected.number,
        }),
        severity: 'success',
        icon: <IconCheckCircle color="var(--white)" />,
      });
    }

    editor.finish();

    if (!goBack()) setSelectedId(undefined);
  }, [
    editor,
    selected,
    setBorderColor,
    setBorderDashed,
    setTerritories,
    setCongregationBoundary,
    goBack,
    setSelectedId,
  ]);

  const locate = useCallback(() => {
    locateMap()
      .then(({ longitude, latitude }) => {
        map.current?.flyTo({ center: [longitude, latitude], zoom: 15 });
      })
      .catch(() =>
        displaySnackNotification({
          header: tx('Location unavailable'),
          message: tx('The device did not share its position.'),
          severity: 'error',
        })
      );
  }, []);

  const fitAll = useCallback(() => {
    const drawn = territories
      .filter((item) => item.boundary?.length)
      .flatMap((item) => item.boundary as TerritoryBoundary);

    const all = [...drawn, ...(congregationBoundary ?? [])];

    if (all.length > 0) flyToBoundary(all);
  }, [territories, congregationBoundary, flyToBoundary]);

  return {
    mapError,
    reloadMap,
    wrapper,
    container,
    instance: ready ? map.current : null,
    territories: visible,
    mapped,
    selected,
    selectedId,
    pickTerritory,
    mode: isEditMode ? ('edit' as const) : ('view' as const),
    setMode,
    colorView,
    setColorView,
    legend: scheme.buckets,
    // the territories in the colours shown, as they look on white paper
    printAreas: () =>
      boundaryCollection(territories, {
        ...areaPaint(resolveLightColor),
        detailOf: scheme.detailOf,
        sanitize: false,
      }),
    heatmapPeriod,
    setHeatmapPeriod,
    provider,
    setProvider,
    layers,
    setLayer: (key: LayerSwitch, value: boolean) =>
      setLayers((prev) => ({ ...prev, [key]: value })),
    togglePlaceType: (type: PlaceType) =>
      setLayers((prev) => ({
        ...prev,
        placeTypes: prev.placeTypes.includes(type)
          ? prev.placeTypes.filter((item) => item !== type)
          : [...prev.placeTypes, type],
      })),
    showNumbers,
    setShowNumbers,
    showHouseholds,
    setShowHouseholds,
    fullscreen,
    toggleFullscreen,
    zoomIn: () => map.current?.zoomTo(map.current.getZoom() + ZOOM_STEP),
    zoomOut: () => map.current?.zoomTo(map.current.getZoom() - ZOOM_STEP),
    locate,
    fitAll,
    editor,
    startEditing,
    editArea,
    leaveTerritory,
    stepBack,
    pendingLeave: !!pendingLeave,
    confirmLeave,
    keepEditing: () => setPendingLeave(undefined),
    save,
  };
};

export type TerritoriesMapState = ReturnType<typeof useTerritoriesMap>;

export default useTerritoriesMap;
