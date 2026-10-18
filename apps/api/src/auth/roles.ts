import type { SourceType } from '../reference/source-types';

export const ROLES = [
  'admin',
  'department_reviewer',
  'data_officer',
  'regional_coordinator',
  'field_officer',
  'lab_officer',
  'maintenance_officer',
  'viewer',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  department_reviewer: 'Department reviewer',
  data_officer: 'Data officer (HQ)',
  regional_coordinator: 'Regional coordinator',
  field_officer: 'Field officer',
  lab_officer: 'Lab officer',
  maintenance_officer: 'Maintenance officer',
  viewer: 'Viewer',
};

/** Ministry departments, as listed in the national water-source data review. */
export const DEPARTMENTS = [
  { code: 'groundwater', label: 'Groundwater' },
  { code: 'shallow_wells', label: 'Shallow wells and metrology' },
  { code: 'surface_water', label: 'Surface water' },
  { code: 'water_quality_lab', label: 'Water quality lab' },
  { code: 'operation_maintenance', label: 'Operation and maintenance' },
  { code: 'regional_coordination', label: 'Regional coordination' },
  { code: 'ict', label: 'ICT' },
  { code: 'water_research', label: 'Water research and regulatory framework' },
] as const;
export type Department = (typeof DEPARTMENTS)[number]['code'];
export const DEPARTMENT_CODES = DEPARTMENTS.map((d) => d.code) as Department[];

/** Which department approves registry changes for each source type. */
export const DEPARTMENT_SOURCE_TYPES: Partial<Record<Department, SourceType[]>> = {
  groundwater: ['borehole', 'spring'],
  shallow_wells: ['shallow_well'],
  surface_water: ['dam', 'berkad'],
};

/** Roles that only see and act on one region. */
export const REGION_SCOPED_ROLES: Role[] = ['regional_coordinator', 'field_officer'];

export const PERMISSIONS = [
  'sources.view',
  'sources.propose',
  'sources.approve',
  'quality.view',
  'users.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['sources.view', 'sources.propose', 'sources.approve', 'quality.view', 'users.manage', 'audit.view'],
  department_reviewer: ['sources.view', 'sources.propose', 'sources.approve', 'quality.view'],
  data_officer: ['sources.view', 'sources.propose', 'quality.view'],
  regional_coordinator: ['sources.view', 'sources.propose', 'quality.view'],
  field_officer: ['sources.view'],
  lab_officer: ['sources.view'],
  maintenance_officer: ['sources.view'],
  viewer: ['sources.view', 'quality.view'],
};

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  department: Department | null;
  regionId: number | null;
  mustChangePassword: boolean;
}

export function permissionsFor(user: Pick<AuthUser, 'role'>): Permission[] {
  return ROLE_PERMISSIONS[user.role];
}

export function can(user: Pick<AuthUser, 'role'>, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

/** The region a user is limited to, or null when they see the whole country. */
export function regionScope(user: Pick<AuthUser, 'role' | 'regionId'>): number | null {
  return REGION_SCOPED_ROLES.includes(user.role) ? user.regionId : null;
}

/** Source types whose registry changes this user may approve. */
export function approvableTypes(user: Pick<AuthUser, 'role' | 'department'>): SourceType[] {
  if (user.role === 'admin') return ['borehole', 'shallow_well', 'berkad', 'dam', 'spring'];
  if (user.role === 'department_reviewer' && user.department) return DEPARTMENT_SOURCE_TYPES[user.department] ?? [];
  return [];
}
