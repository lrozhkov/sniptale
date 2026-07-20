import {
  initDB,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  sanitizeWebSnapshotManifestProvenance,
  sanitizeWebSnapshotPackageProvenance,
} from '../../../features/web-snapshot/provenance';
import type { SaveWebSnapshotMediaAssetInput } from '../media-library/contracts';
import type { WebSnapshotRecord } from './contracts';
import { isWebSnapshotRecord } from './guards';
import { createWebSnapshotMediaEntry, createWebSnapshotThumbnailEntry } from './media-entry';
import { markWebSnapshotProvenanceSanitized } from './provenance-state';

function getWebSnapshotRecordStageMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
}

function createWebSnapshotRecordStageError(stage: string, error: unknown): Error {
  return new Error(`${stage}: ${getWebSnapshotRecordStageMessage(error)}`);
}

async function runWebSnapshotRecordStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw createWebSnapshotRecordStageError(stage, error);
  }
}

function createWebSnapshotRecord(
  id: string,
  input: SaveWebSnapshotMediaAssetInput,
  now: number
): WebSnapshotRecord {
  const createdAt = input.createdAt ?? now;

  return markWebSnapshotProvenanceSanitized({
    id,
    packageBlob: input.packageBlob,
    manifest: sanitizeWebSnapshotManifestProvenance(input.manifest),
    createdAt,
    updatedAt: now,
    size: input.packageBlob.size,
  });
}

export async function saveWebSnapshotMediaAsset(
  input: SaveWebSnapshotMediaAssetInput
): Promise<{ assetId: string; snapshot: WebSnapshotRecord }> {
  const assetId = input.id ?? crypto.randomUUID();
  const now = Date.now();
  const sanitizedPackage = await runWebSnapshotRecordStage(
    'sanitize saved web snapshot package',
    () => sanitizeWebSnapshotPackageProvenance(input.packageBlob, input.manifest)
  );
  const sanitizedInput = {
    ...input,
    manifest: sanitizedPackage.manifest,
    packageBlob: sanitizedPackage.packageBlob,
  };
  const snapshot = createWebSnapshotRecord(assetId, sanitizedInput, now);
  const [mediaEntry, thumbnailEntry] = await Promise.all([
    runWebSnapshotRecordStage('create web snapshot media entry', () =>
      createWebSnapshotMediaEntry({ assetId, input, now, snapshot })
    ),
    runWebSnapshotRecordStage('create web snapshot thumbnail entry', () =>
      createWebSnapshotThumbnailEntry({
        assetId,
        createdAt: snapshot.createdAt,
        screenshotBlob: input.screenshotBlob,
        updatedAt: now,
      })
    ),
  ]);

  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [WEB_SNAPSHOTS_STORE, MEDIA_LIBRARY_STORE, THUMBNAILS_STORE],
      'readwrite'
    );
    await tx.objectStore(WEB_SNAPSHOTS_STORE).put(snapshot);
    await tx.objectStore(MEDIA_LIBRARY_STORE).put(mediaEntry);
    await tx.objectStore(THUMBNAILS_STORE).put(thumbnailEntry);
    await tx.done;
  });

  return { assetId, snapshot };
}

export async function getWebSnapshotRecord(id: string): Promise<WebSnapshotRecord | undefined> {
  const db = await initDB();
  const rawRecord: unknown = await db.get(WEB_SNAPSHOTS_STORE, id);
  return isWebSnapshotRecord(rawRecord) ? rawRecord : undefined;
}
