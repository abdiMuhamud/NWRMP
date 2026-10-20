import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiPost } from '../../lib/api';
import { useReference } from '../../lib/queries';
import type { WorkOrderPriority } from '../../lib/types';
import { Button, Field, Select, borderFor, inputClass } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { SourcePicker, type PickedSource } from '../SourcePicker';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selected source (from its record page) */
  source?: PickedSource;
  /** The inspection that found the breakdown */
  inspectionId?: string;
}

/** Report a breakdown: creates a work order for the Operation and Maintenance team. */
export function ReportBreakdownDialog({ open, onClose, source, inspectionId }: Props) {
  const reference = useReference();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickedSource | null>(source ?? null);
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('high');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: () =>
      apiPost<{ id: string; ref: string }>('/work-orders', {
        sourceId: picked!.id,
        category,
        priority,
        title,
        description: description || undefined,
        inspectionId,
      }),
    onSuccess: (r) => {
      for (const key of ['work-orders', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
      toast(`${r.ref} reported. The maintenance team can see it now.`);
      onClose();
      navigate(`/maintenance/${r.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not report the breakdown');
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: Record<string, string> = {};
    if (!picked) next.source = 'Choose the water source';
    if (!category) next.category = 'Choose the type of problem';
    if (title.trim().length < 3) next.title = 'Describe the problem in a few words';
    setErrors(next);
    if (Object.keys(next).length === 0) report.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={source ? `Report a breakdown: ${source.name}` : 'Report a breakdown'}
      description="The Operation and Maintenance team receives it as a work order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="report-breakdown" disabled={report.isPending}>
            {report.isPending ? 'Sending…' : 'Report breakdown'}
          </Button>
        </>
      }
    >
      <form id="report-breakdown" onSubmit={submit} className="space-y-4" noValidate>
        {!source && <SourcePicker value={picked} onChange={setPicked} error={errors.source} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Select label="Type of problem" value={category} onChange={setCategory} aria-invalid={Boolean(errors.category)}>
              <option value="">Choose…</option>
              {reference.data?.workOrderCategories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
            {errors.category && <p className="mt-1 text-xs text-critical-ink">{errors.category}</p>}
          </div>
          <Select label="Priority" value={priority} onChange={(v) => setPriority(v as WorkOrderPriority)}>
            {reference.data?.workOrderPriorities.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <Field label="What is wrong" htmlFor="wo-title" required error={errors.title} hint="e.g. Pump does not start, pipe burst near the kiosk">
          <input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={`${inputClass} ${borderFor(errors.title)}`} />
        </Field>
        <Field label="Details" htmlFor="wo-desc" hint="Since when, what was tried, who to contact on site">
          <textarea id="wo-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className={`${inputClass} ${borderFor()} h-auto py-2`} />
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
