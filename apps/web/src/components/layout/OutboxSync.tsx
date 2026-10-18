import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { syncOutbox, useOnline, useOutbox } from '../../lib/offline';

/** Sends saved inspections in the background: on start, when the connection returns, and every 30 s. */
export function OutboxSync() {
  const online = useOnline();
  const { items } = useOutbox();
  const queryClient = useQueryClient();
  const waiting = items.some((i) => i.status === 'waiting');

  useEffect(() => {
    if (!online || !waiting) return;
    const refresh = () => {
      for (const key of ['assignments', 'inspections']) queryClient.invalidateQueries({ queryKey: [key] });
    };
    void syncOutbox(refresh);
    const timer = window.setInterval(() => void syncOutbox(refresh), 30_000);
    return () => window.clearInterval(timer);
  }, [online, waiting, queryClient]);

  return null;
}
