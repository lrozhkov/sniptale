import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  EDITOR_SESSIONS_STORE,
  MEDIA_LIBRARY_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseEditorSessionEntry } from './index.guards.ts';
import type { EditorSessionEntry } from './contracts';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';
import { createLibraryLifecycle, updateLibraryLifecycle } from '../library-lifecycle/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';

const logger = createLogger({ namespace: 'SharedEditorSessionsDb' });

export interface SaveEditorSessionDraftInput {
  sessionId: string;
  document: EditorDocument;
  assetId?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  dirty?: boolean;
  storageClass?: LibraryStorageClass;
}

/**
 * Persists the latest durable editor draft snapshot for one logical editor tab session.
 */
export async function saveEditorSessionDraft(
  input: SaveEditorSessionDraftInput
): Promise<EditorSessionEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([EDITOR_SESSIONS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    const editorStore = tx.objectStore(EDITOR_SESSIONS_STORE);
    const rawExisting: unknown = await editorStore.get(input.sessionId);
    const existing = parseEditorSessionEntry(rawExisting);
    const now = Date.now();

    if (!existing && rawExisting !== undefined) {
      logger.warn('Ignoring invalid editor session entry from IndexedDB', {
        sessionId: input.sessionId,
      });
    }

    const assetId = input.assetId ?? existing?.assetId ?? null;
    const linkedMedia = assetId
      ? parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(assetId))
      : null;
    const entry: EditorSessionEntry = {
      sessionId: input.sessionId,
      document: input.document,
      assetId,
      sourceUrl:
        input.sourceUrl === undefined
          ? sanitizeProvenanceUrl(existing?.sourceUrl)
          : sanitizeProvenanceUrl(input.sourceUrl),
      sourceTitle: input.sourceTitle ?? existing?.sourceTitle ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dirty: input.dirty ?? existing?.dirty ?? true,
      lifecycle: existing
        ? updateLibraryLifecycle(
            existing.lifecycle ??
              createLibraryLifecycle(existing.assetId === null ? 'temporary' : 'library', now),
            now
          )
        : linkedMedia?.lifecycle
          ? updateLibraryLifecycle(linkedMedia.lifecycle, now)
          : createLibraryLifecycle(input.storageClass ?? 'temporary', now),
    };

    await editorStore.put(entry);
    await tx.done;
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

export async function listEditorSessionDrafts(): Promise<EditorSessionEntry[]> {
  const db = await initDB();
  const entries = await db.getAll(EDITOR_SESSIONS_STORE);
  return entries
    .map(parseEditorSessionEntry)
    .filter((entry): entry is EditorSessionEntry => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * Deletes the persisted draft snapshot for one logical editor tab session.
 */
export async function deleteEditorSessionDraft(sessionId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(EDITOR_SESSIONS_STORE, sessionId));
}
