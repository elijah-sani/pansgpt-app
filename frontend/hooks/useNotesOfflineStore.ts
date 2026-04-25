'use client';

/**
 * useNotesOfflineStore
 *
 * Offline-first IndexedDB layer for PDF viewer notes.
 * Uses the native indexedDB API — no extra dependency required.
 *
 * Key scheme
 * ----------
 *   notes:{documentId}   →  PDFNote[]                   (read cache)
 *   notes:queue          →  QueuedOp[]                   (pending writes)
 *
 * Lifecycle
 * ---------
 *   1. After a successful online notes fetch → persist to IDB.
 *   2. On offline note save/delete/update → push to write queue, optimistically
 *      update the local IDB cache.
 *   3. On reconnect (detected by the `isOnline` arg going true) → flush the
 *      queue to the real API in FIFO order, then update IDB cache.
 */

import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PDFNote {
  id: string;
  document_id: string;
  image_base64: string;
  ai_explanation: string | null;
  category: string | null;
  page_number: number | null;
  user_annotation: string | null;
  created_at: string;
}

type QueuedOp =
  | { op: 'save'; tempId: string; documentId: string; payload: Record<string, unknown> }
  | { op: 'delete'; noteId: string; documentId: string }
  | { op: 'update'; noteId: string; documentId: string; payload: { user_annotation: string } };

// ── IDB helpers (no library required) ───────────────────────────────────────

const DB_NAME = 'pansgpt-offline';
const DB_VERSION = 1;
const STORE = 'keyval';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IDB failures are non-fatal — offline store is best-effort
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Persist notes for a document to IDB (called after a successful online fetch). */
export async function cacheNotes(documentId: string, notes: PDFNote[]): Promise<void> {
  await idbSet(`notes:${documentId}`, notes);
}

/** Read cached notes from IDB for a given document. Returns [] if nothing cached. */
export async function getCachedNotes(documentId: string): Promise<PDFNote[]> {
  return (await idbGet<PDFNote[]>(`notes:${documentId}`)) ?? [];
}

/** Append a pending write op to the queue. */
async function enqueueOp(op: QueuedOp): Promise<void> {
  const queue = (await idbGet<QueuedOp[]>('notes:queue')) ?? [];
  queue.push(op);
  await idbSet('notes:queue', queue);
}

/** Remove a flushed op from the queue by index. */
async function dequeueOp(index: number): Promise<void> {
  const queue = (await idbGet<QueuedOp[]>('notes:queue')) ?? [];
  queue.splice(index, 1);
  await idbSet('notes:queue', queue);
}

// ── Queue flush ──────────────────────────────────────────────────────────────

/**
 * Attempt to flush all pending write ops to the real API.
 * Runs in FIFO order; stops on the first network error and leaves
 * remaining ops in the queue for the next reconnect.
 */
export async function flushNotesQueue(): Promise<void> {
  const queue = (await idbGet<QueuedOp[]>('notes:queue')) ?? [];
  if (queue.length === 0) return;

  // Work through a snapshot of the queue; indices shift as we dequeue
  let offset = 0;
  for (let i = 0; i < queue.length; i++) {
    const op = queue[i];
    try {
      if (op.op === 'save') {
        const res = await api.fetch('/notes', {
          method: 'POST',
          body: JSON.stringify(op.payload),
        });
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
        const saved: PDFNote = await res.json();
        // Replace the tempId entry in the IDB cache with the real note
        const cached = (await idbGet<PDFNote[]>(`notes:${op.documentId}`)) ?? [];
        const updated = cached.map((n) => (n.id === op.tempId ? saved : n));
        await idbSet(`notes:${op.documentId}`, updated);
      } else if (op.op === 'delete') {
        const res = await api.fetch(`/notes/${op.noteId}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
      } else if (op.op === 'update') {
        const res = await api.fetch(`/notes/${op.noteId}`, {
          method: 'PATCH',
          body: JSON.stringify(op.payload),
        });
        if (!res.ok) throw new Error(`update failed: ${res.status}`);
        const saved: PDFNote = await res.json();
        const cached = (await idbGet<PDFNote[]>(`notes:${op.documentId}`)) ?? [];
        const updated = cached.map((n) => (n.id === op.noteId ? saved : n));
        await idbSet(`notes:${op.documentId}`, updated);
      }
      await dequeueOp(i - offset);
      offset++;
    } catch {
      // Leave remaining ops in queue; try again on next reconnect
      break;
    }
  }
}

// ── Offline write helpers ─────────────────────────────────────────────────────

/** Queue a note save while offline and optimistically update the IDB cache. */
export async function offlineSaveNote(
  documentId: string,
  payload: Record<string, unknown>
): Promise<PDFNote> {
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const optimisticNote: PDFNote = {
    id: tempId,
    document_id: documentId,
    image_base64: (payload.image_base64 as string) ?? '',
    ai_explanation: null,
    category: 'Key Point',
    page_number: (payload.page_number as number | null) ?? null,
    user_annotation: (payload.user_annotation as string | null) ?? null,
    created_at: new Date().toISOString(),
  };

  // Update cache optimistically
  const cached = await getCachedNotes(documentId);
  await cacheNotes(documentId, [...cached, optimisticNote]);

  // Enqueue the real API call
  await enqueueOp({ op: 'save', tempId, documentId, payload });
  return optimisticNote;
}

/** Queue a note delete while offline and optimistically update the IDB cache. */
export async function offlineDeleteNote(documentId: string, noteId: string): Promise<void> {
  const cached = await getCachedNotes(documentId);
  await cacheNotes(documentId, cached.filter((n) => n.id !== noteId));
  await enqueueOp({ op: 'delete', noteId, documentId });
}

/** Queue a note update while offline and optimistically update the IDB cache. */
export async function offlineUpdateNote(
  documentId: string,
  noteId: string,
  userAnnotation: string
): Promise<void> {
  const cached = await getCachedNotes(documentId);
  await cacheNotes(
    documentId,
    cached.map((n) => (n.id === noteId ? { ...n, user_annotation: userAnnotation } : n))
  );
  await enqueueOp({ op: 'update', noteId, documentId, payload: { user_annotation: userAnnotation } });
}

// ── Hook: auto-flush on reconnect ─────────────────────────────────────────────

/**
 * Call this hook once in the notes panel (or any parent component).
 * Automatically flushes the queue when `isOnline` transitions false → true.
 */
export function useNotesQueueFlush(isOnline: boolean): void {
  const wasOnlineRef = useRef(isOnline);

  const flush = useCallback(async () => {
    try {
      await flushNotesQueue();
    } catch {
      // Flush is best-effort; errors are handled inside flushNotesQueue
    }
  }, []);

  useEffect(() => {
    const wasOffline = !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      // Just came back online — flush any queued writes
      void flush();
    }
  }, [isOnline, flush]);
}
