// Cross-field checks shared by the spreadsheet importer and the approval workflow.

export interface Inconsistency {
  field: string;
  message: string;
}

export function findInconsistencies(v: Record<string, unknown>): Inconsistency[] {
  const num = (key: string) => (typeof v[key] === 'number' ? (v[key] as number) : null);
  const out: Inconsistency[] = [];

  if (!v.generator_type && (num('generator_kva') ?? 0) > 0) {
    out.push({ field: 'generator_kva', message: 'Generator capacity recorded but generator type is "None"' });
  }
  if (!v.solar_type && (num('solar_kw') ?? 0) > 0) {
    out.push({ field: 'solar_kw', message: 'Solar capacity recorded but solar type is "None"' });
  }
  if (v.used_for_trucking === false && (num('trucks_per_day') ?? 0) > 0) {
    out.push({ field: 'trucks_per_day', message: 'Not used for water trucking, but trucks per day is recorded' });
  }
  const people = num('people_served');
  const idps = num('idps_served');
  if (people !== null && idps !== null && idps > people) {
    out.push({ field: 'idps_served', message: 'IDPs using the source exceed the total number of people' });
  }
  if (v.status === 'functioning' && v.status_reason) {
    out.push({ field: 'status_reason', message: 'Marked functioning but a reason for not functioning is given' });
  }
  return out;
}
