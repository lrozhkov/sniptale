import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
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
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
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
import { parseRecordingEntry } from '../recordings/index.guards';
import type { LocalStoragePolicy } from '../../../contracts/settings';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { getDraftRetentionMs } from './policy';
import { collectVideoProjectReferences } from './references';
import {
  mediaDependencyTarget,
  reviewReferencesForMedia,
  scenarioChildIsUnrelated,
  videoEntryIsUnrelated,
  reviewWorkspaceUsesMedia,
} from '../media-library/dependencies';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import {
  deleteMediaSidecars,
  releaseUnpublishedProjectAssets,
  releaseMediaSource,
  recoverMediaSourcePublications,
} from '../media-library/delete-cascade.sources';
import { repairLinkedRecordingLifecycles } from './project-recordings';
import { repairTemporaryProjectLifecycles } from './project-retention';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { recoverRecordingAssetPublications } from '../recordings/asset-publication';
import { recoverProjectMediaPublications } from '../projects/asset-publication';
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
    if (entry.source.kind === 'web-snapshot') await recoverMediaSourcePublications(entry);
    if (await deleteExpiredMedia(entry.id, now, retention, includeUnexpired)) {
      deletedIds.push(entry.id);
    }
  }

  return { deletedCount: deletedIds.length, deletedIds };
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
        PROJECT_EXPORTS_STORE,
        WEB_SNAPSHOTS_STORE,
        SCENARIO_ASSETS_STORE,
        RECORDING_TELEMETRY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    try {
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
      const target = mediaDependencyTarget(
        current,
        await tx.objectStore(PROJECT_ASSETS_STORE).getAll()
      );
      const rawChildren = await tx.objectStore(SCENARIO_ASSETS_STORE).getAll();
      const scenarioReferenced = rawChildren.some((raw) => !scenarioChildIsUnrelated(raw, target));
      const videoReferenced = (await tx.objectStore(VIDEO_PROJECTS_STORE).getAll()).some(
        (raw) => !videoEntryIsUnrelated(raw, target, new Set())
      );
      const reviewReferenced =
        reviewReferencesForMedia(target).size > 0 &&
        (await tx.objectStore(VIDEO_WORKSPACES_STORE).getAll()).some((raw) => {
          if (isRecord(raw) && raw['aggregateId'] === current.id) return false;
          const workspace = parseVideoWorkspace(raw);
          return !workspace || reviewWorkspaceUsesMedia(workspace, target);
        });
      if (
        target.privateProjectAssetIds?.size ||
        scenarioReferenced ||
        videoReferenced ||
        reviewReferenced
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

      const privateAuxiliaries = await deleteMediaSidecars(tx, id, operation);
      if (current.source.kind === 'project-asset')
        privateAuxiliaries.delete(current.source.projectAssetId);
      await releaseUnpublishedProjectAssets(tx, privateAuxiliaries, operation);
      await releaseMediaSource(tx, current, operation);
      if (operation.assetIds.length > 0) {
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
      }
      await tx.done;
      return true;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  if (operation.assetIds.length > 0) await completePhysicalDeleteOperation(operation);
  return deleted;
}
