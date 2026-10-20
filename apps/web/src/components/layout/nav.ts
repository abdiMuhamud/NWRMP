import {
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  Droplets,
  FileBarChart,
  FileUp,
  FlaskConical,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Smartphone,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '../../lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  /** Hidden unless the signed-in user holds this permission */
  permission?: Permission;
  /** Hidden unless the user holds at least one of these */
  anyPermission?: Permission[];
  /** Count shown next to the item */
  badge?: 'approvals' | 'inspections' | 'assignments' | 'lab' | 'maintenance';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/map', label: 'Map', icon: MapIcon },
    ],
  },
  {
    label: 'Registry',
    items: [
      { to: '/sources', label: 'Water sources', icon: Droplets },
      { to: '/approvals', label: 'Approvals', icon: Inbox, badge: 'approvals' },
      { to: '/data-quality', label: 'Data quality', icon: ClipboardCheck, permission: 'quality.view' },
      { to: '/import', label: 'Import data', icon: FileUp, permission: 'data.import' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/field', label: 'My inspections', icon: ClipboardPen, permission: 'inspections.submit', badge: 'assignments' },
      { to: '/inspections', label: 'Inspections', icon: ClipboardList, anyPermission: ['inspections.assign', 'inspections.review'], badge: 'inspections' },
      { to: '/water-quality', label: 'Water quality', icon: FlaskConical, badge: 'lab' },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench, badge: 'maintenance' },
      { to: '/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users and roles', icon: Users, permission: 'users.manage' },
      { to: '/admin/audit', label: 'Audit log', icon: History, permission: 'audit.view' },
      { to: '/planned/forms', label: 'Form builder', icon: ListChecks, soon: true },
      { to: '/planned/mobile', label: 'Mobile app', icon: Smartphone, soon: true },
    ],
  },
];
