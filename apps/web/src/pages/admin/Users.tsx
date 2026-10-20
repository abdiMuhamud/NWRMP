import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Lock, Pencil, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router';
import { Card } from '../../components/ui/Card';
import { Button, Field, Select, borderFor, inputClass } from '../../components/ui/Controls';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPatch, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { copyText } from '../../lib/device';
import { formatDate } from '../../lib/format';
import { useReference, useUsers } from '../../lib/queries';
import type { Role, UserRow } from '../../lib/types';

interface FormState {
  email: string;
  fullName: string;
  phone: string;
  role: Role;
  department: string;
  regionId: string;
}

const EMPTY: FormState = { email: '', fullName: '', phone: '', role: 'viewer', department: '', regionId: '' };

export function Users() {
  const users = useUsers();
  const reference = useReference();
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState<UserRow | null>(null);
  const [filter, setFilter] = useState('');

  const roleLabel = (r: Role) => reference.data?.roles.find((x) => x.code === r)?.label ?? r;
  const deptLabel = (d: string | null) => reference.data?.departments.find((x) => x.code === d)?.label ?? '—';

  const resetPassword = useMutation({
    mutationFn: (u: UserRow) => apiPost<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`).then((r) => ({ ...r, u })),
    onSuccess: ({ temporaryPassword, u }) => {
      setConfirmReset(null);
      setSecret({ name: u.fullName, password: temporaryPassword });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      setConfirmReset(null);
      toast(err instanceof ApiError ? err.message : 'Could not reset the password', 'error');
    },
  });

  const toggleActive = useMutation({
    mutationFn: (u: UserRow) => apiPatch<UserRow>(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: (u) => {
      toast(`${u.fullName} ${u.isActive ? 'reactivated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not update the user', 'error'),
  });

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users.data ?? []).filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.includes(q));
  }, [users.data, filter]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users and roles"
        description="Who can sign in, what they can do, and which region they work in. New users get a temporary password and must change it at first sign-in."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <UserPlus size={16} aria-hidden /> Add user
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <div className="border-b border-line p-4">
          <label className="block max-w-sm">
            <span className="sr-only">Filter users</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or email" className={`${inputClass} ${borderFor()}`} />
          </label>
        </div>
        {users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : !users.data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title="No users match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Department / region</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className={`border-b border-line last:border-0 ${u.isActive ? '' : 'bg-page/50 text-ink-3'}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{u.fullName}</div>
                      <div className="text-xs text-ink-3">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-ink">{roleLabel(u.role)}</td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{deptLabel(u.department)}</div>
                      <div className="text-xs text-ink-3">{u.regionName ?? 'All regions'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <UserStatus u={u} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton label={`Edit ${u.fullName}`} onClick={() => setEditing(u)}>
                          <Pencil size={15} />
                        </IconButton>
                        {/* Your own password is changed under My account: a reset would sign you out with the new password unseen. */}
                        {u.id !== me?.user.id && (
                          <IconButton label={`Reset password for ${u.fullName}`} onClick={() => setConfirmReset(u)} disabled={resetPassword.isPending}>
                            <KeyRound size={15} />
                          </IconButton>
                        )}
                        {u.id !== me?.user.id && (
                          <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => toggleActive.mutate(u)} disabled={toggleActive.isPending}>
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(name, password) => setSecret({ name, password })}
        />
      )}

      <Dialog
        open={Boolean(confirmReset)}
        onClose={() => setConfirmReset(null)}
        title="Reset the password?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmReset(null)}>Cancel</Button>
            <Button variant="primary" disabled={resetPassword.isPending} onClick={() => confirmReset && resetPassword.mutate(confirmReset)}>
              <KeyRound size={15} aria-hidden /> Reset password
            </Button>
          </>
        }
      >
        {confirmReset && (
          <p className="text-sm text-ink-2">
            <span className="font-medium text-ink">{confirmReset.fullName}</span>’s current password stops working and they are signed out on every
            device. You will see a temporary password once, to give to them.
          </p>
        )}
      </Dialog>

      {secret && <SecretDialog secret={secret} onDone={() => setSecret(null)} />}
    </>
  );
}

function UserStatus({ u }: { u: UserRow }) {
  if (!u.isActive) return <span className="text-xs font-medium text-ink-3">Deactivated</span>;
  if (u.locked)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-critical-ink">
        <Lock size={13} aria-hidden /> Locked (too many attempts)
      </span>
    );
  if (u.mustChangePassword) return <span className="text-xs font-medium text-warn-ink">Awaiting first sign-in</span>;
  return <span className="text-xs font-medium text-good-ink">Active</span>;
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function UserDialog({ user, onClose, onCreated }: { user: UserRow | null; onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const reference = useReference();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(
    user
      ? { email: user.email, fullName: user.fullName, phone: user.phone ?? '', role: user.role, department: user.department ?? '', regionId: user.regionId ? String(user.regionId) : '' }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const roleDef = reference.data?.roles.find((r) => r.code === form.role);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        fullName: form.fullName,
        phone: form.phone || null,
        role: form.role,
        department: form.department || null,
        regionId: roleDef?.regionScoped && form.regionId ? Number(form.regionId) : null,
      };
      return user
        ? apiPatch<UserRow>(`/users/${user.id}`, { ...body, email: form.email }).then(() => null)
        : apiPost<{ temporaryPassword: string }>('/users', { ...body, email: form.email }).then((r) => r.temporaryPassword);
    },
    onSuccess: (password) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
      if (password) onCreated(form.fullName, password);
      else toast('User updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the user'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };

  const approves = reference.data?.departments.find((d) => d.code === form.department)?.approves ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? `Edit ${user.fullName}` : 'Add user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="u-name" required className="sm:col-span-2">
          <input id="u-name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <Field label="Email (used to sign in)" htmlFor="u-email" required>
          <input id="u-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <Field label="Phone" htmlFor="u-phone">
          <input id="u-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <Select label="Role" value={form.role} onChange={(v) => set('role', v as Role)}>
          {reference.data?.roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select label="Department" value={form.department} onChange={(v) => set('department', v)}>
          <option value="">None</option>
          {reference.data?.departments.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </Select>
        {roleDef?.regionScoped && (
          <Select label="Region (required for this role)" value={form.regionId} onChange={(v) => set('regionId', v)} className="sm:col-span-2">
            <option value="">Choose a region</option>
            {reference.data?.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
        <p className="text-xs leading-relaxed text-ink-3 sm:col-span-2">
          {form.role === 'department_reviewer'
            ? approves.length
              ? `Will approve registry changes for: ${approves.join(', ').replace(/_/g, ' ')}.`
              : 'Department reviewers must belong to Groundwater, Shallow wells or Surface water.'
            : roleDef?.regionScoped
              ? 'Will only see and act on sources in the chosen region.'
              : 'Will see all regions.'}
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Shows a temporary password once. It stays open, and leaving the page is held back, until the
 * administrator has copied it or confirmed they wrote it down: it cannot be shown again.
 */
function SecretDialog({ secret, onDone }: { secret: { name: string; password: string }; onDone: () => void }) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);

  // Leaving the app (refresh, closing the tab) asks first; in-app navigation (Back) is held back.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const blocker = useBlocker(true);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  return (
    <Dialog
      open
      dismissible={false}
      onClose={onDone}
      title="Temporary password"
      description={`Give this password to ${secret.name}. It is shown only once and cannot be shown again.`}
      size="sm"
      footer={
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-2.5">
          <code className="flex-1 select-all font-mono text-base tracking-wide text-ink">{secret.password}</code>
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() =>
              copyText(secret.password).then(
                () => {
                  setSaved(true);
                  toast('Copied');
                },
                () => toast('Copy is not available here: select the password and copy it', 'error'),
              )
            }
          >
            <Copy size={15} aria-hidden /> Copy
          </Button>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
          <span>I have copied or written down this password</span>
        </label>
        <p className="text-xs text-ink-3">They will be asked to choose their own password the first time they sign in.</p>
      </div>
    </Dialog>
  );
}
