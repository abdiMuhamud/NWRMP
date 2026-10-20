import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../../lib/api';
import { Button, Field, borderFor, inputClass } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { SourcePicker, type PickedSource } from '../SourcePicker';

/** Ask the Water Quality Lab to test a source; the request appears in the lab's queue. */
export function RequestTestDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source?: PickedSource }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickedSource | null>(source ?? null);
  const [sampledOn, setSampledOn] = useState('');
  const [sampledBy, setSampledBy] = useState('');
  const [samplePoint, setSamplePoint] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const request = useMutation({
    mutationFn: () =>
      apiPost('/water-quality/tests', {
        sourceId: picked!.id,
        sampledOn: sampledOn || undefined,
        sampledBy: sampledBy || undefined,
        samplePoint: samplePoint || undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      for (const key of ['wq-tests', 'wq-source']) queryClient.invalidateQueries({ queryKey: [key] });
      toast(`Water test requested for ${picked!.name}`);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not send the request');
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!picked) return setError('Choose the water source');
    request.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={source ? `Request a water test: ${source.name}` : 'Request a water test'}
      description="The Water Quality Lab sees the request in its queue and records the results."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="request-test" disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </>
      }
    >
      <form id="request-test" onSubmit={submit} className="space-y-4" noValidate>
        {!source && <SourcePicker value={picked} onChange={setPicked} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sample taken on" htmlFor="rq-date" hint="Leave empty if the lab will collect it" error={fieldErrors.sampledOn}>
            <input id="rq-date" type="date" max={new Date().toISOString().slice(0, 10)} value={sampledOn} onChange={(e) => setSampledOn(e.target.value)} className={`${inputClass} ${borderFor(fieldErrors.sampledOn)}`} />
          </Field>
          <Field label="Sample taken by" htmlFor="rq-by">
            <input id="rq-by" value={sampledBy} onChange={(e) => setSampledBy(e.target.value)} maxLength={200} className={`${inputClass} ${borderFor()}`} />
          </Field>
        </div>
        <Field label="Sampling point" htmlFor="rq-point" hint="e.g. borehole outlet, reservoir, kiosk tap">
          <input id="rq-point" value={samplePoint} onChange={(e) => setSamplePoint(e.target.value)} maxLength={200} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <Field label="Reason or note for the lab" htmlFor="rq-note" hint="What users report, e.g. salty taste, diarrhoea cases">
          <textarea id="rq-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={`${inputClass} ${borderFor()} h-auto py-2`} />
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
