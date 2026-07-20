import {
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { createLogger } from '@sniptale/platform/observability/logger';
import { collectReferencedRecordingIdReferences } from '../../../features/media-hub/references';
import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';
import type { RecordingEntry } from './contracts';

const logger = createLogger({ namespace: 'SharedRecordingsDb' });
type RecordingCleanupCursor = { delete: () => Promise<void> };
type RecordingCleanupReferenceReader = { getAll: (storeName: string) => Promise<unknown[]> };
type RecordingCleanupStore = { delete: (key: IDBValidKey) => Promise<unknown> };

function readProjectReferenceFromEntry(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) {
    return entry;
  }

  return 'project' in entry ? entry.project : entry;
}

async function loadReferencedRecordingIdsForCleanup(
  db: RecordingCleanupReferenceReader
): Promise<Set<string>> {
  const [mediaEntries, projectExports, projectEntries] = await Promise.all([
    db.getAll(MEDIA_LIBRARY_STORE),
    db.getAll(PROJECT_EXPORTS_STORE),
    db.getAll(VIDEO_PROJECTS_STORE),
  ]);
  const { invalidReferenceCount, recordingIds } = collectReferencedRecordingIdReferences({
    mediaEntries,
    projectExports,
    projects: projectEntries.map(readProjectReferenceFromEntry),
  });

  if (invalidReferenceCount > 0) {
    logger.warn('Ignoring malformed recording cleanup reference rows', {
      invalidReferenceCount,
    });
  }

  return recordingIds;
}

export async function saveRecording(id: string, blob: Blob, filename: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const entry: RecordingEntry = {
      id,
      blob,
      filename,
      createdAt: Date.now(),
      size: blob.size,
    };
    const tx = db.transaction([STORE_NAME, MEDIA_LIBRARY_STORE], 'readwrite');

    await tx.objectStore(STORE_NAME).put(entry);
    await tx.objectStore(MEDIA_LIBRARY_STORE).put(buildRecordingMediaEntry(entry));
    await tx.done;
  });
}

export async function getRecording(id: string): Promise<RecordingEntry | undefined> {
  const db = await initDB();
  const rawEntry: unknown = await db.get(STORE_NAME, id);
  const entry = parseRecordingEntry(rawEntry);

  if (!entry && rawEntry !== undefined) {
    logger.warn('Ignoring invalid recording entry from IndexedDB', {
      recordingId: id,
    });
  }

  return entry ?? undefined;
}

export async function deleteRecording(id: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [STORE_NAME, MEDIA_LIBRARY_STORE, RECORDING_TELEMETRY_STORE],
      'readwrite'
    );

    await tx.objectStore(STORE_NAME).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(createRecordingMediaId(id));
    await tx.objectStore(RECORDING_TELEMETRY_STORE).delete(id);
    await tx.done;
  });
}

export async function listRecordings(): Promise<
  Array<
    Omit<RecordingEntry, 'blob'> & {
      duration: number | null;
      height: number | null;
      mimeType: string;
      thumbnailId: string;
      width: number | null;
    }
  >
> {
  const db = await initDB();
  const rawEntries: unknown = await db.getAll(STORE_NAME);
  const parsedEntries = parseRecordingEntries(rawEntries);

  if (parsedEntries.hasInvalidRoot) {
    logger.warn('Ignoring invalid recordings list root from IndexedDB');
  }

  if (parsedEntries.invalidEntryCount > 0) {
    logger.warn('Dropped invalid recording entries from IndexedDB list', {
      invalidEntryCount: parsedEntries.invalidEntryCount,
    });
  }

  return parsedEntries.entries.map(({ id, filename, createdAt, size, blob }) => ({
    id,
    filename,
    createdAt,
    size,
    mimeType: blob.type || 'video/webm',
    duration: null,
    height: null,
    thumbnailId: createRecordingMediaId(id),
    width: null,
  }));
}

async function deleteRecordingCleanupEntry(args: {
  cutoff: number;
  cursor: RecordingCleanupCursor;
  deletedCount: number;
  maxAgeDays: number;
  mediaStore: RecordingCleanupStore;
  recordingId: string;
  telemetryStore: RecordingCleanupStore;
}) {
  try {
    await args.mediaStore.delete(createRecordingMediaId(args.recordingId));
    await args.telemetryStore.delete(args.recordingId);
    await args.cursor.delete();
  } catch (error) {
    logger.error('Recording cleanup stopped after partial delete failure', {
      cutoff: args.cutoff,
      deletedCount: args.deletedCount,
      failedRecordingId: args.recordingId,
      maxAgeDays: args.maxAgeDays,
    });
    throw error;
  }
}

export async function cleanupOldRecordings(maxAgeDays = 7): Promise<number> {
  return runWithIndexedDbMutation(async (db) => {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const referencedRecordingIds = await loadReferencedRecordingIdsForCleanup(db);
    const tx = db.transaction(
      [STORE_NAME, MEDIA_LIBRARY_STORE, RECORDING_TELEMETRY_STORE],
      'readwrite'
    );
    const index = tx.objectStore(STORE_NAME).index('createdAt');
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const telemetryStore = tx.objectStore(RECORDING_TELEMETRY_STORE);

    let deleted = 0;
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    while (cursor) {
      const recordingId = String(cursor.primaryKey);
      if (referencedRecordingIds.has(recordingId)) {
        cursor = await cursor.continue();
        continue;
      }

      await deleteRecordingCleanupEntry({
        cutoff,
        cursor,
        deletedCount: deleted,
        maxAgeDays,
        mediaStore,
        recordingId,
        telemetryStore,
      });
      deleted += 1;

      cursor = await cursor.continue();
    }

    await tx.done;
    return deleted;
  });
}
