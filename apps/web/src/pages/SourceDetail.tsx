import { ArrowLeft, CalendarCheck, ClipboardPen, ClipboardPlus, Clock, Images, Info, MapPin, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AssignDialog } from '../components/inspections/AssignDialog';
import { SourceMaintenance, UnreportedBreakdownBanner } from '../components/maintenance/SourceMaintenance';
import { SourceLabResults } from '../components/quality/SourceLabResults';
import { InspectionStateBadge } from '../components/inspections/InspectionStateBadge';
import { WaterMap } from '../components/map/WaterMap';
import { SeverityBadge, StatusBadge, TypeLabel, TypeSwatch, VerificationBadge } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Controls';
import { FactList, type Fact } from '../components/ui/FactList';
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/ui/States';
import { SourceHistory } from '../components/SourceHistory';
import { useAuth } from '../lib/auth';
import { STATUS_META, TYPE_META } from '../lib/domain';
import { formatBoolean, formatDate, formatMeasure, formatNumber } from '../lib/format';
import { useNearby, usePendingChangesForSource, useReference, useSource } from '../lib/queries';
import type { SourceCollection, SourceDetail as Detail, SourceFeature } from '../lib/types';

export function SourceDetail() {
  const { id } = useParams();
  const source = useSource(id);

  if (source.isError) {
    return (
      <>
        <BackLink />
        <Card>
          <ErrorState error={source.error} onRetry={() => source.refetch()} />
        </Card>
      </>
    );
  }
  if (!source.data) {
    return (
      <div role="status" aria-label="Loading record">
        <BackLink />
        <Skeleton className="mb-6 h-32 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <LoadingBlock rows={8} />
          </Card>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }
  return <SourceRecord s={source.data} />;
}

function BackLink() {
  return (
    <Link to="/sources" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
      <ArrowLeft size={16} aria-hidden /> Water sources
    </Link>
  );
}

function SourceRecord({ s }: { s: Detail }) {
  const reference = useReference();
  const { can } = useAuth();
  const pending = usePendingChangesForSource(s.id);
  const pendingRequest = pending.data?.[0];
  const [assignOpen, setAssignOpen] = useState(false);
  const [radiusKm, setRadiusKm] = useState(25);
  const nearby = useNearby(s.id, radiusKm);
  const lastInspection = s.inspections[0];

  // This record as a map feature, for the location map.
  const mapData = useMemo<SourceCollection>(() => {
    const self: SourceFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type,
        status: s.status,
        verification: s.verification,
        region: s.region,
        district: s.district,
        peopleServed: s.peopleServed,
      },
    };
    return { type: 'FeatureCollection', features: [self] };
  }, [s]);

  const detailFields = reference.data?.sourceTypes.find((t) => t.code === s.type)?.detailFields ?? [];
  const knownKeys = new Set(detailFields.map((f) => f.key));
  const technical: Fact[] = [
    ...detailFields.map((f) => {
      const v = s.details[f.key];
      return {
        label: f.unit ? `${f.label} (${f.unit})` : f.label,
        value: v === null || v === undefined ? null : f.kind === 'number' && typeof v === 'number' ? formatNumber(v, 2) : String(v),
      };
    }),
    // Columns not in the standard template are kept and shown as-is.
    ...Object.entries(s.details)
      .filter(([k]) => !knownKeys.has(k))
      .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v === null ? null : String(v) })),
  ];

  return (
    <>
      <BackLink />

      {/* Header */}
      <section className="mb-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="h-1" style={{ background: TYPE_META[s.type].color }} aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <TypeLabel type={s.type} className="font-medium text-ink" />
              <span className="font-mono text-xs text-ink-3">{s.code}</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{s.name}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-2">
              <MapPin size={15} className="shrink-0 text-ink-3" aria-hidden />
              {[s.settlement && `Near ${s.settlement}`, s.district, s.region].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusBadge status={s.status} />
            <VerificationBadge value={s.verification} />
            <div className="mt-1 flex flex-wrap gap-2 sm:justify-end">
              {can('inspections.submit') && (
                <Link
                  to={`/field/inspect/${s.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800"
                >
                  <ClipboardPen size={14} aria-hidden /> Inspect now
                </Link>
              )}
              {can('inspections.assign') && (
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-page"
                >
                  <ClipboardPlus size={14} aria-hidden /> Assign inspection
                </button>
              )}
              {can('sources.propose') && !pendingRequest && pending.isSuccess && (
                <Link
                  to={`/sources/${s.id}/edit`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-page"
                >
                  <Pencil size={14} aria-hidden /> Propose changes
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line text-sm sm:grid-cols-4">
          <HeaderStat label="Last inspected" value={formatDate(lastInspection?.inspectedOn)} />
          <HeaderStat label="Permanence" value={s.permanence ? capitalize(s.permanence) : '—'} />
          <HeaderStat label="Established" value={formatDate(s.establishedOn)} />
          <HeaderStat label="Protected" value={formatBoolean(s.isProtected)} />
        </div>
      </section>

      {pendingRequest && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
          <p className="flex gap-2.5">
            <Clock size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">A change is waiting for review</span>, submitted by {pendingRequest.requestedBy} on{' '}
              {formatDate(pendingRequest.requestedAt)}. The values below are the current approved record.
            </span>
          </p>
          <Link to={`/approvals/${pendingRequest.id}`} className="font-medium underline underline-offset-2 hover:no-underline">
            View request
          </Link>
        </div>
      )}

      {s.status !== 'functioning' && s.statusReason && (
        <div className="mb-6 flex gap-3 rounded-xl border px-4 py-3 text-sm" style={{ background: STATUS_META[s.status].wash, borderColor: STATUS_META[s.status].wash, color: STATUS_META[s.status].ink }}>
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{STATUS_META[s.status].label}:</span> {s.statusReason}
          </p>
        </div>
      )}

      <UnreportedBreakdownBanner s={s} />

      {s.verification === 'unverified' && (
        <div className="mb-6 flex gap-3 rounded-xl border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            This record was imported from <span className="font-medium">{s.dataSource ?? 'an earlier dataset'}</span>
            {s.legacyRef && <> ({s.legacyRef})</>} and has not been verified in the field yet.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Who uses this source" subtitle="As reported at the last visit">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <UseStat label="People" value={s.peopleServed} />
              <UseStat label="Of which IDPs" value={s.idpsServed} />
              <UseStat label="Irrigated land" value={s.irrigatedHa} unit="ha" />
              <UseStat label="Camels" value={s.camels} />
              <UseStat label="Cattle" value={s.cattle} />
              <UseStat label="Sheep and goats" value={s.shoats} />
            </div>
          </Card>

          <Card title="General">
            <FactList
              facts={[
                { label: 'Establishing agency', value: s.establishingAgency },
                { label: 'Funding agency', value: s.fundingAgency },
                { label: 'Contractor', value: s.contractor },
                { label: 'Water committee established', value: s.wscEstablishedOn && formatDate(s.wscEstablishedOn) },
                { label: 'Distance to settlement', value: s.distanceToSettlementKm !== null && formatMeasure(s.distanceToSettlementKm, 'km') },
                { label: 'Altitude', value: s.altitudeM !== null && formatMeasure(s.altitudeM, 'm', 0) },
                { label: 'Coordinates', value: <span className="font-mono text-[13px]">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span> },
                { label: 'Source field area', value: s.fieldAreaHa !== null && formatMeasure(s.fieldAreaHa, 'ha') },
              ].map(noFalse)}
            />
          </Card>

          <Card title="Technical details" subtitle={`Specific to ${TYPE_META[s.type].plural.toLowerCase()}`}>
            {technical.length ? <FactList facts={technical} columns={3} /> : <LoadingBlock rows={3} />}
          </Card>

          <Card title="Supply system">
            <FactList
              columns={3}
              facts={[
                { label: 'Reservoir type', value: s.reservoirType },
                { label: 'Reservoir capacity', value: s.reservoirCapacityM3 !== null && formatMeasure(s.reservoirCapacityM3, 'm³') },
                { label: 'Pipeline type', value: s.pipelineType },
                { label: 'Pipeline length', value: s.pipelineLengthM !== null && formatMeasure(s.pipelineLengthM, 'm', 0) },
                { label: 'Household connections', value: s.householdConnections !== null && formatNumber(s.householdConnections) },
                { label: 'Water points / kiosks', value: s.kiosks !== null && formatNumber(s.kiosks) },
                { label: 'Animal troughs', value: s.animalTroughs !== null && formatNumber(s.animalTroughs) },
                { label: 'Sanitation structures', value: s.sanitationStructures !== null && formatNumber(s.sanitationStructures) },
                { label: 'Used for water trucking', value: formatBoolean(s.usedForTrucking) },
                { label: 'Trucks per day', value: s.trucksPerDay !== null && formatNumber(s.trucksPerDay) },
                { label: 'Average truck capacity', value: s.truckCapacityM3 !== null && formatMeasure(s.truckCapacityM3, 'm³') },
              ].map(noFalse)}
            />
          </Card>

          <Card title="Pump and power">
            <FactList
              columns={3}
              facts={[
                { label: 'Pump type', value: s.pumpType },
                { label: 'Pump model', value: s.pumpModel },
                { label: 'Pump capacity', value: s.pumpCapacityLps !== null && formatMeasure(s.pumpCapacityLps, 'l/s') },
                { label: 'Pump level', value: s.pumpLevelM !== null && formatMeasure(s.pumpLevelM, 'm', 0) },
                { label: 'Power source', value: s.powerSource },
                { label: 'Generator', value: joinParts(s.generatorType, s.generatorKva !== null ? formatMeasure(s.generatorKva, 'kVA', 0) : null) },
                { label: 'Solar', value: joinParts(s.solarType, s.solarKw !== null ? formatMeasure(s.solarKw, 'kW') : null) },
                { label: 'Supply system condition', value: s.supplyCondition },
                { label: 'Condition notes', value: s.supplyConditionNotes },
              ].map(noFalse)}
            />
          </Card>

          <SourceLabResults s={s} />
        </div>

        <aside className="space-y-6">
          <Card title="Location" bodyClassName="">
            <WaterMap data={mapData} focusId={s.id} focusZoom={8} className="h-64" label={`Location of ${s.name}`} scrollZoom={false} />
          </Card>

          <Card
            title="Nearby sources"
            subtitle="Distance measured on the ground"
            action={
              <Select label="Radius" hideLabel value={radiusKm} onChange={(v) => setRadiusKm(Number(v))} className="w-28">
                {[10, 25, 50, 100].map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </Select>
            }
            bodyClassName="px-5 py-2"
          >
            {!nearby.data ? (
              <div className="py-3">
                <LoadingBlock rows={3} />
              </div>
            ) : nearby.data.length === 0 ? (
              <p className="py-5 text-center text-sm text-ink-3">No other sources within {radiusKm} km.</p>
            ) : (
              <ul className="divide-y divide-line">
                {nearby.data.map((n) => (
                  <li key={n.id}>
                    <Link to={`/sources/${n.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-page">
                      <TypeSwatch type={n.type} size={15} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{n.name}</div>
                        <div className="text-xs text-ink-3">{STATUS_META[n.status].label}</div>
                      </div>
                      <span className="shrink-0 text-sm tabular text-ink-2">{formatMeasure(n.distanceKm, 'km')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Inspection history" bodyClassName="px-5 py-4">
            {s.inspections.length === 0 ? (
              <EmptyState title="No inspections yet" />
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {s.inspections.map((i) => (
                  <li key={i.id} className="relative">
                    <span className="absolute -left-[27px] top-0.5 grid size-[13px] place-items-center rounded-full bg-surface ring-2 ring-brand-600">
                      <span className="size-1.5 rounded-full bg-brand-600" />
                    </span>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <CalendarCheck size={14} className="text-ink-3" aria-hidden /> {formatDate(i.inspectedOn)}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-2">
                      {i.isFieldInspection ? `Field visit by ${i.inspector ?? 'inspector'}` : i.agency ?? 'Agency not recorded'}
                      {i.photoCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-ink-3">
                          <Images size={12} aria-hidden /> {i.photoCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {i.status && <StatusBadge status={i.status} size="sm" />}
                      {i.isFieldInspection && i.state !== 'approved' && <InspectionStateBadge state={i.state} size="sm" />}
                    </div>
                    {i.notes && <p className="mt-1 text-xs text-ink-3">{i.notes}</p>}
                    {i.isFieldInspection && (
                      <Link to={`/inspections/${i.id}`} className="mt-1 block text-xs font-medium text-brand-700 hover:underline">
                        View inspection
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <SourceHistory source={s} />
          {assignOpen && <AssignDialog open onClose={() => setAssignOpen(false)} source={{ id: s.id, name: s.name, regionId: s.regionId }} />}

          <SourceMaintenance s={s} />

          {s.issues.length > 0 && (
            <Card title="Data quality notes" subtitle="Found when this record was imported" bodyClassName="px-5 py-3">
              <ul className="divide-y divide-line">
                {s.issues.map((issue) => (
                  <li key={issue.id} className="py-2.5">
                    <SeverityBadge severity={issue.severity} />
                    <p className="mt-1 text-sm text-ink">{issue.message}</p>
                    {issue.originalValue && (
                      <p className="mt-0.5 text-xs text-ink-3">
                        Value in sheet: <span className="font-mono">{issue.originalValue}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-5 py-3 [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`mt-0.5 font-medium ${value === '—' ? 'text-ink-3' : 'text-ink'}`}>{value === '—' ? 'Not recorded' : value}</div>
    </div>
  );
}

function UseStat({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-lg bg-page px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${value === null ? 'text-ink-3' : 'text-ink'}`}>
        {value === null ? '—' : formatNumber(value)}
        {unit && value !== null && <span className="ml-1 text-sm font-normal text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function noFalse(f: { label: string; value: unknown }): Fact {
  return { label: f.label, value: f.value === false ? null : (f.value as Fact['value']) };
}

function joinParts(...parts: (string | null)[]) {
  const filled = parts.filter(Boolean);
  return filled.length ? filled.join(' · ') : null;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
