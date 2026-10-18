// Definitions of the common water-source fields. The web form renders from this list and the
// API validates against it, so adding a field here adds it to both. Type-specific fields live in
// SOURCE_TYPE_DEFS (source-types.ts) and are stored in water_sources.details.

export type FieldKind = 'text' | 'textarea' | 'number' | 'integer' | 'boolean' | 'date' | 'select' | 'region';

export interface FieldDef {
  key: string;
  label: string;
  section: string;
  kind: FieldKind;
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
  /** Fixed choices for `select` */
  options?: { value: string; label: string }[];
  /** Common values offered while typing, for free-text fields */
  suggestions?: string[];
  help?: string;
}

export const SOURCE_SECTIONS = [
  { id: 'identity', label: 'Name and location' },
  { id: 'status', label: 'Status' },
  { id: 'establishment', label: 'Establishment' },
  { id: 'users', label: 'Who uses this source' },
  { id: 'technical', label: 'Technical details' },
  { id: 'supply', label: 'Supply system' },
  { id: 'power', label: 'Pump and power' },
  { id: 'quality', label: 'Water quality' },
] as const;

const f = (section: string, key: string, label: string, kind: FieldKind, extra: Partial<FieldDef> = {}): FieldDef => ({
  section,
  key,
  label,
  kind,
  ...extra,
});

export const SOURCE_FIELDS: FieldDef[] = [
  f('identity', 'name', 'Source name', 'text', { required: true }),
  f('identity', 'region_id', 'Region', 'region', { required: true }),
  f('identity', 'district', 'District', 'text'),
  f('identity', 'settlement', 'Nearest settlement', 'text'),
  f('identity', 'distance_to_settlement_km', 'Distance to settlement', 'number', { unit: 'km', min: 0, max: 500 }),
  f('identity', 'lat', 'Latitude', 'number', { required: true, min: -90, max: 90, help: 'Decimal degrees, e.g. 9.56123' }),
  f('identity', 'lng', 'Longitude', 'number', { required: true, min: -180, max: 180, help: 'Decimal degrees, e.g. 44.06512' }),
  f('identity', 'altitude_m', 'Altitude', 'number', { unit: 'm', min: -500, max: 9000 }),

  f('status', 'status', 'Functioning status', 'select', {
    required: true,
    options: [
      { value: 'functioning', label: 'Functioning' },
      { value: 'non_functioning', label: 'Not functioning' },
      { value: 'abandoned', label: 'Abandoned' },
      { value: 'unknown', label: 'Status unknown' },
    ],
  }),
  f('status', 'status_reason', 'Reason (if not functioning or abandoned)', 'text'),
  f('status', 'permanence', 'Permanence', 'select', {
    options: [
      { value: 'permanent', label: 'Permanent' },
      { value: 'seasonal', label: 'Seasonal' },
    ],
  }),
  f('status', 'is_protected', 'Source protected', 'boolean'),

  f('establishment', 'established_on', 'Date established', 'date'),
  f('establishment', 'establishing_agency', 'Establishing agency', 'text'),
  f('establishment', 'funding_agency', 'Funding agency', 'text'),
  f('establishment', 'contractor', 'Contractor', 'text'),
  f('establishment', 'wsc_established_on', 'Water committee established', 'date'),
  f('establishment', 'field_area_ha', 'Source field area', 'number', { unit: 'ha', min: 0 }),

  f('users', 'people_served', 'People using the source', 'integer', { min: 0 }),
  f('users', 'idps_served', 'Of which IDPs', 'integer', { min: 0 }),
  f('users', 'camels', 'Camels', 'integer', { min: 0 }),
  f('users', 'cattle', 'Cattle', 'integer', { min: 0 }),
  f('users', 'shoats', 'Sheep and goats', 'integer', { min: 0 }),
  f('users', 'irrigated_ha', 'Irrigated land', 'number', { unit: 'ha', min: 0 }),

  f('supply', 'reservoir_type', 'Reservoir type', 'text', {
    suggestions: ['Concrete reservoir', 'Elevated steel tank', 'Ground masonry tank', 'Plastic tank'],
  }),
  f('supply', 'reservoir_capacity_m3', 'Reservoir capacity', 'number', { unit: 'm³', min: 0 }),
  f('supply', 'pipeline_type', 'Pipeline type', 'text', { suggestions: ['PVC', 'HDPE', 'GI'] }),
  f('supply', 'pipeline_length_m', 'Pipeline length', 'number', { unit: 'm', min: 0 }),
  f('supply', 'household_connections', 'Household connections', 'integer', { min: 0 }),
  f('supply', 'kiosks', 'Water points / kiosks', 'integer', { min: 0 }),
  f('supply', 'animal_troughs', 'Animal troughs', 'integer', { min: 0 }),
  f('supply', 'sanitation_structures', 'Sanitation structures', 'integer', { min: 0 }),
  f('supply', 'used_for_trucking', 'Used for water trucking', 'boolean'),
  f('supply', 'trucks_per_day', 'Trucks per day', 'integer', { min: 0 }),
  f('supply', 'truck_capacity_m3', 'Average truck capacity', 'number', { unit: 'm³', min: 0 }),

  f('power', 'pump_type', 'Pump type', 'text', { suggestions: ['Submersible', 'Hand pump', 'Solar pump', 'Diesel pump'] }),
  f('power', 'pump_model', 'Pump model', 'text'),
  f('power', 'pump_capacity_lps', 'Pump capacity', 'number', { unit: 'l/s', min: 0 }),
  f('power', 'pump_level_m', 'Pump level', 'number', { unit: 'm', min: 0 }),
  f('power', 'power_source', 'Power source', 'text', {
    suggestions: ['Solar', 'Diesel generator', 'Grid', 'Hybrid solar-diesel', 'Manual'],
  }),
  f('power', 'generator_type', 'Generator type', 'text'),
  f('power', 'generator_kva', 'Generator capacity', 'number', { unit: 'kVA', min: 0 }),
  f('power', 'solar_type', 'Solar panel type', 'text', { suggestions: ['Monocrystalline', 'Polycrystalline'] }),
  f('power', 'solar_kw', 'Solar capacity', 'number', { unit: 'kW', min: 0 }),
  f('power', 'supply_condition', 'Supply system condition', 'text', { suggestions: ['Good', 'Fair', 'Poor', 'Needs repair'] }),
  f('power', 'supply_condition_notes', 'Condition notes', 'textarea'),

  f('quality', 'quality_issue', 'Water quality issue', 'text', {
    suggestions: ['High fluoride', 'Bacterial contamination', 'High salinity', 'Turbidity'],
  }),
  f('quality', 'color_odor', 'Colour / odour', 'text'),
  f('quality', 'temperature_c', 'Temperature', 'number', { unit: '°C', min: -10, max: 80 }),
  f('quality', 'ph', 'pH', 'number', { min: 0, max: 14 }),
];

export const FIELD_BY_KEY = new Map(SOURCE_FIELDS.map((field) => [field.key, field]));

/** Keys that are not plain water_sources columns. */
export const NON_COLUMN_KEYS = new Set(['district', 'lat', 'lng']);
