import { deleteUnreferencedMediaSource } from '../media-library/delete-cascade';
import { initDB, ASSET_REFS_STORE, STORE_NAME } from '../infrastructure/indexed-db/core';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';
import type { RecordingEntry } from './contracts';
import type { StoredRecordingEntry } from './contracts';
import { saveRecordingsBatch } from './batch';
import { parseAssetRef, readAssetFile } from '../assets';

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

  if (!entry) return undefined;
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, entry.assetId));
  if (!ref) {
    logger.warn('Recording asset reference is unavailable', {
      assetId: entry.assetId,
      recordingId: id,
    });
    return undefined;
  }
  try {
    return { ...entry, file: await readAssetFile(ref, entry.filename) };
  } catch (error) {
    logger.warn('Recording asset object is unavailable', {
      assetId: entry.assetId,
      recordingId: id,
      error,
    });
    return undefined;
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await deleteUnreferencedMediaSource({
    id: createRecordingMediaId(id),
    source: { kind: 'recording', recordingId: id },
  });
}

export async function listRecordings(): Promise<
  Array<
    StoredRecordingEntry & {
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

  return parsedEntries.entries.map(
    ({
      id,
      assetId,
      filename,
      createdAt,
      size,
      mimeType,
      lifecycle,
      recordingGroup,
      mediaMetadata,
    }) => ({
      assetId,
      id,
      filename,
      createdAt,
      size,
      mimeType,
      ...(lifecycle ? { lifecycle } : {}),
      ...(recordingGroup ? { recordingGroup } : {}),
      duration: mediaMetadata?.duration ?? null,
      height: mediaMetadata?.height ?? null,
      thumbnailId: createRecordingMediaId(id),
      width: mediaMetadata?.width ?? null,
    })
  );
}
