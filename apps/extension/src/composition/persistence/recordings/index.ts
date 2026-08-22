import {
  initDB,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';
import type { RecordingEntry } from './contracts';
import type { StoredRecordingEntry } from './contracts';
import { saveRecordingsBatch } from './batch';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  parseAssetRef,
  readAssetFile,
} from '../assets';
import { RECORDING_ASSET_OWNER_KIND, RECORDING_ASSET_ROLE } from './asset-publication';

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
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        STORE_NAME,
        MEDIA_LIBRARY_STORE,
        RECORDING_TELEMETRY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const entry = parseRecordingEntry(await tx.objectStore(STORE_NAME).get(id));
    let deleteObject = false;
    await tx.objectStore(STORE_NAME).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(createRecordingMediaId(id));
    await tx.objectStore(RECORDING_TELEMETRY_STORE).delete(id);
    if (entry) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete([RECORDING_ASSET_OWNER_KIND, id, RECORDING_ASSET_ROLE]);
      if ((await ownerStore.index('assetId').count(entry.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(entry.assetId);
        deleteObject = true;
        physicalDelete.assetIds.push(entry.assetId);
      }
    }
    if (deleteObject) await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
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
    ({ id, assetId, filename, createdAt, size, mimeType, lifecycle }) => ({
      assetId,
      id,
      filename,
      createdAt,
      size,
      mimeType,
      ...(lifecycle ? { lifecycle } : {}),
      duration: null,
      height: null,
      thumbnailId: createRecordingMediaId(id),
      width: null,
    })
  );
}
