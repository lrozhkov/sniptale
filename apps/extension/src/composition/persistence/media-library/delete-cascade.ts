import { sameMediaSource } from './dependencies';
import {
  MediaAssetDeletionBlockedError,
  type MediaAssetGraphDomain,
  PrimaryMediaAssetDeleteError,
  StaleMediaAssetDeletePreviewError,
} from './deletion-errors';
export { StaleMediaAssetDeletePreviewError } from './deletion-errors';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
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
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  listReadyJournals,
} from '../assets';
import { parseMediaLibraryEntry } from './read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { stripReviewAssetReference } from '../review-workspaces/strip-asset';
import { removeScenarioAssetReferences } from '../scenario/asset-reference-removal';
import { applyScenarioAssetMutations } from '../scenario/aggregate-mutations';
import { tryScenarioResourceCleanup } from '../scenario/resource-sessions';
import type { MediaAssetProjectUsage } from './usage';
import {
  deleteMediaSidecars,
  releaseMediaSource,
  releaseUnpublishedProjectAssets,
  recoverMediaSourcePublications,
  mediaHasPendingPublication,
} from './delete-cascade.sources';
import {
  mediaDependencyTarget,
  reviewReferencesForMedia,
  scenarioChildUsesMedia,
  scenarioChildIsUnrelated,
  videoEntryIsUnrelated,
  videoSourceUsesMedia,
  isVideoPrimaryMediaSource,
  reviewWorkspaceUsesMedia,
  type MediaDependencyTarget,
} from './dependencies';

type CascadeTransaction = ReturnType<
  Awaited<ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>>['transaction']
>;
type PhysicalDelete = ReturnType<typeof buildPhysicalDeleteOperation>;
type CascadeDatabase = Awaited<
  ReturnType<typeof import('../infrastructure/indexed-db/core').initDB>
>;

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
  await withScenarioLocks(scenarioIds, () =>
    runWithIndexedDbMutation((db) =>
      commitCascadeTransaction(db, mediaId, expectedUsage, physicalDelete)
    )
  );
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}

/** Compensation and service cleanup may release a source only when no retained consumer adopted it. */
export async function deleteUnreferencedMediaSource(target: MediaDependencyTarget): Promise<void> {
  await recoverMediaSourcePublications(target);
  if ((await listReadyJournals()).some((journal) => mediaHasPendingPublication(journal, target)))
    throw new MediaAssetDeletionBlockedError('pending-publication');
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation((db) =>
    commitCascadeTransaction(db, target.id, [], physicalDelete, target)
  );
  if (physicalDelete.assetIds.length) await completePhysicalDeleteOperation(physicalDelete);
}

async function withScenarioLocks(
  scenarioIds: readonly string[],
  operation: () => Promise<void>
): Promise<void> {
  if (scenarioIds.length === 0) return operation();
  const result = await tryScenarioResourceCleanup(scenarioIds, async () => {
    await operation();
    return true;
  });
  if (result === undefined) throw new MediaAssetDeletionBlockedError('scenario-busy');
}

function requireVerifiedGraphEntries<T>(
  raw: readonly unknown[],
  parse: (value: unknown) => T | null,
  domain: MediaAssetGraphDomain,
  proveUnrelated: (value: unknown) => boolean
): T[] {
  const verified: T[] = [];
  for (const value of raw) {
    const entry = parse(value);
    if (entry) verified.push(entry);
    else if (!proveUnrelated(value))
      throw new MediaAssetDeletionBlockedError('invalid-graph', domain);
  }
  return verified;
}

async function loadCascadeGraph(
  tx: CascadeTransaction,
  mediaId: string,
  expectedSource?: MediaDependencyTarget
) {
  const raw: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId);
  const media = raw === undefined && expectedSource ? expectedSource : parseMediaLibraryEntry(raw);
  if (!media) throw new StaleMediaAssetDeletePreviewError();
  if (media.id !== mediaId) throw new MediaAssetDeletionBlockedError('source-unavailable');
  if (expectedSource && !sameMediaSource(media.source, expectedSource.source))
    throw new MediaAssetDeletionBlockedError('source-unavailable');
  const target = mediaDependencyTarget(media, await tx.objectStore(PROJECT_ASSETS_STORE).getAll());
  const [rawVideo, rawScenario, rawChildren, rawReview] = await Promise.all([
    tx.objectStore(VIDEO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_ASSETS_STORE).getAll(),
    tx.objectStore(VIDEO_WORKSPACES_STORE).getAll(),
  ]);
  const children = requireVerifiedGraphEntries(
    rawChildren,
    parseScenarioAssetEntry,
    'scenario-asset',
    (value) => scenarioChildIsUnrelated(value, target)
  );
  const scenarioChildren = children.filter((child) => scenarioChildUsesMedia(child, target));
  const scenarioChildIds = new Set(scenarioChildren.map((child) => child.id));
  const scenarioIds = new Set(scenarioChildren.map((child) => child.projectId));
  const videos = requireVerifiedGraphEntries(
    rawVideo,
    parseVideoProjectEntry,
    'video-project',
    (value) => videoEntryIsUnrelated(value, target, scenarioChildIds)
  );
  const scenarios = requireVerifiedGraphEntries(
    rawScenario,
    parseScenarioProjectEntry,
    'scenario-project',
    (value) => isRecord(value) && typeof value['id'] === 'string' && !scenarioIds.has(value['id'])
  );
  // Auxiliary review references admit only project-assets; the root's own sidecar is purged.
  const reviews =
    reviewReferencesForMedia(target).size > 0
      ? requireVerifiedGraphEntries(
          rawReview.filter((value) => !isRecord(value) || value['aggregateId'] !== media.id),
          parseVideoWorkspace,
          'quick-edit',
          () => false
        )
      : [];
  return { media: { ...media, ...target }, videos, scenarios, scenarioChildren, reviews };
}

async function detachVideoProjects(
  tx: CascadeTransaction,
  graph: Awaited<ReturnType<typeof loadCascadeGraph>>,
  now: number
): Promise<MediaAssetProjectUsage[]> {
  const affected: MediaAssetProjectUsage[] = [];
  const scenarioChildIds = new Set(graph.scenarioChildren.map((child) => child.id));
  for (const entry of graph.videos) {
    const primary = isVideoPrimaryMediaSource(entry.project, graph.media);
    const sources = entry.project.assets
      .filter((asset) => videoSourceUsesMedia(asset.source, graph.media, scenarioChildIds))
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
    if (workspace.aggregateId === graph.media.id) continue;
    const attached = reviewWorkspaceUsesMedia(workspace, graph.media);
    if (!attached) continue;
    affected.push({
      id: workspace.aggregateId,
      kind: 'review',
      name: 'filename' in graph.media ? graph.media.filename : graph.media.id,
      primary: false,
    });
    let next = workspace;
    for (const ref of reviewReferencesForMedia(graph.media))
      next = stripReviewAssetReference(next, ref, now);
    await tx.objectStore(VIDEO_WORKSPACES_STORE).put!(next);
  }
  return affected;
}

async function commitCascadeTransaction(
  db: CascadeDatabase,
  mediaId: string,
  expectedUsage: readonly MediaAssetProjectUsage[],
  physicalDelete: PhysicalDelete,
  expectedSource?: MediaDependencyTarget
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
      PROJECT_EXPORTS_STORE,
      WEB_SNAPSHOTS_STORE,
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
    const graph = await loadCascadeGraph(tx, mediaId, expectedSource);
    const now = Date.now();
    const scenarioChildIds = new Set(graph.scenarioChildren.map((child) => child.id));
    const detachedRepresentations = new Set([
      ...(graph.media.privateProjectAssetIds ?? []),
      ...graph.videos.flatMap((entry) =>
        entry.project.assets.flatMap((asset) =>
          asset.source.kind === 'project-asset' &&
          videoSourceUsesMedia(asset.source, graph.media, scenarioChildIds) &&
          (graph.media.source.kind !== 'project-asset' ||
            asset.source.projectAssetId !== graph.media.source.projectAssetId)
            ? [asset.source.projectAssetId]
            : []
        )
      ),
    ]);
    const affected = [
      ...(await detachVideoProjects(tx, graph, now)),
      ...(await detachScenarioProjects(tx, graph, now, physicalDelete)),
      ...(await detachReviewWorkspaces(tx, graph, now)),
    ];
    assertExpectedUsage(affected, expectedUsage);
    const ownAuxiliaries = await deleteMediaSidecars(tx, mediaId, physicalDelete);
    for (const id of ownAuxiliaries) detachedRepresentations.add(id);
    if (graph.media.source.kind === 'project-asset')
      detachedRepresentations.delete(graph.media.source.projectAssetId);
    await releaseUnpublishedProjectAssets(tx, detachedRepresentations, physicalDelete);
    await releaseMediaSource(tx, graph.media, physicalDelete);
    physicalDelete.assetIds = [...new Set(physicalDelete.assetIds)];
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
