import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { listMediaLibrary } from '../media-library';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { listVideoProjectEntries } from '../projects';
import { parseProjectAssetEntry, parseVideoProjectEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { removeEditorDocumentOwnership } from '../document-assets';
import type { LocalStoragePolicy } from '../../../contracts/settings';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { getDraftRetentionMs } from './policy';
import { collectVideoProjectReferences } from './references';
import { repairLinkedRecordingLifecycles } from './project-recordings';
import { repairTemporaryProjectLifecycles } from './project-retention';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import {
  RECORDING_ASSET_OWNER_KIND,
  RECORDING_ASSET_ROLE,
  recoverRecordingAssetPublications,
} from '../recordings/asset-publication';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
  recoverProjectMediaPublications,
} from '../projects/asset-publication';
import { recoverImageWorkspacePublications } from '../image-aggregates/mutations';

export interface DraftCleanupResult {
  deletedCount: number;
  deletedIds: string[];
}

function isExpired(updatedAt: number, retentionMs: number | null, now: number): boolean {
  return retentionMs !== null && updatedAt <= now - retentionMs;
}

export async function cleanupDrafts(args: {
  policy: LocalStoragePolicy;
  includeUnexpired?: boolean;
  now?: number;
}): Promise<DraftCleanupResult> {
  await recoverRecordingAssetPublications();
  await recoverProjectMediaPublications();
  await recoverImageWorkspacePublications();
  const now = args.now ?? Date.now();
  await repairTemporaryProjectLifecycles(now);
  await repairLinkedRecordingLifecycles(now);
  const ordinaryRetention = getDraftRetentionMs(args.policy, 'ordinary');
  const videoRetention = getDraftRetentionMs(args.policy, 'video');
  const [media, videoProjects] = await Promise.all([listMediaLibrary(), listVideoProjectEntries()]);
  const deletedIds: string[] = [];
  const referencedMediaIds = new Set<string>();
  const referencedRecordingIds = new Set<string>();
  for (const project of videoProjects) {
    const refs = collectVideoProjectReferences(project);
    for (const id of refs.recordingIds) referencedRecordingIds.add(id);
    for (const id of refs.projectAssetIds) referencedMediaIds.add(createProjectAssetMediaId(id));
    for (const id of refs.libraryMediaIds) referencedMediaIds.add(id);
  }

  const includeUnexpired = Boolean(args.includeUnexpired);
  for (const entry of media) {
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.trashedAt !== undefined || lifecycle.storageClass !== 'temporary')
      continue;
    if (referencedMediaIds.has(entry.id)) continue;
    if (entry.source.kind === 'recording' && referencedRecordingIds.has(entry.source.recordingId)) {
      continue;
    }
    const retention = entry.source.kind === 'recording' ? videoRetention : ordinaryRetention;
    if (!includeUnexpired && !isExpired(lifecycle.updatedAt, retention, now)) continue;
    if (await deleteExpiredMedia(entry.id, now, retention, includeUnexpired)) {
      deletedIds.push(entry.id);
    }
  }

  return { deletedCount: deletedIds.length, deletedIds };
}

type ParsedMediaEntry = NonNullable<ReturnType<typeof parseMediaLibraryEntry>>;
type CleanupReadStore = { get(key: string): Promise<unknown>; getAll(): Promise<unknown[]> };
type CleanupDeleteStore = { delete(key: IDBValidKey): Promise<unknown> };
type CleanupMutableStore = CleanupReadStore & CleanupDeleteStore;
type CleanupOwnerStore = CleanupDeleteStore & {
  index(name: 'assetId'): { count(assetId: string): Promise<number> };
};

async function unlinkRecordingAsset(args: {
  operation: PhysicalDeleteAssetOperation;
  ownerStore: CleanupOwnerStore;
  recording: NonNullable<ReturnType<typeof parseRecordingEntry>>;
  refStore: CleanupDeleteStore;
}): Promise<void> {
  await args.ownerStore.delete([
    RECORDING_ASSET_OWNER_KIND,
    args.recording.id,
    RECORDING_ASSET_ROLE,
  ]);
  if ((await args.ownerStore.index('assetId').count(args.recording.assetId)) === 0) {
    await args.refStore.delete(args.recording.assetId);
    args.operation.assetIds.push(args.recording.assetId);
  }
}

async function unlinkProjectAsset(args: {
  operation: PhysicalDeleteAssetOperation;
  ownerStore: CleanupOwnerStore;
  projectAsset: NonNullable<ReturnType<typeof parseProjectAssetEntry>>;
  refStore: CleanupDeleteStore;
}): Promise<void> {
  await args.ownerStore.delete([
    PROJECT_ASSET_OWNER_KIND,
    args.projectAsset.id,
    PROJECT_MEDIA_ASSET_ROLE,
  ]);
  if ((await args.ownerStore.index('assetId').count(args.projectAsset.assetId)) === 0) {
    await args.refStore.delete(args.projectAsset.assetId);
    args.operation.assetIds.push(args.projectAsset.assetId);
  }
}

function isMediaReferencedByVideoProject(
  media: ParsedMediaEntry,
  rawProjects: readonly unknown[]
): boolean {
  return rawProjects.some((raw) => {
    const project = parseVideoProjectEntry(raw);
    if (!project) return false;
    const refs = collectVideoProjectReferences(project);
    return (
      (media.source.kind === 'recording' && refs.recordingIds.has(media.source.recordingId)) ||
      (media.source.kind === 'project-asset' &&
        refs.projectAssetIds.has(media.source.projectAssetId)) ||
      refs.libraryMediaIds.has(media.id)
    );
  });
}

async function deleteImageAggregateSidecars(args: {
  aggregateId: string;
  operation: PhysicalDeleteAssetOperation;
  ownerStore: CleanupOwnerStore;
  presentationStore: CleanupDeleteStore;
  refStore: CleanupMutableStore;
  workspaceStore: CleanupMutableStore;
}): Promise<void> {
  const workspace = parseImageWorkspaceEntry(await args.workspaceStore.get(args.aggregateId));
  if (workspace) {
    await removeEditorDocumentOwnership({
      document: workspace.document,
      ownerId: args.aggregateId,
      ownerKind: 'image-workspace',
      physicalDelete: args.operation,
      stores: { owners: args.ownerStore, refs: args.refStore },
    });
  }
  await args.workspaceStore.delete(args.aggregateId);
  await args.presentationStore.delete(
    createAggregatePresentationKey({ id: args.aggregateId, kind: 'image' })
  );
}

async function deleteExpiredMedia(
  id: string,
  now: number,
  retention: number | null,
  includeUnexpired: boolean
): Promise<boolean> {
  const operation = buildPhysicalDeleteOperation([]);
  const deleted = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        THUMBNAILS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        STORE_NAME,
        VIDEO_PROJECTS_STORE,
        PROJECT_ASSETS_STORE,
        SCENARIO_ASSETS_STORE,
        RECORDING_TELEMETRY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const current = parseMediaLibraryEntry(await mediaStore.get(id));
    if (
      !current ||
      current.lifecycle?.storageClass !== 'temporary' ||
      current.lifecycle.trashedAt !== undefined ||
      (!includeUnexpired && !isExpired(current.lifecycle.updatedAt, retention, now))
    ) {
      await tx.done;
      return false;
    }
    if (
      isMediaReferencedByVideoProject(current, await tx.objectStore(VIDEO_PROJECTS_STORE).getAll())
    ) {
      await tx.done;
      return false;
    }
    if (
      (await tx.objectStore(SCENARIO_ASSETS_STORE).getAll()).some(
        (raw) => parseScenarioAssetEntry(raw)?.borrowedMediaId === id
      )
    ) {
      await tx.done;
      return false;
    }
    const recordingStore = tx.objectStore(STORE_NAME);
    const recording =
      current.source.kind === 'recording'
        ? parseRecordingEntry(await recordingStore.get(current.source.recordingId))
        : null;
    if (
      recording &&
      (recording.lifecycle?.storageClass !== 'temporary' ||
        (!includeUnexpired && !isExpired(recording.lifecycle.updatedAt, retention, now)))
    ) {
      await tx.done;
      return false;
    }

    await mediaStore.delete(id);
    await tx.objectStore(VIDEO_WORKSPACES_STORE).delete(id);
    await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(id);
    await tx.objectStore(THUMBNAILS_STORE).delete(id);
    await deleteImageAggregateSidecars({
      aggregateId: id,
      operation,
      ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
      presentationStore: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
      refStore: tx.objectStore(ASSET_REFS_STORE),
      workspaceStore: tx.objectStore(IMAGE_WORKSPACES_STORE),
    });
    if (current.source.kind === 'recording' && recording?.lifecycle?.storageClass === 'temporary') {
      await recordingStore.delete(current.source.recordingId);
      await tx.objectStore(RECORDING_TELEMETRY_STORE).delete(current.source.recordingId);
      await unlinkRecordingAsset({
        operation,
        ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
        recording,
        refStore: tx.objectStore(ASSET_REFS_STORE),
      });
    }
    if (current.source.kind === 'project-asset') {
      const projectAsset = parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(current.source.projectAssetId)
      );
      await tx.objectStore(PROJECT_ASSETS_STORE).delete(current.source.projectAssetId);
      if (projectAsset) {
        await unlinkProjectAsset({
          operation,
          ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
          projectAsset,
          refStore: tx.objectStore(ASSET_REFS_STORE),
        });
      }
    }
    if (current.source.kind === 'stored-asset') {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete(['media-library', id, 'source']);
      if ((await ownerStore.index('assetId').count(current.source.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(current.source.assetId);
        operation.assetIds.push(current.source.assetId);
      }
    }
    if (operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
    }
    await tx.done;
    return true;
  });
  if (operation.assetIds.length > 0) await completePhysicalDeleteOperation(operation);
  return deleted;
}
