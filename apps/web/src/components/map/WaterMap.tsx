import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { STATUS_META, TYPE_META } from '../../lib/domain';
import { formatNumber } from '../../lib/format';
import type { FunctionalStatus, SourceCollection, SourceFeatureProps, SourceType } from '../../lib/types';
import { registerSourceIcons } from './mapIcons';

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron';
// Centre of the area covered by the Ministry's national water-source map
const HOME: { center: [number, number]; zoom: number } = { center: [45.6, 9.9], zoom: 5.4 };
const EMPTY: SourceCollection = { type: 'FeatureCollection', features: [] };

export type ColorBy = 'type' | 'status';

interface WaterMapProps {
  data: SourceCollection | undefined;
  colorBy?: ColorBy;
  visibleTypes?: SourceType[];
  visibleStatuses?: FunctionalStatus[];
  /** Highlights this source and centres the map on it */
  focusId?: string;
  /** Zoom level used when focusing a single source */
  focusZoom?: number;
  className?: string;
  /** Accessible description of what the map shows */
  label: string;
  /** Allow scroll-wheel zoom (off for small embedded maps so the page scrolls) */
  scrollZoom?: boolean;
}

export function WaterMap({
  data,
  colorBy = 'type',
  visibleTypes,
  visibleStatuses,
  focusId,
  focusZoom = 9,
  className = '',
  label,
  scrollZoom = true,
}: WaterMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  // The map instance, set only once its style has loaded. Tracking the instance (not a boolean)
  // keeps effects correct when React mounts twice in development.
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: HOME.center,
      zoom: HOME.zoom,
      attributionControl: { compact: true },
      scrollZoom,
      cooperativeGestures: !scrollZoom,
    });
    let disposed = false;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('error', (e) => console.warn('Map error', e.error));

    map.on('load', () => {
      if (disposed) return;
      registerSourceIcons(map);
      map.addSource('sources', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'focus-halo',
        type: 'circle',
        source: 'sources',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 16,
          'circle-color': '#0b8034',
          'circle-opacity': 0.18,
          'circle-stroke-color': '#0b8034',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'sources',
        type: 'symbol',
        source: 'sources',
        layout: {
          'icon-image': iconExpression('type'),
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.75, 8, 1, 12, 1.35],
          // Larger sources draw on top
          'symbol-sort-key': ['coalesce', ['get', 'peopleServed'], 0],
        },
      });

      map.on('mouseenter', 'sources', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'sources', () => (map.getCanvas().style.cursor = ''));
      map.on('click', 'sources', (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as unknown as SourceFeatureProps;
        new maplibregl.Popup({ offset: 12, maxWidth: '280px' })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(popupContent(props, (path) => navigateRef.current(path)))
          .addTo(map);
      });
      setMap(map);
    });

    const failTimer = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setFailed(true);
    }, 15_000);

    return () => {
      disposed = true;
      window.clearTimeout(failTimer);
      map.remove();
      fitted.current = false;
      setMap(null);
    };
  }, [scrollZoom]);

  // Data
  useEffect(() => {
    if (!map) return;
    (map.getSource('sources') as GeoJSONSource | undefined)?.setData(data ?? EMPTY);

    if (data && data.features.length && !fitted.current && !focusId) {
      const bounds = new maplibregl.LngLatBounds();
      for (const f of data.features) bounds.extend(f.geometry.coordinates);
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
      fitted.current = true;
    }
  }, [map, data, focusId]);

  // Colour mode
  useEffect(() => {
    if (map) map.setLayoutProperty('sources', 'icon-image', iconExpression(colorBy));
  }, [map, colorBy]);

  // Filters
  useEffect(() => {
    if (!map) return;
    const clauses: FilterSpecification[] = [];
    if (visibleTypes) clauses.push(['in', ['get', 'type'], ['literal', visibleTypes]]);
    if (visibleStatuses) clauses.push(['in', ['get', 'status'], ['literal', visibleStatuses]]);
    map.setFilter('sources', clauses.length ? (['all', ...clauses] as FilterSpecification) : null);
  }, [map, visibleTypes, visibleStatuses]);

  // Focus
  useEffect(() => {
    if (!map) return;
    map.setFilter('focus-halo', ['==', ['get', 'id'], focusId ?? '']);
    const target = focusId && data?.features.find((f) => f.properties.id === focusId);
    if (target) map.jumpTo({ center: target.geometry.coordinates, zoom: focusZoom });
  }, [map, focusId, data, focusZoom]);

  return (
    <div className={`relative overflow-hidden bg-[#e9ece6] ${className}`}>
      {/* MapLibre forces position: relative on its container, so size it with h-full rather than inset-0 */}
      <div ref={container} className="h-full w-full" role="region" aria-label={label} />
      {failed && (
        <div className="absolute inset-x-4 top-4 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs text-ink-2 shadow-card">
          The basemap could not be loaded. Check the internet connection or the map style setting.
        </div>
      )}
    </div>
  );
}

function iconExpression(colorBy: ColorBy): ExpressionSpecification {
  return ['concat', 'src-', ['get', 'type'], '-', ['get', colorBy === 'type' ? 'type' : 'status']];
}

function popupContent(p: SourceFeatureProps, go: (path: string) => void): HTMLElement {
  const type = TYPE_META[p.type];
  const status = STATUS_META[p.status];
  const root = document.createElement('div');
  root.className = 'w-64 p-4 font-sans';

  const eyebrow = el('div', 'text-[11px] font-semibold uppercase tracking-wider text-ink-3', type.label);
  const title = el('div', 'mt-0.5 pr-6 text-[15px] font-semibold leading-snug text-ink', p.name);
  const code = el('div', 'font-mono text-xs text-ink-3', p.code);

  const statusRow = el('div', 'mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium');
  statusRow.style.background = status.wash;
  statusRow.style.color = status.ink;
  const dot = el('span', 'size-1.5 rounded-full');
  dot.style.background = status.color;
  statusRow.append(dot, document.createTextNode(status.label));

  const facts = el('dl', 'mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs');
  const fact = (label: string, value: string) => facts.append(el('dt', 'text-ink-3', label), el('dd', 'text-right text-ink', value));
  fact('Region', p.region);
  if (p.district) fact('District', p.district);
  fact('People using', formatNumber(p.peopleServed));

  const open = el('button', 'mt-4 w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800', 'Open record');
  open.addEventListener('click', () => go(`/sources/${p.id}`));

  root.append(eyebrow, title, code, statusRow, facts, open);
  return root;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
