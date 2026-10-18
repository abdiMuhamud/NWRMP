export const SOURCE_TYPES = ['borehole', 'shallow_well', 'berkad', 'dam', 'spring'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const FUNCTIONAL_STATUSES = ['functioning', 'non_functioning', 'abandoned', 'unknown'] as const;
export type FunctionalStatus = (typeof FUNCTIONAL_STATUSES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'verified'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface DetailField {
  key: string;
  label: string;
  kind: 'number' | 'text';
  unit?: string;
}

interface SourceTypeDef {
  label: string;
  /** Prefix of the national code, e.g. BH-MJ-00012 */
  prefix: string;
  /** Spellings used in sheet names and the water_source_type column (compared without spaces/punctuation) */
  aliases: string[];
  /** Type-specific technical fields stored in water_sources.details */
  detailFields: DetailField[];
}

const num = (key: string, label: string, unit?: string): DetailField => ({ key, label, unit, kind: 'number' });
const text = (key: string, label: string): DetailField => ({ key, label, kind: 'text' });

const risingPipe = [text('rising_pipe_type', 'Rising pipe type'), num('rising_pipe_depth_m', 'Rising pipe depth', 'm')];

export const SOURCE_TYPE_DEFS: Record<SourceType, SourceTypeDef> = {
  borehole: {
    label: 'Borehole',
    prefix: 'BH',
    aliases: ['borehole', 'boreholes', 'bh'],
    detailFields: [
      num('depth_m', 'Borehole depth', 'm'),
      text('casing_type', 'Casing type'),
      text('casing_size', 'Casing size'),
      num('yield_m3h', 'Operating yield', 'm³/h'),
      num('operating_hours_per_day', 'Operating hours per day', 'h'),
      num('drawdown_m', 'Operating drawdown', 'm'),
      num('recovery_time_h', 'Recovery time', 'h'),
      num('dug_well_depth_m', 'Dug well depth', 'm'),
      num('dug_well_yield_m3h', 'Dug well yield', 'm³/h'),
      num('dug_well_operating_hours', 'Dug well operating hours', 'h'),
      num('dug_well_drawdown_m', 'Dug well drawdown', 'm'),
      num('dug_well_recovery_time_h', 'Dug well recovery time', 'h'),
      num('other_source_yield_m3h', 'Other source yield', 'm³/h'),
      ...risingPipe,
    ],
  },
  shallow_well: {
    label: 'Shallow well',
    prefix: 'SW',
    aliases: ['shallowwell', 'shallowwells', 'sw'],
    detailFields: [
      num('depth_m', 'Well depth', 'm'),
      num('yield_m3h', 'Operating yield', 'm³/h'),
      num('operating_hours_per_day', 'Operating hours per day', 'h'),
      num('drawdown_m', 'Operating drawdown', 'm'),
      num('recovery_time_h', 'Recovery time', 'h'),
      ...risingPipe,
    ],
  },
  berkad: {
    label: 'Berkad',
    prefix: 'BK',
    aliases: ['berkad', 'berkads', 'barkad', 'barkads', 'barkeds', 'berked', 'berkeds', 'berket', 'berkets', 'birkad'],
    detailFields: [
      num('width_m', 'Width', 'm'),
      num('length_m', 'Length', 'm'),
      num('depth_m', 'Depth', 'm'),
      num('catchment_area_ha', 'Catchment area', 'ha'),
    ],
  },
  dam: {
    label: 'Dam',
    prefix: 'DM',
    aliases: ['dam', 'dams'],
    detailFields: [
      num('width_m', 'Width', 'm'),
      num('length_m', 'Length', 'm'),
      num('depth_m', 'Depth', 'm'),
      text('slope', 'Slope (h:v)'),
      num('catchment_area_ha', 'Catchment area', 'ha'),
    ],
  },
  spring: {
    label: 'Spring',
    prefix: 'SP',
    aliases: ['spring', 'springs', 'springprotection', 'protectedspring'],
    detailFields: [
      num('depth_m', 'Depth', 'm'),
      num('yield_lps', 'Operating yield', 'l/s'),
      num('operating_hours_per_day', 'Operating hours per day', 'h'),
      num('drawdown_m', 'Operating drawdown', 'm'),
      text('recovery_time', 'Recovery time'),
      num('width_m', 'Width', 'm'),
      num('length_m', 'Length', 'm'),
      ...risingPipe,
    ],
  },
};

const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function resolveSourceType(value: string | null | undefined): SourceType | null {
  if (!value) return null;
  const key = compact(value);
  for (const type of SOURCE_TYPES) {
    if (SOURCE_TYPE_DEFS[type].aliases.includes(key)) return type;
  }
  return null;
}
