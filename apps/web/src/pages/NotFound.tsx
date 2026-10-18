import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <img src="/brand/emblem.png" alt="" className="size-16 opacity-90" />
      <h1 className="mt-6 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-2">The page you are looking for does not exist or has moved.</p>
      <Link to="/" className="mt-6 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
        Go to the dashboard
      </Link>
    </div>
  );
}
