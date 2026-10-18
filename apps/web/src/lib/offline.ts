// Offline support for field work.
//
// 1. A small cache (IndexedDB) of the last assignment list and reference data, so the field
//    officer can open their list and fill in a form without signal.
// 2. An outbox (IndexedDB) of finished inspections, photos included, sent automatically when
//    the connection returns. Every inspection and photo carries an id made on the phone, so a
//    send that was cut off halfway can be repeated safely without creating duplicates.
import { createStore, del, get, set, values } from 'idb-keyval';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, apiPost, apiUpload } from './api';
import type { FieldValue } from './types';

const cacheStore = createStore('nwrmp-cache', 'kv');
const outboxStore = createStore('nwrmp-outbox', 'items');

// ---------------------------------------------------------------- cache

/** Runs the fetcher; when the network is unreachable, returns the last cached result instead. */
export async function withOfflineCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    void set(key, fresh, cacheStore).catch(() => undefined);
    return fresh;
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      const cached = await get<T>(key, cacheStore).catch(() => undefined);
      if (cached !== undefined) return cached;
    }
    throw err;
  }
}

/** Removes cached data and unsent work, e.g. when someone signs out on a shared phone. */
export async function clearOfflineData() {
  const { clear } = await import('idb-keyval');
  await Promise.all([clear(cacheStore), clear(outboxStore)]).catch(() => undefined);
  notify();
}

// ---------------------------------------------------------------- outbox

export interface OutboxPhoto {
  clientId: string;
  blob: Blob;
  caption?: string;
  uploaded?: boolean;
}

export interface OutboxItem {
  clientId: string;
  sourceId: string;
  sourceName: string;
  sourceCode: string;
  assignmentId?: string;
  inspectedOn: string;
  observed: Record<string, FieldValue | string>;
  gps?: { lat: number; lng: number; accuracy: number };
  notes?: string;
  photos: OutboxPhoto[];
  createdAt: string;
  /** Server id once the inspection has been created */
  serverId?: string;
  status: 'waiting' | 'sending' | 'needs_attention';
  error?: string;
  /** Per-field messages when the server rejected the values */
  fieldErrors?: Record<string, string>;
}

const listeners = new Set<() => void>();
let syncing = false;
let version = 0;

function notify() {
  version++;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function addToOutbox(item: OutboxItem) {
  await set(item.clientId, item, outboxStore);
  notify();
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await values<OutboxItem>(outboxStore).catch(() => []);
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function discardOutboxItem(clientId: string) {
  await del(clientId, outboxStore);
  notify();
}

/**
 * Sends everything in the outbox. Stops at the first network failure (no signal) and keeps
 * the rest for later; items the server rejects are marked "needs attention" with the reason.
 */
export async function syncOutbox(onSent?: () => void): Promise<{ sent: number; failed: number }> {
  if (syncing || !navigator.onLine) return { sent: 0, failed: 0 };
  syncing = true;
  notify();
  let sent = 0;
  let failed = 0;
  try {
    for (const item of await listOutbox()) {
      if (item.status === 'needs_attention') continue;
      const save = async (changes: Partial<OutboxItem>) => {
        Object.assign(item, changes);
        await set(item.clientId, item, outboxStore);
        notify();
      };
      try {
        await save({ status: 'sending', error: undefined, fieldErrors: undefined });
        if (!item.serverId) {
          const created = await apiPost<{ id: string; state: string }>('/inspections', {
            clientId: item.clientId,
            sourceId: item.sourceId,
            assignmentId: item.assignmentId,
            inspectedOn: item.inspectedOn,
            observed: item.observed,
            gps: item.gps,
            notes: item.notes,
          });
          await save({ serverId: created.id });
          if (created.state === 'submitted' || created.state === 'approved') {
            await discardOutboxItem(item.clientId);
            sent++;
            continue;
          }
        }
        for (const photo of item.photos) {
          if (photo.uploaded) continue;
          const form = new FormData();
          form.append('file', photo.blob, `${photo.clientId}.jpg`);
          form.append('clientId', photo.clientId);
          if (photo.caption) form.append('caption', photo.caption);
          await apiUpload(`/inspections/${item.serverId}/photos`, form);
          photo.uploaded = true;
          await save({ photos: item.photos });
        }
        await apiPost(`/inspections/${item.serverId}/submit`);
        await discardOutboxItem(item.clientId);
        sent++;
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          await save({ status: 'waiting' });
          break; // offline again: try later
        }
        if (err instanceof ApiError && err.status === 401) {
          await save({ status: 'waiting', error: 'Sign in again to send this inspection' });
          break;
        }
        if (err instanceof ApiError && err.status === 409 && /already been submitted/i.test(err.message)) {
          await discardOutboxItem(item.clientId);
          sent++;
          continue;
        }
        failed++;
        const detail = err instanceof ApiError ? [err.message, ...Object.values(err.fieldErrors)].join(' · ') : 'Could not send';
        await save({
          status: err instanceof ApiError && err.status >= 500 ? 'waiting' : 'needs_attention',
          error: detail,
          fieldErrors: err instanceof ApiError ? err.fieldErrors : undefined,
        });
      }
    }
  } finally {
    syncing = false;
    notify();
    if (sent) onSent?.();
  }
  return { sent, failed };
}

/** Live view of the outbox for React components. */
export function useOutbox() {
  const v = useSyncExternalStore(subscribe, () => version);
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    void listOutbox().then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [v]);
  return { items, syncing };
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

export async function getOutboxItem(clientId: string): Promise<OutboxItem | undefined> {
  return get<OutboxItem>(clientId, outboxStore).catch(() => undefined);
}
