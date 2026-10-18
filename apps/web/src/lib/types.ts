export type SourceType = 'borehole' | 'shallow_well' | 'berkad' | 'dam' | 'spring';
export type FunctionalStatus = 'functioning' | 'non_functioning' | 'abandoned' | 'unknown';
export type Verification = 'unverified' | 'verified';
export type Severity = 'error' | 'warning' | 'info';

export interface SourceListItem {
  id: string;
  code: string;
  name: string;
  type: SourceType;
  status: FunctionalStatus;
  verification: Verification;
  settlement: string | null;
  peopleServed: number | null;
  regionId: number;
  region: string;
  district: string | null;
  lat: number;
  lng: number;
  lastInspectedOn: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SourceFeatureProps {
  id: string;
  code: string;
  name: string;
  type: SourceType;
  status: FunctionalStatus;
  verification: Verification;
  region: string;
  district: string | null;
  peopleServed: number | null;
}

export interface SourceFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SourceFeatureProps;
}

export interface SourceCollection {
  type: 'FeatureCollection';
  features: SourceFeature[];
}

export interface Inspection {
  id: string;
  inspectedOn: string;
  agency: string | null;
  status: FunctionalStatus | null;
  notes: string | null;
}

export interface Intervention {
  id: string;
  performedOn: string | null;
  agency: string | null;
  description: string | null;
}

export interface RecordIssue {
  id: number;
  severity: Severity;
  field: string | null;
  message: string;
  originalValue: string | null;
  sheet: string | null;
  rowNumber: number | null;
}

export interface SourceDetail {
  id: string;
  code: string;
  type: SourceType;
  name: string;
  status: FunctionalStatus;
  statusReason: string | null;
  verification: Verification;
  region: string;
  regionCode: string;
  district: string | null;
  settlement: string | null;
  lat: number;
  lng: number;
  distanceToSettlementKm: number | null;
  altitudeM: number | null;
  permanence: 'permanent' | 'seasonal' | null;
  isProtected: boolean | null;
  establishedOn: string | null;
  establishingAgency: string | null;
  fundingAgency: string | null;
  contractor: string | null;
  peopleServed: number | null;
  idpsServed: number | null;
  camels: number | null;
  cattle: number | null;
  shoats: number | null;
  irrigatedHa: number | null;
  reservoirType: string | null;
  reservoirCapacityM3: number | null;
  pipelineType: string | null;
  pipelineLengthM: number | null;
  householdConnections: number | null;
  kiosks: number | null;
  animalTroughs: number | null;
  sanitationStructures: number | null;
  usedForTrucking: boolean | null;
  trucksPerDay: number | null;
  truckCapacityM3: number | null;
  pumpType: string | null;
  pumpModel: string | null;
  pumpCapacityLps: number | null;
  pumpLevelM: number | null;
  powerSource: string | null;
  generatorType: string | null;
  generatorKva: number | null;
  solarType: string | null;
  solarKw: number | null;
  supplyCondition: string | null;
  supplyConditionNotes: string | null;
  qualityIssue: string | null;
  colorOdor: string | null;
  temperatureC: number | null;
  ph: number | null;
  wscEstablishedOn: string | null;
  fieldAreaHa: number | null;
  details: Record<string, string | number | null>;
  dataSource: string | null;
  legacyRef: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
  inspections: Inspection[];
  interventions: Intervention[];
  issues: RecordIssue[];
}

export interface NearbySource {
  id: string;
  code: string;
  name: string;
  type: SourceType;
  status: FunctionalStatus;
  distanceKm: number;
}

export interface DetailField {
  key: string;
  label: string;
  kind: 'number' | 'text';
  unit?: string;
}

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
  options?: { value: string; label: string }[];
  suggestions?: string[];
  help?: string;
}

export interface Reference {
  regions: { id: number; code: string; name: string; districts: { id: number; name: string }[] }[];
  sourceTypes: { code: SourceType; label: string; prefix: string; detailFields: DetailField[] }[];
  statuses: FunctionalStatus[];
  sections: { id: string; label: string }[];
  fields: FieldDef[];
  roles: { code: Role; label: string; regionScoped: boolean }[];
  departments: { code: string; label: string; approves: SourceType[] }[];
}

export type Role =
  | 'admin'
  | 'department_reviewer'
  | 'data_officer'
  | 'regional_coordinator'
  | 'field_officer'
  | 'lab_officer'
  | 'maintenance_officer'
  | 'viewer';

export type Permission = 'sources.view' | 'sources.propose' | 'sources.approve' | 'quality.view' | 'users.manage' | 'audit.view';

export interface Me {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    roleLabel: string;
    department: string | null;
    regionId: number | null;
    regionName: string | null;
    mustChangePassword: boolean;
  };
  permissions: Permission[];
  approvableTypes: SourceType[];
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  department: string | null;
  regionId: number | null;
  regionName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  locked: boolean;
}

export type FieldValue = string | number | boolean | null;

export interface SourceValues {
  fields: Record<string, FieldValue>;
  details: Record<string, FieldValue>;
}

export type ChangeStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ChangeListItem {
  id: string;
  kind: 'create' | 'update';
  status: ChangeStatus;
  sourceId: string | null;
  sourceType: SourceType;
  sourceName: string | null;
  sourceCode: string | null;
  regionName: string;
  requestedAt: string;
  requestedBy: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  fieldCount: number;
}

export interface ChangeRequest {
  id: string;
  kind: 'create' | 'update';
  status: ChangeStatus;
  sourceId: string | null;
  sourceCode: string | null;
  sourceType: SourceType;
  sourceName: string | null;
  regionId: number;
  regionName: string;
  proposed: SourceValues;
  previous: SourceValues | null;
  current: SourceValues | null;
  stale: boolean;
  comment: string | null;
  requestedBy: { id: string; name: string };
  requestedAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  warnings: { field: string; message: string }[];
  canReview: boolean;
  reviewBlockedReason: string | null;
  canWithdraw: boolean;
}

export interface HistoryEntry {
  id: string;
  at: string;
  action: string;
  summary: string;
  userName: string | null;
  changes: { requestId?: string; requestedBy?: string; proposed?: SourceValues; previous?: SourceValues | null } | null;
}

export interface AuditEntry extends HistoryEntry {
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userId: string | null;
}

export interface CountRow {
  label: string;
  count: number;
}

export interface RegionStats {
  id: number;
  code: string;
  name: string;
  total: number;
  functioning: number;
  nonFunctioning: number;
  abandoned: number;
  unknown: number;
}

export interface Summary {
  totals: {
    sources: number;
    functioning: number;
    nonFunctioning: number;
    abandoned: number;
    unknown: number;
    unverified: number;
    sampleRecords: number;
    peopleServed: number;
    idpsServed: number;
    livestock: number;
    lastUpdated: string | null;
  };
  byType: { type: SourceType; total: number; functioning: number }[];
  byRegion: RegionStats[];
  byPower: CountRow[];
  byQuality: CountRow[];
  byCondition: CountRow[];
  recentInspections: {
    id: string;
    inspectedOn: string;
    agency: string | null;
    status: FunctionalStatus | null;
    sourceId: string;
    code: string;
    name: string;
    type: SourceType;
  }[];
}

export interface QualityReport {
  totals: { error: number; warning: number; info: number; sourcesAffected: number };
  byMessage: { pattern: string; severity: Severity; count: number }[];
  items: {
    id: number;
    severity: Severity;
    sheet: string | null;
    rowNumber: number | null;
    field: string | null;
    message: string;
    originalValue: string | null;
    sourceId: string | null;
    code: string | null;
    name: string | null;
  }[];
}
