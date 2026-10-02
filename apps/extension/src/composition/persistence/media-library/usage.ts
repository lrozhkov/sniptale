import { parseProjectAssetEntry } from '../projects/read-guards';
import {
  mediaDependencyTarget,
  scenarioChildUsesMedia,
  videoSourceUsesMedia,
  isVideoPrimaryMediaSource,
  reviewWorkspaceUsesMedia,
} from './dependencies';
import { listScenarioProjectEntries } from '../scenario/projects';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import { listVideoProjectEntries } from '../projects/queries';
import {
  initDB,
  SCENARIO_ASSETS_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from './read-guards';
import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { MediaLibraryEntry } from './contracts';
import type { ScenarioAssetEntry } from '../scenario/contracts';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';

export interface MediaAssetProjectUsage {
  id: string;
  kind: 'scenario' | 'video' | 'review';
  name: string;
  primary: boolean;
}

interface UsageSnapshot {
  mediaById: Map<string, MediaLibraryEntry>;
  videoProjects: Awaited<ReturnType<typeof listVideoProjectEntries>>;
  scenarioProjects: Awaited<ReturnType<typeof listScenarioProjectEntries>>;
  scenarioAssets: ScenarioAssetEntry[];
  projectAssets: NonNullable<ReturnType<typeof parseProjectAssetEntry>>[];
  reviewWorkspaces: NonNullable<ReturnType<typeof parseVideoWorkspace>>[];
}

async function loadUsageSnapshot(db?: Awaited<ReturnType<typeof initDB>>): Promise<UsageSnapshot> {
  const connection = db ?? (await initDB());
  const [
    videoProjects,
    scenarioProjects,
    rawScenarioAssets,
    rawReviewWorkspaces,
    rawMedia,
    rawProjectAssets,
  ] = await Promise.all([
    listVideoProjectEntries(),
    listScenarioProjectEntries(),
    connection.getAll(SCENARIO_ASSETS_STORE),
    connection.getAll(VIDEO_WORKSPACES_STORE),
    connection.getAll(MEDIA_LIBRARY_STORE),
    connection.getAll(PROJECT_ASSETS_STORE),
  ]);
  return {
    projectAssets: rawProjectAssets.map(parseProjectAssetEntry).filter((entry) => entry !== null),
    videoProjects,
    scenarioProjects,
    scenarioAssets: rawScenarioAssets
      .map(parseScenarioAssetEntry)
      .filter((entry) => entry !== null),
    reviewWorkspaces: rawReviewWorkspaces
      .map(parseVideoWorkspace)
      .filter((entry) => entry !== null),
    mediaById: new Map(
      rawMedia
        .map(parseMediaLibraryEntry)
        .filter((entry) => entry !== null)
        .map((entry) => [entry.id, entry])
    ),
  };
}

function projectUsageFromSnapshot(
  mediaId: string,
  snapshot: UsageSnapshot
): MediaAssetProjectUsage[] {
  const { mediaById, videoProjects, scenarioProjects, scenarioAssets, reviewWorkspaces } = snapshot;
  const root = mediaById.get(mediaId);
  if (!root) return [];
  const media = mediaDependencyTarget(root, snapshot.projectAssets);
  const usage: MediaAssetProjectUsage[] = [];
  const scenarioChildrenForMedia = scenarioAssets.filter((child) =>
    scenarioChildUsesMedia(child, media)
  );
  const scenarioChildIds = new Set(scenarioChildrenForMedia.map((child) => child.id));

  for (const entry of videoProjects) {
    const project = entry.project;
    const primary = isVideoPrimaryMediaSource(project, media);
    const attached = project.assets.some((asset) =>
      videoSourceUsesMedia(asset.source, media, scenarioChildIds)
    );
    if (primary || attached) {
      usage.push({ id: project.id, kind: 'video', name: project.name, primary });
    }
  }

  const scenarioIds = new Set(scenarioChildrenForMedia.map((child) => child.projectId));
  for (const entry of scenarioProjects) {
    if (scenarioIds.has(entry.id)) {
      usage.push({ id: entry.id, kind: 'scenario', name: entry.project.name, primary: false });
    }
  }

  for (const workspace of reviewWorkspaces) {
    if (workspace.aggregateId === mediaId) continue;
    const attached = reviewWorkspaceUsesMedia(workspace, media);
    if (attached) {
      usage.push({
        id: workspace.aggregateId,
        kind: 'review',
        name: mediaById.get(workspace.aggregateId)?.filename ?? root.filename,
        primary: false,
      });
    }
  }

  return usage;
}

/** Read-only projection from authoritative project documents, not a cached counter. */
export async function listMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  const db = await initDB();
  if (!parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, mediaId))) return [];
  return projectUsageFromSnapshot(mediaId, await loadUsageSnapshot(db));
}

/** One fresh authoritative read for a deletion selection; never uses the advisory preview cache. */
export async function listMediaAssetProjectUsageBatch(
  mediaIds: readonly string[]
): Promise<Map<string, MediaAssetProjectUsage[]>> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return new Map();
  const snapshot = await loadUsageSnapshot();
  return new Map(ids.map((id) => [id, projectUsageFromSnapshot(id, snapshot)]));
}

// This snapshot serves only the advisory Gallery inspector. Mutating consumers use the direct read above.
const PREVIEW_USAGE_SNAPSHOT_MS = 5_000;
let previewSnapshot: {
  promise: Promise<UsageSnapshot>;
  expiresAt: number;
  revision: number;
  releaseTimer: ReturnType<typeof setTimeout>;
} | null = null;
let previewRevision = 0;
let previewSubscriptionReady = false;
const previewListeners = new Set<() => void>();

function invalidatePreviewUsage() {
  previewRevision += 1;
  if (previewSnapshot) clearTimeout(previewSnapshot.releaseTimer);
  previewSnapshot = null;
  for (const listener of previewListeners) listener();
}

function ensurePreviewInvalidation() {
  if (previewSubscriptionReady) return;
  previewSubscriptionReady = true;
  subscribeToMediaHubEvents((event) => {
    if (event.type === 'library-changed') invalidatePreviewUsage();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', invalidatePreviewUsage);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') invalidatePreviewUsage();
    });
  }
}

/** Subscribe to inspector snapshot changes caused by library/project writes or page reconciliation. */
export function subscribeToPreviewProjectUsageInvalidation(listener: () => void): () => void {
  ensurePreviewInvalidation();
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

/** Bounded, retryable advisory read shared by media switches within the Gallery page. */
export async function listPreviewMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  ensurePreviewInvalidation();
  const now = Date.now();
  if (!previewSnapshot || previewSnapshot.expiresAt <= now) {
    if (previewSnapshot) clearTimeout(previewSnapshot.releaseTimer);
    const revision = previewRevision;
    const promise = loadUsageSnapshot();
    const releaseTimer = setTimeout(() => {
      if (previewSnapshot?.promise === promise) previewSnapshot = null;
    }, PREVIEW_USAGE_SNAPSHOT_MS);
    previewSnapshot = {
      promise,
      expiresAt: now + PREVIEW_USAGE_SNAPSHOT_MS,
      revision,
      releaseTimer,
    };
    void promise.catch(() => {
      if (previewSnapshot?.promise === promise) {
        clearTimeout(previewSnapshot.releaseTimer);
        previewSnapshot = null;
      }
    });
  }
  const current = previewSnapshot;
  const snapshot = await current.promise;
  if (current.revision !== previewRevision) {
    return listPreviewMediaAssetProjectUsage(mediaId);
  }
  return projectUsageFromSnapshot(mediaId, snapshot);
}
