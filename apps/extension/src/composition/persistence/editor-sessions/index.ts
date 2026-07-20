import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { EDITOR_SESSIONS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseEditorSessionEntry } from './index.guards.ts';
import type { EditorSessionEntry } from './contracts';

const EDITOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EDITOR_SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const logger = createLogger({ namespace: 'SharedEditorSessionsDb' });
let lastEditorSessionCleanupAt = 0;

export interface SaveEditorSessionDraftInput {
  sessionId: string;
  document: EditorDocument;
  assetId?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  dirty?: boolean;
}

async function cleanupExpiredEditorSessionDrafts(
  db: Awaited<ReturnType<typeof initDB>>
): Promise<void> {
  const cutoff = Date.now() - EDITOR_SESSION_TTL_MS;
  const tx = db.transaction(EDITOR_SESSIONS_STORE, 'readwrite');
  const index = tx.store.index('updatedAt');
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

async function maybeCleanupExpiredEditorSessionDrafts(
  db: Awaited<ReturnType<typeof initDB>>,
  now: number
): Promise<void> {
  if (now - lastEditorSessionCleanupAt < EDITOR_SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  await cleanupExpiredEditorSessionDrafts(db);
  lastEditorSessionCleanupAt = now;
}

/**
 * Persists the latest durable editor draft snapshot for one logical editor tab session.
 */
export async function saveEditorSessionDraft(
  input: SaveEditorSessionDraftInput
): Promise<EditorSessionEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const rawExisting: unknown = await db.get(EDITOR_SESSIONS_STORE, input.sessionId);
    const existing = parseEditorSessionEntry(rawExisting);
    const now = Date.now();

    if (!existing && rawExisting !== undefined) {
      logger.warn('Ignoring invalid editor session entry from IndexedDB', {
        sessionId: input.sessionId,
      });
    }

    await maybeCleanupExpiredEditorSessionDrafts(db, now);

    const entry: EditorSessionEntry = {
      sessionId: input.sessionId,
      document: input.document,
      assetId: input.assetId ?? existing?.assetId ?? null,
      sourceUrl:
        input.sourceUrl === undefined
          ? sanitizeProvenanceUrl(existing?.sourceUrl)
          : sanitizeProvenanceUrl(input.sourceUrl),
      sourceTitle: input.sourceTitle ?? existing?.sourceTitle ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dirty: input.dirty ?? existing?.dirty ?? true,
    };

    await db.put(EDITOR_SESSIONS_STORE, entry);
    return entry;
  });
}

/**
 * Restores a persisted editor draft snapshot for one logical editor tab session.
 */
export async function getEditorSessionDraft(
  sessionId: string
): Promise<EditorSessionEntry | undefined> {
  const db = await initDB();
  const rawEntry: unknown = await db.get(EDITOR_SESSIONS_STORE, sessionId);
  const entry = parseEditorSessionEntry(rawEntry);

  if (!entry && rawEntry !== undefined) {
    logger.warn('Ignoring invalid editor session entry from IndexedDB', {
      sessionId,
    });
  }

  return entry ?? undefined;
}

/**
 * Deletes the persisted draft snapshot for one logical editor tab session.
 */
export async function deleteEditorSessionDraft(sessionId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(EDITOR_SESSIONS_STORE, sessionId));
}
