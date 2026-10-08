import { readIndexedProjectUsage } from './usage-index';
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

/** Subscribe to advisory relationship changes with page-scoped listener cleanup. */
export function subscribeToPreviewProjectUsageInvalidation(listener: () => void): () => void {
  const unsubscribe = subscribeToMediaHubEvents((event) => {
    if (event.type === 'library-changed') listener();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') listener();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', listener);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', listener);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** Indexed advisory lookup; deletion consumers deliberately retain the fresh graph read above. */
export function listPreviewMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  return readIndexedProjectUsage(mediaId);
}
