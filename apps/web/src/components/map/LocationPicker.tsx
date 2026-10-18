import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron';
const HOME: [number, number] = [45.6, 9.9];

interface Point {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: Point | null;
  onChange?: (p: Point) => void;
  /** Earlier position, drawn in grey (used when reviewing a move) */
  previous?: Point | null;
  readOnly?: boolean;
  className?: string;
  label: string;
}

function markerElement(color: string, ring = '#ffffff') {
  const el = document.createElement('div');
  el.style.cssText = `width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid ${ring};box-shadow:0 1px 4px rgb(0 0 0 / .35)`;
  return el;
}

/** Click the map (or drag the marker) to set a location. */
export function LocationPicker({ value, onChange, previous, readOnly, className = '', label }: LocationPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const previousMarker = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: value ? [value.lng, value.lat] : HOME,
      zoom: value ? 10 : 5.4,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      if (!disposed) setMap(m);
    });
    if (!readOnly) {
      m.getCanvas().style.cursor = 'crosshair';
      m.on('click', (e) => onChangeRef.current?.({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) }));
    }
    return () => {
      disposed = true;
      m.remove();
      setMap(null);
      marker.current = null;
      previousMarker.current = null;
    };
    // The map is created once; position updates are handled below.
  }, [readOnly]);

  useEffect(() => {
    if (!map) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ element: markerElement('#0b8034'), draggable: !readOnly }).setLngLat([value.lng, value.lat]).addTo(map);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLngLat();
        onChangeRef.current?.({ lat: round(p.lat), lng: round(p.lng) });
      });
    } else {
      marker.current.setLngLat([value.lng, value.lat]);
    }
    const bounds = new maplibregl.LngLatBounds([value.lng, value.lat], [value.lng, value.lat]);
    if (previous) bounds.extend([previous.lng, previous.lat]);
    if (!map.getBounds().contains([value.lng, value.lat]) || previous) {
      map.fitBounds(bounds, { padding: 60, maxZoom: Math.max(map.getZoom(), 10), duration: 300 });
    }
  }, [map, value, previous, readOnly]);

  useEffect(() => {
    if (!map) return;
    previousMarker.current?.remove();
    previousMarker.current = previous
      ? new maplibregl.Marker({ element: markerElement('#898781') }).setLngLat([previous.lng, previous.lat]).addTo(map)
      : null;
  }, [map, previous]);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-[#e9ece6] ${className}`}>
      <div ref={container} className="h-full w-full" role="region" aria-label={label} />
      {!readOnly && !value && (
        <div className="pointer-events-none absolute inset-x-3 top-3 rounded-md bg-surface/95 px-3 py-2 text-xs text-ink-2 shadow-card">
          Click the map to place the source, or type the coordinates.
        </div>
      )}
    </div>
  );
}

/** Six decimals is about 0.1 m, more precise than any handheld GPS. */
function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
