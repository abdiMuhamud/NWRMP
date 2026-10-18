import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_META } from '../../lib/domain';
import { formatDate } from '../../lib/format';
import { useInspectors, useReference, useSources } from '../../lib/queries';
import { TypeSwatch } from '../ui/Badges';
import { Button, Field, SearchInput, Select, borderFor, inputClass } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-select one source (e.g. from its record page) */
  source?: { id: string; name: string; regionId: number };
}

/** Assign inspections of one or more sources to a field officer, with a due date. */
export function AssignDialog({ open, onClose, source }: AssignDialogProps) {
  const { scopeRegionId } = useAuth();
  const reference = useReference();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [regionId, setRegionId] = useState<number | undefined>(source?.regionId ?? scopeRegionId ?? undefined);
  const [inspector, setInspector] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(source ? [source.id] : []));
  const [search, setSearch] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inspectors = useInspectors(regionId, open && Boolean(regionId));
  // Least recently inspected first: those most need a visit.
  const sources = useSources({ region: regionId, q: search, pageSize: 100, sort: 'inspected', order: 'asc' });
  const list = useMemo(() => (source ? [] : sources.data?.items ?? []), [source, sources.data]);

  const assign = useMutation({
    mutationFn: () =>
      apiPost<{ created: number; skipped: { name?: string; reason: string }[] }>('/inspections/assignments', {
        sourceIds: [...selected],
        assignedTo: inspector,
        dueOn: dueOn || undefined,
        notes: notes || undefined,
      }),
    onSuccess: (r) => {
      for (const key of ['assignments', 'inspections', 'inspectors']) queryClient.invalidateQueries({ queryKey: [key] });
      const skipped = r.skipped.length ? ` · ${r.skipped.length} skipped (${r.skipped[0].reason.toLowerCase()})` : '';
      toast(`${r.created} inspection${r.created === 1 ? '' : 's'} assigned${skipped}`, r.created ? 'success' : 'error');
      if (r.created) onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not assign'),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inspector) return setError('Choose who will do the inspection');
    if (!selected.size) return setError('Choose at least one water source');
    assign.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={source ? `Assign inspection: ${source.name}` : 'Assign inspections'}
      description="The field officer sees these on their phone, with the current values filled in."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="assign-form" disabled={assign.isPending}>
            {assign.isPending ? 'Assigning…' : `Assign ${selected.size || ''}`.trim()}
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {!scopeRegionId && !source && (
            <Select
              label="Region"
              value={regionId ?? ''}
              onChange={(v) => {
                setRegionId(v ? Number(v) : undefined);
                setInspector('');
                setSelected(new Set());
              }}
            >
              <option value="">Choose a region</option>
              {reference.data?.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
          <Select label="Assign to" value={inspector} onChange={setInspector} disabled={!regionId}>
            <option value="">{regionId ? 'Choose a person' : 'Choose a region first'}</option>
            {inspectors.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.fullName} ({i.role === 'field_officer' ? 'field officer' : 'coordinator'}, {i.openAssignments} open)
              </option>
            ))}
          </Select>
          <Field label="Due date (optional)" htmlFor="assign-due">
            <input id="assign-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={`${inputClass} ${borderFor()}`} />
          </Field>
        </div>

        {regionId && inspectors.data && inspectors.data.length === 0 && (
          <p className="rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn-ink">
            No field officers or coordinators in this region yet. An administrator can add them under Users and roles.
          </p>
        )}

        {!source && regionId && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-2">Water sources ({selected.size} selected) · least recently inspected first</span>
            </div>
            <SearchInput value={search} onChange={setSearch} label="Search sources" placeholder="Search by name, code or settlement" />
            <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {list.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-page">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-brand-700" />
                    <TypeSwatch type={s.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{s.name}</span>
                      <span className="block text-xs text-ink-3">
                        {s.code} · {STATUS_META[s.status].label} · last inspected {formatDate(s.lastInspectedOn)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {sources.data && list.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">No sources match.</li>}
            </ul>
          </div>
        )}

        <Field label="Instructions (optional)" htmlFor="assign-notes">
          <textarea
            id="assign-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Check the generator and take a water sample"
            className={`${inputClass} ${borderFor()} h-auto py-2`}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
