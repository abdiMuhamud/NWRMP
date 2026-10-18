import { CircleCheck, CircleHelp, CircleX, Archive, type LucideIcon } from 'lucide-react';
import type { FunctionalStatus, Severity, SourceType } from './types';

export const SOURCE_TYPES: SourceType[] = ['borehole', 'shallow_well', 'berkad', 'dam', 'spring'];
export const STATUSES: FunctionalStatus[] = ['functioning', 'non_functioning', 'abandoned', 'unknown'];

export type Shape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon';

/**
 * Colours follow the Ministry's existing QGIS map legend where possible
 * (blue boreholes, magenta shallow wells, yellow berkads, green dams).
 * The order is the validated adjacent order — keep it for bars and legends.
 * Shapes give a second, colour-independent channel on the map.
 */
export const TYPE_META: Record<SourceType, { label: string; plural: string; color: string; shape: Shape }> = {
  borehole: { label: 'Borehole', plural: 'Boreholes', color: '#2a78d6', shape: 'circle' },
  shallow_well: { label: 'Shallow well', plural: 'Shallow wells', color: '#e87ba4', shape: 'square' },
  berkad: { label: 'Berkad', plural: 'Berkads', color: '#eda100', shape: 'diamond' },
  dam: { label: 'Dam', plural: 'Dams', color: '#1baf7a', shape: 'triangle' },
  spring: { label: 'Spring', plural: 'Springs', color: '#eb6834', shape: 'hexagon' },
};

/** SVG path data in a 16×16 box; also used to draw map markers on canvas (Path2D). */
export const SHAPE_PATHS: Record<Shape, string> = {
  circle: 'M2 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z',
  square: 'M3 3h10v10H3Z',
  diamond: 'M8 1.2 14.8 8 8 14.8 1.2 8Z',
  triangle: 'M8 1.8 14.8 13.8H1.2Z',
  hexagon: 'M8 1.5 13.6 4.75v6.5L8 14.5 2.4 11.25v-6.5Z',
};

/** Status colours are reserved for state and always shown with an icon and a label. */
export const STATUS_META: Record<
  FunctionalStatus,
  { label: string; color: string; ink: string; wash: string; icon: LucideIcon }
> = {
  functioning: { label: 'Functioning', color: '#0ca30c', ink: '#006300', wash: '#e6f5e6', icon: CircleCheck },
  non_functioning: { label: 'Not functioning', color: '#d03b3b', ink: '#a32323', wash: '#fbeaea', icon: CircleX },
  abandoned: { label: 'Abandoned', color: '#898781', ink: '#52514e', wash: '#efeeeb', icon: Archive },
  unknown: { label: 'Status unknown', color: '#fab219', ink: '#7a5200', wash: '#fff4dc', icon: CircleHelp },
};

export const SEVERITY_META: Record<Severity, { label: string; plural: string; ink: string; wash: string; color: string }> = {
  error: { label: 'Error', plural: 'Errors', ink: '#a32323', wash: '#fbeaea', color: '#d03b3b' },
  warning: { label: 'Warning', plural: 'Warnings', ink: '#7a5200', wash: '#fff4dc', color: '#fab219' },
  info: { label: 'Note', plural: 'Notes', ink: '#164a73', wash: '#eef5fb', color: '#2a6ca6' },
};

export function typeLabel(type: string): string {
  return TYPE_META[type as SourceType]?.label ?? type;
}
