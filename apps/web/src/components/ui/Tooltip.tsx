import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Pointer-following tooltip for chart marks. Content stays in text colours, never the series colour. */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);

  const bind = useCallback(
    (content: ReactNode) => ({
      onMouseMove: (e: MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
      onMouseLeave: () => setTip(null),
    }),
    [],
  );

  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-64 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white shadow-float"
      style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 272)), top: tip.y + 14 }}
    >
      {tip.content}
    </div>
  ) : null;

  return { bind, node };
}
