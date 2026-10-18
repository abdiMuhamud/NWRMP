import { KeyRound, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Card } from '../components/ui/Card';
import { Button, Field, borderFor, inputClass } from '../components/ui/Controls';
import { FactList } from '../components/ui/FactList';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Account() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const required = Boolean(me?.user.mustChangePassword) || params.get('required') === '1';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/password', { currentPassword: current, newPassword: next });
      await refresh();
      toast('Password changed. Other devices have been signed out.');
      setCurrent('');
      setNext('');
      setConfirm('');
      if (required) navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="My account" />
      {required && (
        <div className="mb-6 flex gap-3 rounded-xl border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Choose a new password to continue.</span> You signed in with a temporary
            password from an administrator.
          </p>
        </div>
      )}
      <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <FactList
            columns={1}
            facts={[
              { label: 'Name', value: me.user.fullName },
              { label: 'Email', value: me.user.email },
              { label: 'Role', value: me.user.roleLabel },
              { label: 'Region', value: me.user.regionName ?? 'All regions' },
            ]}
          />
        </Card>
        <Card title="Change password" subtitle="At least 10 characters. A short sentence is easy to remember.">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password" htmlFor="current">
              <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`${inputClass} ${borderFor()}`} />
            </Field>
            <Field label="New password" htmlFor="new">
              <input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={`${inputClass} ${borderFor()}`} />
            </Field>
            <Field label="Repeat new password" htmlFor="confirm" error={mismatch ? 'The passwords do not match' : undefined}>
              <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputClass} ${borderFor(mismatch ? 'x' : undefined)}`} />
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={busy || !current || next.length < 10 || mismatch}>
              <KeyRound size={16} aria-hidden /> {busy ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
