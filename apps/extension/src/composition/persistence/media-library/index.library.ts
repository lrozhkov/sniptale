import {
  initDB,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { getProjectAsset, getProjectExport } from '../projects/index';
import { readAssetFile, parseAssetRef } from '../assets';
import { getRecording } from '../recordings/index';
import { getWebSnapshotPackageFile } from '../web-snapshots';
import type { MediaLibraryEntry, MediaLibraryItem, MediaThumbnailEntry } from './contracts';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import { parseMediaLibraryEntry, parseMediaThumbnailEntry } from './read-guards';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { listMediaAssetProjectUsage } from './usage';
import type { MediaAssetProjectUsage } from './usage';
import { deleteMediaAssetWithProjectCascade } from './delete-cascade';
import {
  recoverMediaSourcePublications,
  mediaHasPendingPublication,
} from './delete-cascade.sources';
import { MediaAssetDeletionBlockedError } from './deletion-errors';
import { listReadyJournals } from '../assets';

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

  if (entry.source.kind === 'stored-asset') {
    const db = await initDB();
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, entry.source.assetId));
    return ref ? readAssetFile(ref, entry.filename) : undefined;
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
    return getWebSnapshotPackageFile(entry.source.snapshotId);
  }

  const projectAsset = await getProjectAsset(entry.source.projectAssetId);
  if (projectAsset.status === 'ready') return projectAsset.entry.file;
  if (projectAsset.status === 'not-found') return undefined;
  throw new Error(`Project asset ${entry.source.projectAssetId} ${projectAsset.status}.`);
}

async function mutateMediaLibraryEntry(
  assetId: string,
  mutate: (entry: MediaLibraryEntry) => MediaLibraryEntry
): Promise<MediaLibraryEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(MEDIA_LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_LIBRARY_STORE);
    const existing = parseMediaLibraryEntry(await store.get(assetId));
    if (!existing) throw new Error(`Asset ${assetId} не найден.`);
    const nextEntry = mutate(existing);
    if (nextEntry !== existing) await store.put(nextEntry);
    await tx.done;
    return nextEntry;
  });
}

export async function updateMediaLibraryEntry(
  assetId: string,
  patch: Partial<
    Pick<MediaLibraryEntry, 'filename' | 'tags' | 'sourceUrl' | 'sourceTitle' | 'sourceFavicon'>
  >
): Promise<void> {
  await mutateMediaLibraryEntry(assetId, (existing) => ({
    ...existing,
    ...patch,
    ...(patch.sourceUrl === undefined ? {} : { sourceUrl: sanitizeProvenanceUrl(patch.sourceUrl) }),
    ...(patch.sourceFavicon === undefined
      ? {}
      : { sourceFavicon: sanitizeProvenanceUrl(patch.sourceFavicon) }),
    updatedAt: Date.now(),
    tags: patch.tags ?? existing.tags,
  }));
}

export async function addMediaLibraryEntryTags(
  assetId: string,
  tagsToAdd: string[]
): Promise<MediaLibraryEntry> {
  return mutateMediaLibraryEntry(assetId, (existing) => {
    const nextTags = Array.from(new Set([...existing.tags, ...tagsToAdd]));
    if (nextTags.length === existing.tags.length) return existing;
    return { ...existing, tags: nextTags, updatedAt: Date.now() };
  });
}

export async function deleteMediaLibraryAsset(
  assetId: string,
  options: { expectedUsage?: readonly MediaAssetProjectUsage[] } = {}
): Promise<void> {
  const readyJournals = await listReadyJournals();
  const pendingWorkspacePublication = readyJournals.some((journal) =>
    mediaHasPendingPublication(journal, { id: assetId })
  );
  if (pendingWorkspacePublication) {
    throw new MediaLibraryDeleteError(
      assetId,
      'linked-source-cleanup',
      new MediaAssetDeletionBlockedError('pending-publication')
    );
  }
  const db = await initDB();
  const entry = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, assetId));

  if (!entry) {
    return;
  }

  if (readyJournals.some((journal) => mediaHasPendingPublication(journal, entry)))
    throw new MediaLibraryDeleteError(
      assetId,
      'linked-source-cleanup',
      new MediaAssetDeletionBlockedError('pending-publication')
    );

  const consumers = await listMediaAssetProjectUsage(assetId);
  if (consumers.length > 0 && !options.expectedUsage) {
    throw new MediaLibraryDeleteError(
      assetId,
      'linked-source-cleanup',
      new Error('The media asset is still used by projects.')
    );
  }
  try {
    await recoverMediaSourcePublications(entry);
    await deleteMediaAssetWithProjectCascade(assetId, options.expectedUsage ?? []);
  } catch (error) {
    throw new MediaLibraryDeleteError(assetId, 'linked-source-cleanup', error);
  }
}
