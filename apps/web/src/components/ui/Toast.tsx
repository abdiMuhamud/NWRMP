import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

/** `pinned` stays at the bottom of the stack until it removes itself (e.g. the update banner). */
export function ToastProvider({ children, pinned }: { children: ReactNode; pinned?: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-float"
          >
            {t.tone === 'success' ? (
              <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#4cd04c]" aria-hidden />
            ) : (
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#ff8a8a]" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="-mr-1 grid size-6 place-items-center rounded text-white/60 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {pinned}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
