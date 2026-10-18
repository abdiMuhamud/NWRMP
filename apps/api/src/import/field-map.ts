// Maps spreadsheet column headers to database fields.
//
// Headers are compared after normalising (lower case, punctuation and spaces -> "_"),
// so "Latitude ", "latitude" and "LATITUDE" are the same column.

export type Special =
  | 'legacy_id'
  | 'type'
  | 'region'
  | 'district'
  | 'lat'
  | 'lng'
  | 'functioning'
  | 'abandoned'
  | 'non_functioning_reason'
  | 'abandoned_reason'
  | 'permanent'
  | 'seasonal'
  | 'inspection_date'
  | 'inspection_agency'
  | 'intervention_date'
  | 'intervention_agency'
  | 'intervention_description';

export type Kind = 'text' | 'number' | 'integer' | 'boolean' | 'date';

export type Target =
  | { special: Special; note?: string }
  | { column: string; kind: Kind; units?: string[]; note?: string }
  | { detail: string; kind: 'text' | 'number'; units?: string[]; note?: string };

export function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const U = {
  km: ['km'],
  m: ['m', 'meter', 'meters', 'metre', 'metres'],
  m3: ['m3', 'm³', 'cubicmeter', 'cubicmeters'],
  m3h: ['m3/hr', 'm3/h', 'm³/h', 'm³/hr', 'm3/hour'],
  lps: ['l/s', 'lps', 'litres/s', 'liters/s'],
  hours: ['h', 'hr', 'hrs', 'hour', 'hours'],
  celsius: ['c', '°c', 'degc'],
  kva: ['kva'],
  kw: ['kw'],
  ha: ['ha', 'hectare', 'hectares'],
};

const col = (column: string, kind: Kind, units?: string[], note?: string): Target => ({ column, kind, units, note });
const det = (detail: string, kind: 'text' | 'number', units?: string[], note?: string): Target => ({ detail, kind, units, note });
const sp = (special: Special, note?: string): Target => ({ special, note });

const spelling = (from: string, to: string) => `Column "${from}" read as "${to}" (spelling corrected)`;

export const FIELD_MAP: Record<string, Target> = {
  // Identity and location
  source_id: sp('legacy_id'),
  water_source_type: sp('type'),
  source_type: sp('type'),
  source_name: col('name', 'text'),
  region: sp('region'),
  district: sp('district'),
  nearest_settlement_name: col('settlement', 'text'),
  settlement_name: col('settlement', 'text'),
  distance_to_settlement: col('distance_to_settlement_km', 'number', U.km),
  latitude: sp('lat'),
  longitude: sp('lng'),
  altitude: col('altitude_m', 'number', U.m),
  attitude: col('altitude_m', 'number', U.m, 'Column "Attitude" read as altitude in metres'),

  // Establishment
  funding_agency: col('funding_agency', 'text'),
  date_source_established: col('established_on', 'date'),
  establishment_date: col('established_on', 'date'),
  establishing_agency: col('establishing_agency', 'text'),
  '1121': col('contractor', 'text', undefined, 'Column "1121" read as the drilling contractor'),
  drilling_contractor: col('contractor', 'text'),
  digging_contractor: col('contractor', 'text'),
  constructed_contractor: col('contractor', 'text'),

  // Status
  permanent: sp('permanent'),
  seasonal: sp('seasonal'),
  sesonal: sp('seasonal', spelling('sesonal', 'seasonal')),
  functioning: sp('functioning'),
  reason_for_non_functioning: sp('non_functioning_reason'),
  reason_for_nonfunctioning: sp('non_functioning_reason'),
  abandoned: sp('abandoned'),
  reason_for_abandoned: sp('abandoned_reason'),
  source_protected: col('is_protected', 'boolean'),

  // Users
  number_of_human_using_source: col('people_served', 'integer'),
  idps_using: col('idps_served', 'integer'),
  number_of_camel_using_source: col('camels', 'integer'),
  number_of_cattle_using_source: col('cattle', 'integer'),
  number_of_shoats_using_source: col('shoats', 'integer'),
  number_of_hectares_irrigated_using_source: col('irrigated_ha', 'number', U.ha),

  // Supply system
  reservoir_type: col('reservoir_type', 'text'),
  tank_type: col('reservoir_type', 'text'),
  reservoir_capacity: col('reservoir_capacity_m3', 'number', U.m3),
  tank_capacity: col('reservoir_capacity_m3', 'number', U.m3),
  pipeline_type: col('pipeline_type', 'text'),
  pipeline_length: col('pipeline_length_m', 'number', U.m),
  rising_pipe_type: det('rising_pipe_type', 'text'),
  rising_pipe_depth: det('rising_pipe_depth_m', 'number', U.m),
  number_of_hh_connections: col('household_connections', 'integer'),
  number_of_water_points_kiosks: col('kiosks', 'integer'),
  number_of_animal_troughs: col('animal_troughs', 'integer'),
  number_of_sanitation_structures: col('sanitation_structures', 'integer'),
  source_used_for_water_trucking: col('used_for_trucking', 'boolean'),
  number_of_trucks_per_day: col('trucks_per_day', 'integer'),
  average_truck_capacity: col('truck_capacity_m3', 'number', U.m3),

  // Pump and power
  pump_type: col('pump_type', 'text'),
  pump_model: col('pump_model', 'text'),
  pump_capacity: col('pump_capacity_lps', 'number', U.lps),
  pump_level: col('pump_level_m', 'number', U.m),
  source_of_power: col('power_source', 'text'),
  generator_type: col('generator_type', 'text'),
  generator_capacity: col('generator_kva', 'number', U.kva),
  solar_type: col('solar_type', 'text'),
  solar_capacity: col('solar_kw', 'number', U.kw),
  supply_system_condition: col('supply_condition', 'text'),
  supply_system_condition_description: col('supply_condition_notes', 'text'),

  // Water quality
  physical_water_quality_issues: col('quality_issue', 'text'),
  color_odor_description: col('color_odor', 'text'),
  color_odor_smell_description: col('color_odor', 'text'),
  temperature: col('temperature_c', 'number', U.celsius),
  ph: col('ph', 'number'),

  // Management and history
  wsc_date_of_establishment: col('wsc_established_on', 'date'),
  inspecting_agency: sp('inspection_agency'),
  inspection_date: sp('inspection_date'),
  last_intervention_agency: sp('intervention_agency'),
  last_intervention_description: sp('intervention_description'),
  last_intervention_date: sp('intervention_date'),
  source_field_area: col('field_area_ha', 'number', U.ha),
  dam_catchment_area: det('catchment_area_ha', 'number', U.ha),
  catchment_area: det('catchment_area_ha', 'number', U.ha),

  // Borehole
  bh_depth: det('depth_m', 'number', U.m),
  casing_type: det('casing_type', 'text'),
  casing_size: det('casing_size', 'text'),
  bh_operating_yield: det('yield_m3h', 'number', U.m3h),
  bh_operating_hrs_per_day: det('operating_hours_per_day', 'number', U.hours),
  bh_operating_draw_down: det('drawdown_m', 'number', U.m),
  bh_recovery_time: det('recovery_time_h', 'number', U.hours),
  dw_depth: det('dug_well_depth_m', 'number', U.m),
  dw_yield: det('dug_well_yield_m3h', 'number', U.m3h),
  dw_operating_hours: det('dug_well_operating_hours', 'number', U.hours),
  dw_draw_down: det('dug_well_drawdown_m', 'number', U.m),
  recovery_time: det('dug_well_recovery_time_h', 'number', U.hours),
  other_source_yield: det('other_source_yield_m3h', 'number', U.m3h),

  // Shallow well
  sw_depth: det('depth_m', 'number', U.m),
  sw_operating_yield: det('yield_m3h', 'number', U.m3h),
  sw_operating_hrs_per_day: det('operating_hours_per_day', 'number', U.hours),
  sw_operating_draw_down: det('drawdown_m', 'number', U.m),
  sw_recovery_time: det('recovery_time_h', 'number', U.hours),

  // Spring
  sp_depth: det('depth_m', 'number', U.m),
  sp_operating_yield: det('yield_lps', 'number', U.lps),
  sp_operating_hrs_per_day: det('operating_hours_per_day', 'number', U.hours),
  sp_operating_draw_down: det('drawdown_m', 'number', U.m),
  sp_recovery_time: det('recovery_time', 'text'),
  sp_width: det('width_m', 'number', U.m),
  sp_lenght: det('length_m', 'number', U.m, spelling('Sp_Lenght', 'Sp_Length')),

  // Dam
  dam_wedth: det('width_m', 'number', U.m, spelling('Dam_wedth', 'Dam_width')),
  dam_lenght: det('length_m', 'number', U.m, spelling('Dam_Lenght', 'Dam_length')),
  dam_depth: det('depth_m', 'number', U.m),
  slope_h_v: det('slope', 'text'),

  // Berkad
  bar_wedth: det('width_m', 'number', U.m, spelling('Bar_wedth', 'Berkad width')),
  bar_lenght: det('length_m', 'number', U.m, spelling('Bar_Lenght', 'Berkad length')),
  bar_depth: det('depth_m', 'number', U.m),
};
