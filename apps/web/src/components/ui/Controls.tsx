import { ChevronDown, Search, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}

export function Select({ label, hideLabel, onChange, children, className = '', ...rest }: SelectProps) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className={hideLabel ? 'sr-only' : 'text-xs font-medium text-ink-2'}>{label}</span>
      <span className="relative">
        <select
          {...rest}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface pl-3 pr-9 text-sm text-ink transition hover:border-ink-3 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/15"
        >
          {children}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      </span>
    </label>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className = '' }: SearchInputProps) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 transition hover:border-ink-3 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-page hover:text-ink"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-page p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            o.value === value ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const styles = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-card',
    secondary: 'border border-line-strong bg-surface text-ink hover:bg-page',
    ghost: 'text-ink-2 hover:bg-page hover:text-ink',
  };
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
