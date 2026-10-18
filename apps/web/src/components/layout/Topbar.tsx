import { FlaskRound, Menu } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { SearchInput } from '../ui/Controls';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/sources?q=${encodeURIComponent(q)}` : '/sources');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="-ml-1 grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-page lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <img src="/brand/emblem.png" alt="Ministry of Water Development" className="size-8 lg:hidden" />

        <form onSubmit={submit} role="search" className="min-w-0 flex-1 sm:max-w-md">
          <SearchInput
            value={query}
            onChange={setQuery}
            label="Search water sources"
            placeholder="Search sources by name, code or settlement"
          />
        </form>

        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-medium text-gold-800 ring-1 ring-gold-300/60">
            <FlaskRound size={13} aria-hidden /> Test environment
          </span>
        </div>
      </div>
    </header>
  );
}
