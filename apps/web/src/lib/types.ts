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
  /** Outcome of the latest laboratory test, if any */
  quality?: TestOutcome | null;
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
  state: InspectionState;
  inspector: string | null;
  isFieldInspection: boolean;
  photoCount: number;
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
  regionId: number;
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
  inspectionFields: string[];
  roles: { code: Role; label: string; regionScoped: boolean }[];
  departments: { code: string; label: string; approves: SourceType[] }[];
  workOrderCategories: { code: string; label: string }[];
  workOrderPriorities: { code: WorkOrderPriority; label: string }[];
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

export type Permission =
  | 'sources.view'
  | 'sources.propose'
  | 'sources.approve'
  | 'quality.view'
  | 'users.manage'
  | 'audit.view'
  | 'inspections.assign'
  | 'inspections.submit'
  | 'inspections.review'
  | 'lab.request'
  | 'lab.record'
  | 'lab.standards'
  | 'maintenance.report'
  | 'maintenance.work'
  | 'maintenance.close';

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
  waterQuality: { tested: number; unsafe: number; concern: number };
  maintenance: { open: number; urgent: number; closedRecently: number; avgRepairDays: number | null; brokenWithoutOrder: number };
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

export type InspectionState = 'draft' | 'submitted' | 'approved' | 'returned';

export interface Assignment {
  id: string;
  status: 'open' | 'submitted' | 'completed' | 'cancelled';
  dueOn: string | null;
  notes: string | null;
  createdAt: string;
  assignedBy: string | null;
  assignedTo: string | null;
  sourceId: string;
  code: string;
  name: string;
  type: SourceType;
  settlement: string | null;
  district: string | null;
  region: string;
  lat: number;
  lng: number;
  /** Current approved values of the inspection fields (for filling in offline) */
  current: Record<string, FieldValue>;
  inspectionId: string | null;
  inspectionState: InspectionState | null;
  reviewComment: string | null;
}

export interface InspectionListItem {
  id: string;
  state: InspectionState;
  inspectedOn: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  inspector: string | null;
  reviewer: string | null;
  sourceId: string;
  code: string;
  name: string;
  type: SourceType;
  region: string;
  photoCount: number;
  distanceM: number | null;
}

export interface InspectionDetail {
  id: string;
  state: InspectionState;
  inspectedOn: string;
  notes: string | null;
  observed: Record<string, FieldValue> | null;
  previous: SourceValues | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  locationMoved: boolean;
  gpsAccuracyM: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  distanceM: number | null;
  assignmentId: string | null;
  inspectorId: string;
  inspector: string | null;
  reviewer: string | null;
  sourceId: string;
  code: string;
  name: string;
  type: SourceType;
  regionId: number;
  region: string;
  sourceLat: number;
  sourceLng: number;
  current: Record<string, FieldValue> | null;
  photos: { id: string; caption: string | null; url: string }[];
  warnings: { field: string; message: string }[];
  canReview: boolean;
  reviewBlockedReason: string | null;
  canEdit: boolean;
}

export interface Inspector {
  id: string;
  fullName: string;
  role: Role;
  region: string | null;
  openAssignments: number;
}

// ---------------------------------------------------------------- water quality

export type ParameterKind = 'health' | 'aesthetic' | 'info';
export type ResultFlag = 'ok' | 'low' | 'high';
export type TestOutcome = 'meets' | 'concern' | 'unsafe';
export type TestState = 'requested' | 'completed' | 'cancelled';

export interface WqParameter {
  code: string;
  label: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  kind: ParameterKind;
  basis: string | null;
  sortOrder: number;
  active: boolean;
}

export interface Exceedance {
  label: string;
  unit: string;
  value: number;
  flag: ResultFlag;
  kind: ParameterKind;
  min: number | null;
  max: number | null;
}

export interface TestListItem {
  id: string;
  state: TestState;
  outcome: TestOutcome | null;
  sampledOn: string | null;
  samplePoint: string | null;
  requestedAt: string | null;
  recordedAt: string | null;
  requestNote: string | null;
  requestedBy: string | null;
  recordedBy: string | null;
  sourceId: string;
  code: string;
  name: string;
  type: SourceType;
  regionId: number;
  region: string;
  exceedances: Exceedance[];
}

export interface TestResult {
  code: string;
  label: string;
  unit: string;
  value: number;
  flag: ResultFlag;
  kind: ParameterKind;
  minValue: number | null;
  maxValue: number | null;
  basis: string | null;
}

export interface TestDetail extends TestListItem {
  sampledBy: string | null;
  lab: string | null;
  analysedOn: string | null;
  notes: string | null;
  cancelledReason: string | null;
  sourceStatus: FunctionalStatus;
  results: TestResult[];
  canRecord: boolean;
  canCorrect: boolean;
  canCancel: boolean;
}

export interface SourceWaterQuality {
  openRequest: { id: string; requestedAt: string; requestedBy: string | null; requestNote: string | null; sampledOn: string | null } | null;
  tests: {
    id: string;
    outcome: TestOutcome;
    sampledOn: string;
    samplePoint: string | null;
    lab: string | null;
    recordedBy: string | null;
    results: { code: string; value: number; flag: ResultFlag; kind: ParameterKind; minValue: number | null; maxValue: number | null }[];
  }[];
}

// ---------------------------------------------------------------- maintenance

export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
export type WorkOrderPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface WorkOrderListItem {
  id: string;
  ref: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  category: string;
  title: string;
  reportedAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  reportedBy: string | null;
  assignedTo: string | null;
  assignedToId: string | null;
  workingAfter: boolean | null;
  sourceId: string;
  code: string;
  name: string;
  type: SourceType;
  sourceStatus: FunctionalStatus;
  regionId: number;
  region: string;
}

export interface WorkOrderDetail extends WorkOrderListItem {
  categoryLabel: string;
  description: string | null;
  inspectionId: string | null;
  startedAt: string | null;
  workDone: string | null;
  completedOn: string | null;
  partsUsed: string | null;
  costUsd: number | null;
  performedBy: string | null;
  completedBy: string | null;
  closedBy: string | null;
  closeComment: string | null;
  cancelledReason: string | null;
  timeline: { id: string; at: string; action: string; summary: string; userName: string | null }[];
  canAssign: boolean;
  canTake: boolean;
  canStart: boolean;
  canComplete: boolean;
  canClose: boolean;
  canReopen: boolean;
  closeBlockedReason: string | null;
  canCancel: boolean;
}

export interface Technician {
  id: string;
  fullName: string;
  email: string;
  openJobs: number;
}
