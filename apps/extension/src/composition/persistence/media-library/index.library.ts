import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  deleteProjectAsset,
  deleteProjectExport,
  getProjectAsset,
  getProjectExport,
} from '../projects/index';
import { deleteRecording, getRecording } from '../recordings/index';
import { deleteWebSnapshotMediaAsset, getWebSnapshotRecord } from '../web-snapshots';
import type { MediaLibraryEntry, MediaLibraryItem, MediaThumbnailEntry } from './contracts';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseMediaLibraryEntry, parseMediaThumbnailEntry } from './read-guards';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { sanitizeWebSnapshotPackageProvenance } from '../../../features/web-snapshot/provenance';
import { createAggregatePresentationKey } from '../aggregate-presentations';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { removeEditorDocumentOwnership } from '../document-assets';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  listReadyJournals,
} from '../assets';

export { syncLegacyMediaLibrary } from './index.legacy-sync.ts';

type MediaLibraryDeleteFailureStage = 'linked-source-cleanup' | 'media-library-transaction';

export class MediaLibraryDeleteError extends Error {
  constructor(
    public readonly assetId: string,
    public readonly stage: MediaLibraryDeleteFailureStage,
    cause: unknown
  ) {
    super(`Failed to delete media library asset ${assetId} during ${stage}.`, { cause });
    this.name = 'MediaLibraryDeleteError';
  }
}

export async function listMediaLibrary(): Promise<MediaLibraryItem[]> {
  const db = await initDB();
  const [rawEntries, thumbnails] = await Promise.all([
    db.getAll(MEDIA_LIBRARY_STORE),
    listMediaThumbnailIds(),
  ]);
  const entries = parseDbEntries(rawEntries, parseMediaLibraryEntry);
  const thumbnailIds = new Set(thumbnails);

  return entries
    .map(({ blob: _blob, ...entry }) => ({
      ...entry,
      hasThumbnail: thumbnailIds.has(entry.id),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listMediaThumbnailIds(): Promise<string[]> {
  const db = await initDB();
  const thumbnails = (await db.getAllKeys(THUMBNAILS_STORE)) as IDBValidKey[];
  return thumbnails.map((key) => String(key));
}

export async function getMediaLibraryEntry(id: string): Promise<MediaLibraryEntry | undefined> {
  const db = await initDB();
  const entry = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, id));
  return entry ?? undefined;
}

export async function getMediaThumbnail(assetId: string): Promise<MediaThumbnailEntry | undefined> {
  const db = await initDB();
  const entry = parseMediaThumbnailEntry(await db.get(THUMBNAILS_STORE, assetId));
  return entry ?? undefined;
}

export async function saveMediaThumbnail(entry: MediaThumbnailEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(THUMBNAILS_STORE, entry));
}

export async function deleteMediaThumbnail(assetId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(THUMBNAILS_STORE, assetId));
}

export async function getMediaAssetBlob(assetId: string): Promise<Blob | undefined> {
  const entry = await getMediaLibraryEntry(assetId);
  if (!entry) {
    return undefined;
  }

  if (entry.source.kind === 'screenshot') {
    return entry.blob;
  }

  if (entry.source.kind === 'recording') {
    const recording = await getRecording(entry.source.recordingId);
    return recording?.file;
  }

  if (entry.source.kind === 'project-export') {
    const projectExport = await getProjectExport(entry.source.exportId);
    return projectExport?.file;
  }

  if (entry.source.kind === 'web-snapshot') {
    const snapshot = await getWebSnapshotRecord(entry.source.snapshotId);
    if (!snapshot) {
      return undefined;
    }

    const sanitizedPackage = await sanitizeWebSnapshotPackageProvenance(
      snapshot.packageBlob,
      snapshot.manifest
    );
    return sanitizedPackage.packageBlob;
  }

  const projectAsset = await getProjectAsset(entry.source.projectAssetId);
  return projectAsset?.file;
}

export async function updateMediaLibraryEntry(
  assetId: string,
  patch: Partial<
    Pick<MediaLibraryEntry, 'filename' | 'tags' | 'sourceUrl' | 'sourceTitle' | 'sourceFavicon'>
  >
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const existing = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, assetId));

    if (!existing) {
      throw new Error(`Asset ${assetId} не найден.`);
    }

    const updatedAt = Date.now();
    await db.put(MEDIA_LIBRARY_STORE, {
      ...existing,
      ...patch,
      ...(patch.sourceUrl === undefined
        ? {}
        : { sourceUrl: sanitizeProvenanceUrl(patch.sourceUrl) }),
      ...(patch.sourceFavicon === undefined
        ? {}
        : { sourceFavicon: sanitizeProvenanceUrl(patch.sourceFavicon) }),
      updatedAt,
      tags: patch.tags ?? existing.tags,
    });
  });
}

export async function addMediaLibraryEntryTags(
  assetId: string,
  tagsToAdd: string[]
): Promise<MediaLibraryEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const existing = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, assetId));

    if (!existing) {
      throw new Error(`Asset ${assetId} не найден.`);
    }

    const nextTags = Array.from(new Set([...existing.tags, ...tagsToAdd]));
    if (nextTags.length === existing.tags.length) {
      return existing;
    }

    const updatedAt = Date.now();
    const nextEntry = {
      ...existing,
      tags: nextTags,
      updatedAt,
    };
    await db.put(MEDIA_LIBRARY_STORE, nextEntry);
    return nextEntry;
  });
}

export async function deleteMediaLibraryAsset(assetId: string): Promise<void> {
  const pendingWorkspacePublication = (await listReadyJournals()).some(
    (journal) =>
      journal.domain === 'image-workspace' &&
      typeof journal.payload === 'object' &&
      journal.payload !== null &&
      !Array.isArray(journal.payload) &&
      (journal.payload as Record<string, unknown>)['aggregateId'] === assetId
  );
  if (pendingWorkspacePublication) {
    throw new MediaLibraryDeleteError(
      assetId,
      'linked-source-cleanup',
      new Error('Image workspace publication is pending.')
    );
  }
  const db = await initDB();
  const entry = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, assetId));

  if (!entry) {
    return;
  }

  if (entry.source.kind === 'web-snapshot') {
    await deleteWebSnapshotMediaAsset({
      assetId,
      snapshotId: entry.source.snapshotId,
    });
    return;
  }

  try {
    await deleteLinkedMediaSource(entry);
  } catch (error) {
    throw new MediaLibraryDeleteError(assetId, 'linked-source-cleanup', error);
  }
  await deleteMediaLibraryRows(assetId);
}

async function deleteLinkedMediaSource(entry: MediaLibraryEntry): Promise<void> {
  if (entry.source.kind === 'recording') {
    await deleteRecording(entry.source.recordingId);
  } else if (entry.source.kind === 'project-export') {
    await deleteProjectExport(entry.source.exportId);
  } else if (entry.source.kind === 'project-asset') {
    await deleteProjectAsset(entry.source.projectAssetId);
  }
}

async function deleteMediaLibraryRows(assetId: string): Promise<void> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        THUMBNAILS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    try {
      await tx.objectStore(MEDIA_LIBRARY_STORE).delete(assetId);
      await tx.objectStore(THUMBNAILS_STORE).delete(assetId);
      const workspace = parseImageWorkspaceEntry(
        await tx.objectStore(IMAGE_WORKSPACES_STORE).get(assetId)
      );
      if (workspace) {
        await removeEditorDocumentOwnership({
          document: workspace.document,
          ownerId: assetId,
          ownerKind: 'image-workspace',
          physicalDelete,
          stores: {
            owners: tx.objectStore(ASSET_OWNERS_STORE),
            refs: tx.objectStore(ASSET_REFS_STORE),
          },
        });
      }
      await tx.objectStore(IMAGE_WORKSPACES_STORE).delete(assetId);
      await tx
        .objectStore(AGGREGATE_PRESENTATIONS_STORE)
        .delete(createAggregatePresentationKey({ id: assetId, kind: 'image' }));
      if (physicalDelete.assetIds.length > 0) {
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
      await tx.done;
    } catch (error) {
      throw new MediaLibraryDeleteError(assetId, 'media-library-transaction', error);
    }
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}
