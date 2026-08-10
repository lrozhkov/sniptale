import {
  initDB,
  MEDIA_LIBRARY_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';
import type { RecordingEntry } from './contracts';
import { saveRecordingsBatch } from './batch';

export { saveRecordingsBatch, saveRecordingsBatchWithCompletion } from './batch';
export type { SaveRecordingBatchInput } from './batch';

const logger = createLogger({ namespace: 'SharedRecordingsDb' });

export async function saveRecording(id: string, blob: Blob, filename: string): Promise<void> {
  await saveRecordingsBatch([{ id, blob, filename }]);
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
