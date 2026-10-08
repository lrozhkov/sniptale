import {
  initDB,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  PROJECT_ASSETS_STORE,
} from '../infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from './read-guards';
import { parseProjectAssetEntry, parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import {
  isVideoPrimaryMediaSource,
  mediaDependencyTarget,
  reviewWorkspaceUsesMedia,
  scenarioChildUsesMedia,
  videoSourceUsesMedia,
} from './dependencies';
import { USAGE_INDEX_MARKER, USAGE_REFERENCE_INDEX, usageReferenceKey } from './usage-index-keys';
import type { MediaAssetProjectUsage } from './usage';

type Database = Awaited<ReturnType<typeof initDB>>;

/** Missing legacy coverage is not evidence that a material has no consumers. */
class ProjectUsageIndexPendingError extends Error {
  constructor() {
    super('Project usage index is not ready.');
    this.name = 'ProjectUsageIndexPendingError';
  }
}

export async function isProjectUsageIndexReady(db: Database): Promise<boolean> {
  // Both counts share one snapshot, so concurrent puts cannot conceal missing legacy rows.
  const stores = [VIDEO_PROJECTS_STORE, VIDEO_WORKSPACES_STORE];
  const tx = db.transaction(stores, 'readonly');
  const counts = await Promise.all(
    stores.map(async (name) => {
      const store = tx.objectStore(name);
      const [all, indexed] = await Promise.all([
        store.count(),
        store.index(USAGE_REFERENCE_INDEX).count(USAGE_INDEX_MARKER),
      ]);
      return all === indexed;
    })
  );
  await tx.done;
  return counts.every(Boolean);
}

/** Inspector-only lookup: no global documents, recovery, hashing or mutation. */
export async function readIndexedProjectUsage(mediaId: string): Promise<MediaAssetProjectUsage[]> {
  const db = await initDB();
  const root = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, mediaId));
  if (!root) return [];
  if (!(await isProjectUsageIndexReady(db))) throw new ProjectUsageIndexPendingError();
  const canonical: unknown =
    root.source.kind === 'stored-asset' && mediaId.startsWith('scenario-asset:')
      ? await db.get(SCENARIO_ASSETS_STORE, mediaId.slice('scenario-asset:'.length))
      : undefined;
  const [privateRows, borrowed, frozen]: [unknown[], unknown[], unknown[]] = await Promise.all([
    db.getAllFromIndex(PROJECT_ASSETS_STORE, 'originMediaId', mediaId),
    db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'borrowedMediaId', mediaId),
    db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'galleryAssetId', mediaId),
  ]);
  const media = mediaDependencyTarget(
    root,
    privateRows.map(parseProjectAssetEntry).filter((row) => row !== null)
  );
  const children = [...borrowed, ...frozen, canonical]
    .map(parseScenarioAssetEntry)
    .filter((row) => row !== null)
    .filter((row) => scenarioChildUsesMedia(row, media));
  const childIds = new Set(children.map((child) => child.id));
  const keys = new Set([usageReferenceKey('library-asset', mediaId)]);
  if (root.source.kind === 'recording')
    keys.add(usageReferenceKey('recording', root.source.recordingId));
  if (root.source.kind === 'project-asset')
    keys.add(usageReferenceKey('project-asset', root.source.projectAssetId));
  for (const id of media.privateProjectAssetIds ?? [])
    keys.add(usageReferenceKey('project-asset', id));
  for (const id of childIds) keys.add(usageReferenceKey('scenario-asset', id));
  const [videos, reviews, scenarios] = await Promise.all([
    Promise.all(
      [...keys].map((key) => db.getAllFromIndex(VIDEO_PROJECTS_STORE, USAGE_REFERENCE_INDEX, key))
    ),
    Promise.all(
      [...keys].map((key) => db.getAllFromIndex(VIDEO_WORKSPACES_STORE, USAGE_REFERENCE_INDEX, key))
    ),
    Promise.all(
      [...new Set(children.map((child) => child.projectId))].map((id) =>
        db.get(SCENARIO_PROJECTS_STORE, id)
      )
    ),
  ]);
  return projectUsageFromMatches({
    db,
    root,
    media,
    childIds,
    videos: videos.flat(),
    reviews: reviews.flat(),
    scenarios,
  });
}

/** Admit only indexed candidates and project the same identity rules as the authoritative graph. */
async function projectUsageFromMatches(args: {
  db: Database;
  root: NonNullable<ReturnType<typeof parseMediaLibraryEntry>>;
  media: ReturnType<typeof mediaDependencyTarget>;
  childIds: ReadonlySet<string>;
  videos: unknown[];
  reviews: unknown[];
  scenarios: unknown[];
}): Promise<MediaAssetProjectUsage[]> {
  const { db, root, media, childIds, videos, reviews, scenarios } = args;
  const result = new Map<string, MediaAssetProjectUsage>();
  for (const entry of videos.map(parseVideoProjectEntry)) {
    if (!entry) continue;
    const primary = isVideoPrimaryMediaSource(entry.project, media);
    if (
      primary ||
      entry.project.assets.some((asset) => videoSourceUsesMedia(asset.source, media, childIds))
    )
      result.set(`video:${entry.id}`, {
        id: entry.id,
        kind: 'video',
        name: entry.project.name,
        primary,
      });
  }
  for (const entry of scenarios.map(parseScenarioProjectEntry)) {
    if (entry)
      result.set(`scenario:${entry.id}`, {
        id: entry.id,
        kind: 'scenario',
        name: entry.project.name,
        primary: false,
      });
  }
  for (const workspace of reviews.map(parseVideoWorkspace)) {
    if (!workspace || !reviewWorkspaceUsesMedia(workspace, media)) continue;
    const owner = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, workspace.aggregateId));
    result.set(`review:${workspace.aggregateId}`, {
      id: workspace.aggregateId,
      kind: 'review',
      name: owner?.filename ?? root.filename,
      primary: false,
    });
  }
  return [...result.values()];
}
