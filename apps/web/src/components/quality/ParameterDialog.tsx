import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, apiPatch, apiPost } from '../../lib/api';
import { KIND_LABELS } from '../../lib/quality';
import type { ParameterKind, WqParameter } from '../../lib/types';
import { Button, Field, Select, borderFor, inputClass } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Edit the limit of one parameter, or add a new one (parameter omitted). */
export function ParameterDialog({ parameter, onClose }: { parameter: WqParameter | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(parameter?.label ?? '');
  const [unit, setUnit] = useState(parameter?.unit ?? '');
  const [kind, setKind] = useState<ParameterKind>(parameter?.kind ?? 'health');
  const [min, setMin] = useState(parameter?.minValue?.toString() ?? '');
  const [max, setMax] = useState(parameter?.maxValue?.toString() ?? '');
  const [basis, setBasis] = useState(parameter?.basis ?? '');
  const [active, setActive] = useState(parameter?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label,
        unit,
        kind,
        minValue: kind === 'info' ? null : toNumber(min),
        maxValue: kind === 'info' ? null : toNumber(max),
        basis,
        active,
      };
      return parameter ? apiPatch(`/water-quality/parameters/${parameter.code}`, body) : apiPost('/water-quality/parameters', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wq-parameters'] });
      toast(parameter ? `Limit for ${label} saved` : `${label} added`);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not save');
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: Record<string, string> = {};
    if (label.trim().length < 2) next.label = 'Enter the parameter name';
    for (const [key, v] of [['minValue', min], ['maxValue', max]] as const) {
      if (kind !== 'info' && v.trim() !== '' && !Number.isFinite(toNumber(v))) next[key] = 'Enter a number';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={parameter ? `Limit: ${parameter.label}` : 'Add a parameter'}
      description="New limits apply to results recorded from now on. Results already recorded keep the limit they were judged against."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="parameter-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="parameter-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Parameter" htmlFor="p-label" required error={errors.label}>
            <input id="p-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={`${inputClass} ${borderFor(errors.label)}`} />
          </Field>
          <Field label="Unit" htmlFor="p-unit" hint="e.g. mg/L, NTU">
            <input id="p-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} className={`${inputClass} ${borderFor()}`} />
          </Field>
        </div>
        <Select label="When the limit is exceeded" value={kind} onChange={(v) => setKind(v as ParameterKind)}>
          <option value="health">{KIND_LABELS.health}: water is unsafe to drink</option>
          <option value="aesthetic">{KIND_LABELS.aesthetic}: users may reject the water</option>
          <option value="info">{KIND_LABELS.info}: no limit</option>
        </Select>
        {kind !== 'info' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum" htmlFor="p-min" hint="Leave empty if there is none" error={errors.minValue}>
              <input id="p-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className={`${inputClass} ${borderFor(errors.minValue)}`} />
            </Field>
            <Field label="Maximum" htmlFor="p-max" error={errors.maxValue}>
              <input id="p-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className={`${inputClass} ${borderFor(errors.maxValue)}`} />
            </Field>
          </div>
        )}
        <Field label="Source of the limit" htmlFor="p-basis" hint="Shown to users, e.g. the national standard and its year">
          <input id="p-basis" value={basis} onChange={(e) => setBasis(e.target.value)} maxLength={300} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-brand-700" />
          Measured by the lab (shown on the results form)
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
