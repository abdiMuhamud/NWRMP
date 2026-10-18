import {
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FileBarChart,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Smartphone,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
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
      { to: '/data-quality', label: 'Data quality', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/planned/inspections', label: 'Inspections', icon: ClipboardList, soon: true },
      { to: '/planned/water-quality', label: 'Water quality', icon: FlaskConical, soon: true },
      { to: '/planned/maintenance', label: 'Maintenance', icon: Wrench, soon: true },
      { to: '/planned/reports', label: 'Reports', icon: FileBarChart, soon: true },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/planned/forms', label: 'Form builder', icon: ListChecks, soon: true },
      { to: '/planned/users', label: 'Users & roles', icon: Users, soon: true },
      { to: '/planned/mobile', label: 'Mobile app', icon: Smartphone, soon: true },
    ],
  },
];
