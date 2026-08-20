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
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
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
import { listScenarioProjectEntries } from '../scenario/projects';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents';
import type { LocalStoragePolicy } from '../../../contracts/settings';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { resolveVideoProjectRetentionKind } from '../../../features/media-hub/video-project-list-items';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { getDraftRetentionMs } from './policy';
import { collectVideoProjectReferences } from './references';
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
import {
  recoverScenarioAssetPublications,
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_ROLE,
} from '../scenario/aggregate-mutations';

export interface DraftCleanupResult {
  deletedCount: number;
  deletedIds: string[];
}

function isExpired(updatedAt: number, retentionMs: number | null, now: number): boolean {
  return retentionMs !== null && updatedAt <= now - retentionMs;
}

function readOwnedChildKey(value: unknown, projectId: string, key: 'id' | 'stepId'): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record['projectId'] === projectId && typeof record[key] === 'string' ? record[key] : null;
}

export async function cleanupDrafts(args: {
  policy: LocalStoragePolicy;
  includeUnexpired?: boolean;
  now?: number;
}): Promise<DraftCleanupResult> {
  await recoverRecordingAssetPublications();
  await recoverProjectMediaPublications();
  const now = args.now ?? Date.now();
  const ordinaryRetention = getDraftRetentionMs(args.policy, 'ordinary');
  const videoRetention = getDraftRetentionMs(args.policy, 'video');
  const [media, videoProjects, scenarioProjects] = await Promise.all([
    listMediaLibrary(),
    listVideoProjectEntries(),
    listScenarioProjectEntries(),
  ]);
  const deletedIds: string[] = [];
  const referencedMediaIds = new Set<string>();
  const referencedRecordingIds = new Set<string>();
  for (const project of videoProjects) {
    const refs = collectVideoProjectReferences(project);
    for (const id of refs.recordingIds) referencedRecordingIds.add(id);
    for (const id of refs.projectAssetIds) referencedMediaIds.add(createProjectAssetMediaId(id));
  }

  const includeUnexpired = Boolean(args.includeUnexpired);
  for (const entry of videoProjects) {
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.storageClass !== 'temporary') continue;
    const retention =
      resolveVideoProjectRetentionKind(entry.project) === 'video'
        ? videoRetention
        : ordinaryRetention;
    if (!includeUnexpired && !isExpired(lifecycle.updatedAt, retention, now)) continue;
    if (
      await deleteExpiredVideoProjectGraph({
        id: entry.id,
        includeUnexpired,
        now,
        parentRetention: retention,
        videoRetention,
        ordinaryRetention,
      })
    ) {
      deletedIds.push(`video-project:${entry.id}`);
    }
  }

  for (const entry of media) {
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.storageClass !== 'temporary') continue;
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

  for (const entry of scenarioProjects) {
    const lifecycle = entry.lifecycle;
    if (!lifecycle || lifecycle.storageClass !== 'temporary') continue;
    if (!includeUnexpired && !isExpired(lifecycle.updatedAt, ordinaryRetention, now)) continue;
    if (await deleteExpiredScenarioProject(entry.id, now, ordinaryRetention, includeUnexpired)) {
      deletedIds.push(`scenario:${entry.id}`);
    }
  }

  return { deletedCount: deletedIds.length, deletedIds };
}

async function deleteExpiredScenarioProject(
  id: string,
  now: number,
  retention: number | null,
  includeUnexpired: boolean
): Promise<boolean> {
  await recoverScenarioAssetPublications();
  const operation = buildPhysicalDeleteOperation([]);
  const deleted = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        THUMBNAILS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const current = parseScenarioProjectEntry(await projectStore.get(id));
    if (
      !current ||
      current.lifecycle?.storageClass !== 'temporary' ||
      (!includeUnexpired && !isExpired(current.lifecycle.updatedAt, retention, now))
    ) {
      await tx.done;
      return false;
    }

    const assetStore = tx.objectStore(SCENARIO_ASSETS_STORE);
    for (const raw of await assetStore.getAll()) {
      const asset = parseScenarioAssetEntry(raw);
      const assetId = asset?.projectId === id ? asset.id : readOwnedChildKey(raw, id, 'id');
      if (assetId) {
        await assetStore.delete(assetId);
        if (asset) {
          const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
          await ownerStore.delete([SCENARIO_ASSET_OWNER_KIND, assetId, SCENARIO_ASSET_ROLE]);
          if ((await ownerStore.index('assetId').count(asset.assetId)) === 0) {
            await tx.objectStore(ASSET_REFS_STORE).delete(asset.assetId);
            operation.assetIds.push(asset.assetId);
          }
        }
      }
    }
    const exportStore = tx.objectStore(SCENARIO_EXPORTS_STORE);
    for (const raw of await exportStore.getAll()) {
      const entry = parseScenarioExportEntry(raw);
      const exportId = entry?.projectId === id ? entry.id : readOwnedChildKey(raw, id, 'id');
      if (!exportId) continue;
      await exportStore.delete(exportId);
      await tx.objectStore(THUMBNAILS_STORE).delete(`scenario-export:${exportId}`);
    }
    const documentStore = tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE);
    for (const raw of await documentStore.getAll()) {
      const document = parseScenarioStepEditorDocumentEntry(raw);
      const stepId =
        document?.projectId === id ? document.stepId : readOwnedChildKey(raw, id, 'stepId');
      if (stepId) await documentStore.delete(stepId);
    }
    await tx
      .objectStore(AGGREGATE_PRESENTATIONS_STORE)
      .delete(createAggregatePresentationKey({ id, kind: 'scenario' }));
    await tx.objectStore(THUMBNAILS_STORE).delete(`scenario:${id}`);
    await projectStore.delete(id);
    if (operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
    }
    await tx.done;
    return true;
  });
  if (operation.assetIds.length > 0) {
    await completePhysicalDeleteOperation(operation).catch(() => undefined);
  }
  return deleted;
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
        refs.projectAssetIds.has(media.source.projectAssetId))
    );
  });
}

function collectProtectedVideoProjectReferences(
  rawProjects: readonly unknown[],
  ownerProjectId: string
): { protectedProjectAssetIds: Set<string>; protectedRecordingIds: Set<string> } {
  const protectedRecordingIds = new Set<string>();
  const protectedProjectAssetIds = new Set<string>();
  for (const rawProject of rawProjects) {
    const other = parseVideoProjectEntry(rawProject);
    if (!other || other.id === ownerProjectId) continue;
    const otherRefs = collectVideoProjectReferences(other);
    for (const recordingId of otherRefs.recordingIds) protectedRecordingIds.add(recordingId);
    for (const assetId of otherRefs.projectAssetIds) protectedProjectAssetIds.add(assetId);
  }
  return { protectedProjectAssetIds, protectedRecordingIds };
}

async function deleteImageAggregateSidecars(args: {
  aggregateId: string;
  presentationStore: CleanupDeleteStore;
  workspaceStore: CleanupDeleteStore;
}): Promise<void> {
  await args.workspaceStore.delete(args.aggregateId);
  await args.presentationStore.delete(
    createAggregatePresentationKey({ id: args.aggregateId, kind: 'image' })
  );
}

async function cleanupVideoProjectMedia(args: {
  context: {
    includeUnexpired: boolean;
    now: number;
    ordinaryRetention: number | null;
    videoRetention: number | null;
  };
  mediaStore: CleanupMutableStore;
  presentationStore: CleanupDeleteStore;
  protectedProjectAssetIds: Set<string>;
  protectedRecordingIds: Set<string>;
  refs: ReturnType<typeof collectVideoProjectReferences>;
  thumbnailStore: CleanupDeleteStore;
  workspaceStore: CleanupDeleteStore;
}): Promise<void> {
  for (const raw of await args.mediaStore.getAll()) {
    const media = parseMediaLibraryEntry(raw);
    if (!media) continue;
    const cleanup = classifyVideoProjectMediaCleanup(
      media,
      args.refs,
      args.protectedRecordingIds,
      args.protectedProjectAssetIds,
      args.context
    );
    if (cleanup.kind === 'protect-recording') {
      args.protectedRecordingIds.add(cleanup.recordingId);
      continue;
    }
    if (cleanup.kind === 'protect-project-asset') {
      args.protectedProjectAssetIds.add(cleanup.projectAssetId);
      continue;
    }
    if (cleanup.kind !== 'delete') continue;
    await args.mediaStore.delete(media.id);
    await args.thumbnailStore.delete(media.id);
    await deleteImageAggregateSidecars({
      aggregateId: media.id,
      presentationStore: args.presentationStore,
      workspaceStore: args.workspaceStore,
    });
  }
}

async function cleanupVideoProjectRecordings(args: {
  includeUnexpired: boolean;
  now: number;
  protectedRecordingIds: ReadonlySet<string>;
  recordingIds: ReadonlySet<string>;
  recordingStore: CleanupMutableStore;
  operation: PhysicalDeleteAssetOperation;
  ownerStore: CleanupOwnerStore;
  refStore: CleanupDeleteStore;
  telemetryStore: CleanupDeleteStore;
  videoRetention: number | null;
}): Promise<void> {
  for (const recordingId of args.recordingIds) {
    if (args.protectedRecordingIds.has(recordingId)) continue;
    const recording = parseRecordingEntry(await args.recordingStore.get(recordingId));
    if (
      recording?.lifecycle?.storageClass === 'temporary' &&
      (args.includeUnexpired ||
        isExpired(recording.lifecycle.updatedAt, args.videoRetention, args.now))
    ) {
      await args.recordingStore.delete(recordingId);
      await args.telemetryStore.delete(recordingId);
      await unlinkRecordingAsset({
        operation: args.operation,
        ownerStore: args.ownerStore,
        recording,
        refStore: args.refStore,
      });
    }
  }
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
        THUMBNAILS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        STORE_NAME,
        VIDEO_PROJECTS_STORE,
        PROJECT_ASSETS_STORE,
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
    await tx.objectStore(THUMBNAILS_STORE).delete(id);
    await deleteImageAggregateSidecars({
      aggregateId: id,
      presentationStore: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
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
    if (operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
    }
    await tx.done;
    return true;
  });
  if (operation.assetIds.length > 0) await completePhysicalDeleteOperation(operation);
  return deleted;
}

async function deleteExpiredVideoProjectGraph(args: {
  id: string;
  includeUnexpired: boolean;
  now: number;
  ordinaryRetention: number | null;
  parentRetention: number | null;
  videoRetention: number | null;
}): Promise<boolean> {
  const operation = buildPhysicalDeleteOperation([]);
  const deleted = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        VIDEO_PROJECTS_STORE,
        STORE_NAME,
        MEDIA_LIBRARY_STORE,
        THUMBNAILS_STORE,
        PROJECT_ASSETS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        RECORDING_TELEMETRY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const projectStore = tx.objectStore(VIDEO_PROJECTS_STORE);
    const current = parseVideoProjectEntry(await projectStore.get(args.id));
    if (
      !current ||
      current.lifecycle?.storageClass !== 'temporary' ||
      (!args.includeUnexpired &&
        !isExpired(current.lifecycle.updatedAt, args.parentRetention, args.now))
    ) {
      await tx.done;
      return false;
    }
    const refs = collectVideoProjectReferences(current);
    const { protectedProjectAssetIds, protectedRecordingIds } =
      collectProtectedVideoProjectReferences(await projectStore.getAll(), args.id);
    const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
    await cleanupVideoProjectMedia({
      context: args,
      mediaStore: tx.objectStore(MEDIA_LIBRARY_STORE),
      presentationStore,
      protectedProjectAssetIds,
      protectedRecordingIds,
      refs,
      thumbnailStore: tx.objectStore(THUMBNAILS_STORE),
      workspaceStore: tx.objectStore(IMAGE_WORKSPACES_STORE),
    });
    await cleanupVideoProjectRecordings({
      includeUnexpired: args.includeUnexpired,
      now: args.now,
      protectedRecordingIds,
      recordingIds: refs.recordingIds,
      recordingStore: tx.objectStore(STORE_NAME),
      operation,
      ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
      refStore: tx.objectStore(ASSET_REFS_STORE),
      telemetryStore: tx.objectStore(RECORDING_TELEMETRY_STORE),
      videoRetention: args.videoRetention,
    });
    for (const projectAssetId of refs.projectAssetIds) {
      if (!protectedProjectAssetIds.has(projectAssetId)) {
        const projectAsset = parseProjectAssetEntry(
          await tx.objectStore(PROJECT_ASSETS_STORE).get(projectAssetId)
        );
        await tx.objectStore(PROJECT_ASSETS_STORE).delete(projectAssetId);
        if (projectAsset) {
          await unlinkProjectAsset({
            operation,
            ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
            projectAsset,
            refStore: tx.objectStore(ASSET_REFS_STORE),
          });
        }
      }
    }
    await presentationStore.delete(
      createAggregatePresentationKey({ id: args.id, kind: 'video-project' })
    );
    await tx.objectStore(THUMBNAILS_STORE).delete(`video-project:${args.id}`);
    await projectStore.delete(args.id);
    if (operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
    }
    await tx.done;
    return true;
  });
  if (operation.assetIds.length > 0) await completePhysicalDeleteOperation(operation);
  return deleted;
}

function classifyVideoProjectMediaCleanup(
  media: ParsedMediaEntry,
  refs: ReturnType<typeof collectVideoProjectReferences>,
  protectedRecordingIds: ReadonlySet<string>,
  protectedProjectAssetIds: ReadonlySet<string>,
  context: {
    includeUnexpired: boolean;
    now: number;
    ordinaryRetention: number | null;
    videoRetention: number | null;
  }
):
  | { kind: 'delete' | 'keep' }
  | { kind: 'protect-project-asset'; projectAssetId: string }
  | { kind: 'protect-recording'; recordingId: string } {
  if (media.source.kind === 'recording') {
    const owned =
      refs.recordingIds.has(media.source.recordingId) &&
      !protectedRecordingIds.has(media.source.recordingId);
    if (!owned) return { kind: 'keep' };
    return shouldProtectVideoProjectMedia(media, context)
      ? { kind: 'protect-recording', recordingId: media.source.recordingId }
      : { kind: 'delete' };
  }
  if (media.source.kind !== 'project-asset') return { kind: 'keep' };
  const projectAssetId = media.source.projectAssetId;
  const owned =
    refs.projectAssetIds.has(projectAssetId) && !protectedProjectAssetIds.has(projectAssetId);
  if (!owned) return { kind: 'keep' };
  return shouldProtectVideoProjectMedia(media, context)
    ? { kind: 'protect-project-asset', projectAssetId }
    : { kind: 'delete' };
}

function shouldProtectVideoProjectMedia(
  media: ParsedMediaEntry,
  context: {
    includeUnexpired: boolean;
    now: number;
    ordinaryRetention: number | null;
    videoRetention: number | null;
  }
): boolean {
  if (media.lifecycle?.storageClass !== 'temporary') return true;
  if (context.includeUnexpired) return false;
  const retention =
    media.source.kind === 'recording' ? context.videoRetention : context.ordinaryRetention;
  return !isExpired(media.lifecycle.updatedAt, retention, context.now);
}
