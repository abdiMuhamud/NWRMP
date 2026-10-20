import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** false: Escape, a click outside and the close button do nothing; only the footer closes it. */
  dismissible?: boolean;
}

/** Modal built on the native <dialog> element: focus trapping and Escape handling come from the browser. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => !dismissible && e.preventDefault()}
      onClick={(e) => dismissible && e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40 backdrop:backdrop-blur-[1px]`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-page hover:text-ink"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
