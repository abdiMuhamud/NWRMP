import { Eye, EyeOff, Lock, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { FlagStripe } from '../components/layout/Sidebar';
import { Button, Field, borderFor, inputClass } from '../components/ui/Controls';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { me, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only follow internal paths after sign-in.
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (me) return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await signIn(email, password);
      navigate(result.user.mustChangePassword ? '/account?required=1' : target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <FlagStripe className="absolute inset-x-0 top-0" />
        <div
          className="pointer-events-none absolute -bottom-40 -right-40 size-[520px] rounded-full border-[56px] border-white/[0.04]"
          aria-hidden
        />
        <div className="flex items-center gap-4">
          <img src="/brand/emblem.png" alt="" className="size-16" />
          <div>
            <div className="text-lg font-semibold">Ministry of Water Development</div>
            <div className="text-sm text-brand-200">Wasaaradda Horumarinta Biyaha</div>
          </div>
        </div>
        <div className="max-w-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-gold-300">NWRMP</div>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight">
            National Water Resource Management Platform
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-100">
            One registry of the country's boreholes, shallow wells, berkads, dams and springs: mapped, monitored and kept
            up to date by the Ministry's departments and regional offices.
          </p>
        </div>
        <p className="text-xs text-brand-300">Government system · Authorised users only · All activity is recorded</p>
      </section>

      {/* Form */}
      <main className="flex flex-col justify-center bg-page px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/brand/emblem.png" alt="" className="size-12" />
            <div className="leading-tight">
              <div className="font-semibold text-ink">Ministry of Water Development</div>
              <div className="text-xs text-ink-3">National Water Resource Management Platform</div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-2">Use the account given to you by the Ministry's ICT department.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} ${borderFor()}`}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} ${borderFor()} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-ink-3 hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={busy || !email || !password} className="w-full">
              <LogIn size={16} aria-hidden /> {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
            Forgotten your password? Ask an administrator to reset it. After five wrong attempts the account is locked
            for 15 minutes.
          </p>
        </div>
      </main>
    </div>
  );
}
