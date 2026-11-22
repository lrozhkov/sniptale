import { captureMediaInTransaction } from '../sync-capture/capture';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  ASSET_OWNERS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  SYNC_CAPTURE_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
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
import {
  isCollectableProjectOriginal,
  parseMediaLibraryEntry,
  parseMediaThumbnailEntry,
} from './read-guards';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  listMediaAssetProjectUsage,
  MEDIA_PROJECT_USAGE_STORES,
  readMediaProjectUsageInTransaction,
} from './usage';
import type { MediaAssetProjectUsage } from './usage';
import { deleteMediaAssetWithProjectCascade } from './delete-cascade';
import { mediaHasPendingPublication } from './delete-cascade.sources';
import { MediaAssetDeletionBlockedError } from './deletion-errors';
import { readAssetReadyPublicationClaims } from '../assets/opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransition,
} from '../infrastructure/mutation-barrier';

export { syncLegacyMediaLibrary } from './index.legacy-sync.ts';

const MEDIA_CAPTURE_STORES = [
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  ASSET_OWNERS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  SYNC_CAPTURE_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
] as const;

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

export async function listMediaLibrary(
  options: { includeProjectRetained?: boolean } = {}
): Promise<MediaLibraryItem[]> {
  const db = await initDB();
  const [rawEntries, thumbnails] = await Promise.all([
    db.getAll(MEDIA_LIBRARY_STORE),
    listMediaThumbnailIds(),
  ]);
  const entries = parseDbEntries(rawEntries, parseMediaLibraryEntry);
  const thumbnailIds = new Set(thumbnails);

  return entries
    .filter((entry) => options.includeProjectRetained || entry.savedIndependently !== false)
    .map(({ blob: _blob, ...entry }) => ({
      ...entry,
      hasThumbnail: thumbnailIds.has(entry.id),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Discover recovery candidates without loading thumbnails or project documents. */
export async function listCollectableProjectOriginalIds(signal: AbortSignal): Promise<string[]> {
  const db = await initDB();
  const pageSize = 64;
  const ids: string[] = [];
  let range: IDBKeyRange | undefined;
  while (!signal.aborted) {
    const tx = db.transaction(MEDIA_LIBRARY_STORE, 'readonly');
    const [rows, keys]: [unknown[], IDBValidKey[]] = await Promise.all([
      tx.store.getAll(range, pageSize),
      tx.store.getAllKeys(range, pageSize),
    ]);
    await tx.done;
    for (const row of rows) {
      const entry = parseMediaLibraryEntry(row);
      if (entry && isCollectableProjectOriginal(entry)) ids.push(entry.id);
    }
    const lastKey = keys.at(-1);
    if (keys.length < pageSize || lastKey === undefined) break;
    // Later pages and removals can interleave with ordinary library mutations.
    range = IDBKeyRange.lowerBound(lastKey, true);
  }
  return ids;
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
    const tx = db.transaction([...MEDIA_CAPTURE_STORES], 'readwrite');
    try {
      const store = tx.objectStore(MEDIA_LIBRARY_STORE);
      const existing = parseMediaLibraryEntry(await store.get(assetId));
      if (!existing) throw new Error(`Asset ${assetId} не найден.`);
      const nextEntry = mutate(existing);
      if (nextEntry !== existing) {
        await store.put(nextEntry);
        await captureMediaInTransaction(tx, assetId);
      }
      await tx.done;
      return nextEntry;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
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

/** Change visibility on the accepted original without opening or saving a project. */
export async function setMediaLibraryOriginalClaim(
  expected: {
    id: string;
    createdAt: number;
    lifecycleUpdatedAt: number;
    originalSaveId: string | null;
  },
  savedIndependently: boolean
): Promise<boolean> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [...new Set([...MEDIA_PROJECT_USAGE_STORES, ...MEDIA_CAPTURE_STORES])],
      'readwrite'
    );
    try {
      const store = tx.objectStore(MEDIA_LIBRARY_STORE);
      const raw: unknown = await store.get(expected.id);
      const original = parseMediaLibraryEntry(raw);
      if (
        !isRecord(raw) ||
        !original ||
        original.id !== expected.id ||
        original.createdAt !== expected.createdAt ||
        (original.lifecycle?.updatedAt ?? original.updatedAt) !== expected.lifecycleUpdatedAt
      )
        throw new Error('The original changed.');
      if (!isCollectableProjectOriginal({ ...original, savedIndependently: false }))
        throw new Error('The original is unavailable.');
      const changed = (original.savedIndependently !== false) !== savedIndependently;
      if (
        (!savedIndependently || changed) &&
        (original.originalSaveId ?? null) !== expected.originalSaveId
      )
        throw new Error('The original changed.');
      if (!changed) {
        await tx.done;
        return false;
      }
      if (
        !savedIndependently &&
        !(await readMediaProjectUsageInTransaction(tx, original, { includeHistory: true })).length
      )
        throw new Error('No project retains this original.');
      await store.put({
        ...raw,
        savedIndependently,
        ...(savedIndependently ? { originalSaveId: crypto.randomUUID() } : {}),
      });
      await captureMediaInTransaction(tx, original.id, { checkpoint: 'freeze' });
      await tx.done;
      return true;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

export async function deleteMediaLibraryAsset(
  assetId: string,
  options: { expectedUsage?: readonly MediaAssetProjectUsage[]; projectRetainedOnly?: boolean } = {}
): Promise<void> {
  const db = await initDB();
  try {
    await runWithPersistenceMutationTransition(() =>
      runWithDurableAssetLifecycleLock(async (permit) => {
        const entry = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, assetId));
        if (options.projectRetainedOnly && !isCollectableProjectOriginal(entry)) return;
        // Missing roots still have pending image/sync media-ID claims that can publish later.
        const target = entry ?? { id: assetId };
        const claims = await readAssetReadyPublicationClaims(target, permit);
        if (
          !claims.valid ||
          claims.pending ||
          claims.journals.some((journal) => mediaHasPendingPublication(journal, target))
        )
          throw new MediaAssetDeletionBlockedError('pending-publication');
        if (!entry) return;
        const consumers = await listMediaAssetProjectUsage(assetId);
        if (options.projectRetainedOnly && consumers.length > 0) return;
        if (consumers.length > 0 && !options.expectedUsage)
          throw new Error('The media asset is still used by projects.');
        if (options.projectRetainedOnly) {
          await deleteMediaAssetWithProjectCascade(assetId, [], permit, true);
        } else {
          await deleteMediaAssetWithProjectCascade(assetId, options.expectedUsage ?? [], permit);
        }
      })
    );
  } catch (error) {
    throw new MediaLibraryDeleteError(assetId, 'linked-source-cleanup', error);
  }
}
