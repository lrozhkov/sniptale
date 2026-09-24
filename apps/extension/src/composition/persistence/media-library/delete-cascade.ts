import type { VideoProjectAssetSource } from '../../../features/video/project/types';
import { removeVideoProjectLibrarySources } from '../../../features/video/project/library-source-removal';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
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
  SCENARIO_PROJECTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { parseMediaLibraryEntry } from './read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { stripReviewAssetReference } from '../review-workspaces/strip-asset';
import { removeScenarioAssetReferences } from '../scenario/asset-reference-removal';
import { applyScenarioAssetMutations } from '../scenario/aggregate-mutations';
import { tryScenarioResourceCleanup } from '../scenario/resource-sessions';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry } from '../projects/read-guards';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { removeEditorDocumentOwnership } from '../document-assets';
import { createAggregatePresentationKey } from '../aggregate-presentations';
import type { MediaAssetProjectUsage } from './usage';
import type { MediaLibraryEntry } from './contracts';

type CascadeTransaction = ReturnType<
  Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>['transaction']
>;
type PhysicalDelete = ReturnType<typeof buildPhysicalDeleteOperation>;
type CascadeDatabase = Awaited<
  ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>
>;

export class StaleMediaAssetDeletePreviewError extends Error {
  constructor() {
    super('The affected projects changed after the deletion warning.');
    this.name = 'StaleMediaAssetDeletePreviewError';
  }
}

class PrimaryMediaAssetDeleteError extends Error {
  constructor() {
    super('A project requires this file as its primary source.');
    this.name = 'PrimaryMediaAssetDeleteError';
  }
}

function usageKey(usage: Pick<MediaAssetProjectUsage, 'id' | 'kind'>): string {
  return `${usage.kind}:${usage.id}`;
}

function assertExpectedUsage(
  actual: readonly MediaAssetProjectUsage[],
  expected: readonly MediaAssetProjectUsage[]
): void {
  const actualKeys = actual.map(usageKey).sort();
  const expectedKeys = expected.map(usageKey).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  )
    throw new StaleMediaAssetDeletePreviewError();
}

function videoSourceMatches(
  source: VideoProjectAssetSource,
  media: MediaLibraryEntry,
  scenarioChildIds: ReadonlySet<string>
): boolean {
  return (
    (source.kind === 'library-asset' && source.mediaId === media.id) ||
    (source.kind === 'recording' &&
      media.source.kind === 'recording' &&
      source.recordingId === media.source.recordingId) ||
    (source.kind === 'project-asset' &&
      media.source.kind === 'project-asset' &&
      source.projectAssetId === media.source.projectAssetId) ||
    (source.kind === 'scenario-asset' && scenarioChildIds.has(source.scenarioAssetId))
  );
}

async function releaseAssetOwner(args: {
  assetId: string;
  ownerId: string;
  ownerKind: string;
  role: string;
  tx: CascadeTransaction;
  physicalDelete: PhysicalDelete;
}): Promise<void> {
  const owners = args.tx.objectStore(ASSET_OWNERS_STORE);
  await owners.delete!([args.ownerKind, args.ownerId, args.role]);
  if ((await owners.index('assetId').count(args.assetId)) === 0) {
    await args.tx.objectStore(ASSET_REFS_STORE).delete!(args.assetId);
    args.physicalDelete.assetIds.push(args.assetId);
  }
}

/** Commit project detach, library deletion and physical-delete intent as one IDB mutation. */
export async function deleteMediaAssetWithProjectCascade(
  mediaId: string,
  expectedUsage: readonly MediaAssetProjectUsage[]
): Promise<void> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const scenarioIds = expectedUsage
    .filter((usage) => usage.kind === 'scenario')
    .map((usage) => usage.id)
    .sort();
  await withScenarioLocks(scenarioIds, 0, () =>
    runWithIndexedDbMutation((db) =>
      commitCascadeTransaction(db, mediaId, expectedUsage, physicalDelete)
    )
  );
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}

async function withScenarioLocks(
  scenarioIds: readonly string[],
  index: number,
  operation: () => Promise<void>
): Promise<void> {
  if (index === scenarioIds.length) return operation();
  const result = await tryScenarioResourceCleanup(scenarioIds[index]!, async () => {
    await withScenarioLocks(scenarioIds, index + 1, operation);
    return true;
  });
  if (result === undefined) throw new Error('A scenario project is open for editing.');
}

function requireVerifiedGraphEntries<T>(entries: readonly (T | null)[]): T[] {
  if (entries.some((entry) => !entry))
    throw new Error('A project reference could not be verified.');
  return entries.filter((entry): entry is T => entry !== null);
}

async function loadCascadeGraph(tx: CascadeTransaction, mediaId: string) {
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (!media) throw new StaleMediaAssetDeletePreviewError();
  if (
    media.source.kind !== 'recording' &&
    media.source.kind !== 'project-asset' &&
    media.source.kind !== 'stored-asset'
  )
    throw new Error('This media source cannot be removed from projects.');
  const [rawVideo, rawScenario, rawChildren, rawReview] = await Promise.all([
    tx.objectStore(VIDEO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_ASSETS_STORE).getAll(),
    tx.objectStore(VIDEO_WORKSPACES_STORE).getAll(),
  ]);
  const videos = requireVerifiedGraphEntries(rawVideo.map(parseVideoProjectEntry));
  const scenarios = requireVerifiedGraphEntries(rawScenario.map(parseScenarioProjectEntry));
  const children = requireVerifiedGraphEntries(rawChildren.map(parseScenarioAssetEntry));
  const reviews = requireVerifiedGraphEntries(rawReview.map(parseVideoWorkspace));
  const scenarioChildren = children.filter(
    (child) =>
      child.borrowedMediaId === mediaId ||
      (media.source.kind === 'stored-asset' &&
        !child.borrowedMediaId &&
        child.assetId === media.source.assetId &&
        (!mediaId.startsWith('scenario-asset:') ||
          child.id === mediaId.slice('scenario-asset:'.length)))
  );
  return { media, videos, scenarios, scenarioChildren, reviews };
}

async function detachVideoProjects(
  tx: CascadeTransaction,
  graph: Awaited<ReturnType<typeof loadCascadeGraph>>,
  now: number
): Promise<MediaAssetProjectUsage[]> {
  const affected: MediaAssetProjectUsage[] = [];
  const scenarioChildIds = new Set(graph.scenarioChildren.map((child) => child.id));
  for (const entry of graph.videos) {
    const primary =
      graph.media.source.kind === 'recording' &&
      (entry.project.baseRecordingId === graph.media.source.recordingId ||
        (entry.project.source.kind === 'recording' &&
          entry.project.source.recordingId === graph.media.source.recordingId));
    const sources = entry.project.assets
      .filter((asset) => videoSourceMatches(asset.source, graph.media, scenarioChildIds))
      .map((asset) => asset.source);
    if (!primary && sources.length === 0) continue;
    affected.push({ id: entry.id, kind: 'video', name: entry.project.name, primary });
    if (primary) throw new PrimaryMediaAssetDeleteError();
    const project = removeVideoProjectLibrarySources(entry.project, sources);
    await tx.objectStore(VIDEO_PROJECTS_STORE).put!({
      ...entry,
      project: { ...project, updatedAt: now },
      updatedAt: now,
      workspaceRevision: (entry.workspaceRevision ?? 0) + 1,
    });
  }
  return affected;
}

async function detachScenarioProjects(
  tx: CascadeTransaction,
  graph: Awaited<ReturnType<typeof loadCascadeGraph>>,
  now: number,
  physicalDelete: PhysicalDelete
): Promise<MediaAssetProjectUsage[]> {
  const affected: MediaAssetProjectUsage[] = [];
  const childIdsByProject = new Map<string, Set<string>>();
  for (const child of graph.scenarioChildren) {
    const ids = childIdsByProject.get(child.projectId) ?? new Set<string>();
    ids.add(child.id);
    childIdsByProject.set(child.projectId, ids);
  }
  for (const entry of graph.scenarios) {
    const childIds = childIdsByProject.get(entry.id);
    if (!childIds?.size) continue;
    affected.push({ id: entry.id, kind: 'scenario', name: entry.project.name, primary: false });
    const next = removeScenarioAssetReferences(entry, childIds, now);
    await tx.objectStore(SCENARIO_PROJECTS_STORE).put!(next);
    await applyScenarioAssetMutations(
      tx,
      entry.id,
      { assetDeletes: [...childIds] },
      physicalDelete
    );
  }
  return affected;
}

async function detachReviewWorkspaces(
  tx: CascadeTransaction,
  graph: Awaited<ReturnType<typeof loadCascadeGraph>>,
  now: number
): Promise<MediaAssetProjectUsage[]> {
  const affected: MediaAssetProjectUsage[] = [];
  for (const workspace of graph.reviews) {
    const primary = workspace.aggregateId === graph.media.id;
    const ref =
      graph.media.source.kind === 'project-asset'
        ? `project-asset:${graph.media.source.projectAssetId}`
        : null;
    const attached = ref !== null && collectReviewAssetReferences(workspace).has(ref);
    if (!primary && !attached) continue;
    affected.push({
      id: workspace.aggregateId,
      kind: 'review',
      name: graph.media.filename,
      primary,
    });
    if (primary) throw new PrimaryMediaAssetDeleteError();
    await tx.objectStore(VIDEO_WORKSPACES_STORE).put!(
      stripReviewAssetReference(workspace, ref!, now)
    );
  }
  return affected;
}

async function deleteMediaSidecars(
  tx: CascadeTransaction,
  mediaId: string,
  physicalDelete: PhysicalDelete
): Promise<void> {
  const imageWorkspace = parseImageWorkspaceEntry(
    await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId)
  );
  if (imageWorkspace) {
    await removeEditorDocumentOwnership({
      document: imageWorkspace.document,
      ownerId: mediaId,
      ownerKind: 'image-workspace',
      physicalDelete,
      stores: {
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
    });
  }
  await tx.objectStore(IMAGE_WORKSPACES_STORE).delete!(mediaId);
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).delete!(
    createAggregatePresentationKey({ id: mediaId, kind: 'image' })
  );
  await tx.objectStore(THUMBNAILS_STORE).delete!(mediaId);
  await tx.objectStore(MEDIA_LIBRARY_STORE).delete!(mediaId);
  await tx.objectStore(VIDEO_WORKSPACES_STORE).delete!(mediaId);
  await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete!(mediaId);
}

async function releaseMediaSource(
  tx: CascadeTransaction,
  media: MediaLibraryEntry,
  physicalDelete: PhysicalDelete
): Promise<void> {
  if (media.source.kind === 'recording') {
    const record = parseRecordingEntry(
      await tx.objectStore(STORE_NAME).get(media.source.recordingId)
    );
    if (!record) throw new Error('Recording source is unavailable.');
    await tx.objectStore(STORE_NAME).delete!(record.id);
    await tx.objectStore(RECORDING_TELEMETRY_STORE).delete!(record.id);
    await releaseAssetOwner({
      assetId: record.assetId,
      ownerId: record.id,
      ownerKind: 'recording',
      role: 'body',
      tx,
      physicalDelete,
    });
  } else if (media.source.kind === 'project-asset') {
    const child = parseProjectAssetEntry(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
    );
    if (!child) throw new Error('Project asset source is unavailable.');
    await tx.objectStore(PROJECT_ASSETS_STORE).delete!(child.id);
    await releaseAssetOwner({
      assetId: child.assetId,
      ownerId: child.id,
      ownerKind: 'project-asset',
      role: 'body',
      tx,
      physicalDelete,
    });
  } else if (media.source.kind === 'stored-asset') {
    await releaseAssetOwner({
      assetId: media.source.assetId,
      ownerId: media.id,
      ownerKind: 'media-library',
      role: 'source',
      tx,
      physicalDelete,
    });
  } else {
    throw new Error('This media source cannot be removed from projects.');
  }
}

async function commitCascadeTransaction(
  db: CascadeDatabase,
  mediaId: string,
  expectedUsage: readonly MediaAssetProjectUsage[],
  physicalDelete: PhysicalDelete
): Promise<void> {
  const tx = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      VIDEO_PROJECTS_STORE,
      SCENARIO_PROJECTS_STORE,
      SCENARIO_ASSETS_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      PROJECT_ASSETS_STORE,
      STORE_NAME,
      RECORDING_TELEMETRY_STORE,
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
    const graph = await loadCascadeGraph(tx, mediaId);
    const now = Date.now();
    const affected = [
      ...(await detachVideoProjects(tx, graph, now)),
      ...(await detachScenarioProjects(tx, graph, now, physicalDelete)),
      ...(await detachReviewWorkspaces(tx, graph, now)),
    ];
    assertExpectedUsage(affected, expectedUsage);
    await deleteMediaSidecars(tx, mediaId, physicalDelete);
    await releaseMediaSource(tx, graph.media, physicalDelete);
    if (physicalDelete.assetIds.length > 0)
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Transaction may already be closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
