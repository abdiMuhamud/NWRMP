import { ArrowLeft, CalendarClock, Check } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { NAV } from '../components/layout/nav';
import { Card } from '../components/ui/Card';
import { NotFound } from './NotFound';

// Roadmap from the NWRMP proposal: 1 Registry + GIS, 2 Inspections + dynamic forms,
// 3 Water quality + maintenance, 4 Reports + analytics, 5 Mobile + offline, 6 Government integrations.
const PLANNED: Record<string, { phase: string; summary: string; features: string[] }> = {
  inspections: {
    phase: 'Phase 2',
    summary: 'Plan and record field visits. Every visit is kept as its own record, so the history of each source is never overwritten.',
    features: [
      'Assign inspections to field teams by region',
      'Record condition, status and photos at each visit',
      'Approval flow: field officer → regional coordinator → department',
      'Flag overdue inspections',
    ],
  },
  'water-quality': {
    phase: 'Phase 3',
    summary: 'Laboratory and field test results linked to each water source, with alerts when results exceed national standards.',
    features: [
      'Record lab results (pH, EC, fluoride, salinity, bacteria)',
      'Compare results with drinking-water guidelines',
      'Trend of results per source over time',
      'Water Quality Lab work queue',
    ],
  },
  maintenance: {
    phase: 'Phase 3',
    summary: 'Track breakdowns, repairs and rehabilitation work, and who carried them out.',
    features: [
      'Report a breakdown from the field',
      'Work orders for O&M teams and contractors',
      'Spare parts and cost tracking',
      'Downtime and repair-time statistics',
    ],
  },
  reports: {
    phase: 'Phase 4',
    summary: 'Standard Ministry reports and analysis, exportable for partners and decision makers.',
    features: [
      'Regional and national summary reports (PDF, Excel)',
      'Coverage analysis: settlements far from a functioning source',
      'Scheduled monthly and quarterly reports',
      'Open data export for partners',
    ],
  },
  forms: {
    phase: 'Phase 2',
    summary: 'Let the Ministry add or change data-collection fields and source types without a developer.',
    features: [
      'Drag-and-drop form designer',
      'Validation and skip logic (e.g. generator capacity only if a generator exists)',
      'Form versions, so old records stay readable',
      'Same forms on the web and the mobile app',
    ],
  },
  users: {
    phase: 'Next sprint',
    summary: 'Sign-in for Ministry staff and partners, with each person limited to the data their role allows.',
    features: [
      'Single sign-on (OIDC) hosted on government infrastructure',
      'Roles for headquarters, departments, regional offices and partners',
      'Access limited by region',
      'Audit log of every change',
    ],
  },
  mobile: {
    phase: 'Phase 5',
    summary: 'An Android app for field teams that works without a connection and syncs when back in coverage.',
    features: [
      'Offline forms with GPS and camera',
      'Assigned surveys and inspections',
      'Automatic sync and conflict-free history',
      'Until then: ODK / KoboToolbox forms feeding the registry',
    ],
  },
};

export function Planned() {
  const { slug = '' } = useParams();
  const plan = PLANNED[slug];
  const nav = NAV.flatMap((g) => g.items).find((i) => i.to === `/planned/${slug}`);
  if (!plan || !nav) return <NotFound />;
  const Icon = nav.icon;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Dashboard
      </Link>
      <Card bodyClassName="p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon size={24} aria-hidden />
        </span>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-medium text-gold-800">
          <CalendarClock size={13} aria-hidden /> Planned · {plan.phase}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{nav.label}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{plan.summary}</p>
        <ul className="mt-6 space-y-2.5">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2.5 text-sm text-ink">
              <Check size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
