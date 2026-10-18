import type { Map as MapLibreMap } from 'maplibre-gl';
import { SHAPE_PATHS, SOURCE_TYPES, STATUSES, STATUS_META, TYPE_META } from '../../lib/domain';

const SIZE = 16; // CSS pixels
const RATIO = 2; // drawn at 2x for sharp markers on high-density screens

function drawMarker(path: string, color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE * RATIO;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RATIO, RATIO);
  const shape = new Path2D(path);
  ctx.lineJoin = 'round';
  // 2px surface ring keeps overlapping markers legible
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(shape);
  ctx.fillStyle = color;
  ctx.fill(shape);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Registers one marker per (type, colour) pair: `src-{type}-{type|status}`. */
export function registerSourceIcons(map: MapLibreMap) {
  for (const type of SOURCE_TYPES) {
    const path = SHAPE_PATHS[TYPE_META[type].shape];
    const variants: [string, string][] = [
      [type, TYPE_META[type].color],
      ...STATUSES.map((s): [string, string] => [s, STATUS_META[s].color]),
    ];
    for (const [key, color] of variants) {
      const id = `src-${type}-${key}`;
      if (!map.hasImage(id)) map.addImage(id, drawMarker(path, color), { pixelRatio: RATIO });
    }
  }
}
