import { readDeletionDependencyRows } from './deletion-index';
import { readScenarioStorage } from '../scenario/storage';
import type { IDBPTransaction } from 'idb';
import { readIndexedProjectUsage } from './usage-index';
import { parseProjectAssetEntry, parseVideoProjectEntry } from '../projects/read-guards';
import {
  mediaDependencyTarget,
  scenarioChildUsesMedia,
  videoSourceUsesMedia,
  isVideoPrimaryMediaSource,
  reviewWorkspaceUsesMedia,
} from './dependencies';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import {
  initDB,
  VIDEO_PROJECTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
  SCENARIO_ASSETS_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from './read-guards';
import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { MediaAssetProjectUsage, MediaLibraryEntry } from './contracts';
import type { ScenarioAssetEntry } from '../scenario/contracts';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';

export type { MediaAssetProjectUsage } from './contracts';

interface UsageSnapshot {
  mediaById: Map<string, MediaLibraryEntry>;
  videoProjects: NonNullable<ReturnType<typeof parseVideoProjectEntry>>[];
  scenarioProjects: NonNullable<ReturnType<typeof parseScenarioProjectEntry>>[];
  scenarioAssets: ScenarioAssetEntry[];
  projectAssets: NonNullable<ReturnType<typeof parseProjectAssetEntry>>[];
  reviewWorkspaces: NonNullable<ReturnType<typeof parseVideoWorkspace>>[];
}

async function loadUsageSnapshot(
  tx: IDBPTransaction<unknown, string[], 'readonly'>,
  root: MediaLibraryEntry
): Promise<UsageSnapshot> {
  const matches = await readDeletionDependencyRows(tx, root);
  const scenarioAssets = matches.children
    .map(parseScenarioAssetEntry)
    .filter((entry) => entry !== null);
  const scenarioIds = [
    ...new Set(
      scenarioAssets
        .filter((child) => scenarioChildUsesMedia(child, matches.target))
        .map((child) => child.projectId)
    ),
  ];
  const scenarioProjects = (
    await Promise.all(
      scenarioIds.map(async (id) =>
        parseScenarioProjectEntry((await readScenarioStorage(tx, id)).logical)
      )
    )
  ).filter((entry) => entry !== null);
  const reviewWorkspaces = matches.reviews
    .map(parseVideoWorkspace)
    .filter((entry) => entry !== null);
  const mediaById = new Map([[root.id, root]]);
  for (const workspace of reviewWorkspaces) {
    const id = workspace.sourceMediaId ?? workspace.aggregateId;
    if (mediaById.has(id)) continue;
    const owner = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(id));
    if (owner) mediaById.set(id, owner);
  }
  return {
    projectAssets: matches.projectAssets
      .map(parseProjectAssetEntry)
      .filter((entry) => entry !== null),
    videoProjects: matches.videos.map(parseVideoProjectEntry).filter((entry) => entry !== null),
    scenarioProjects,
    scenarioAssets,
    reviewWorkspaces,
    mediaById,
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
    const primary = (workspace.sourceMediaId ?? workspace.aggregateId) === mediaId;
    const attached = reviewWorkspaceUsesMedia(workspace, media);
    if (primary || attached) {
      usage.push({
        id: workspace.aggregateId,
        kind: 'review',
        name:
          workspace.project?.name ??
          mediaById.get(workspace.sourceMediaId ?? workspace.aggregateId)?.filename ??
          root.filename,
        primary,
      });
    }
  }

  return usage;
}

/** Read selected authoritative source documents in a fresh native snapshot. */
export async function listMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  return (await listMediaAssetProjectUsageBatch([mediaId])).get(mediaId) ?? [];
}

/** One fresh snapshot for the deletion selection; absence uses the complete native index. */
export async function listMediaAssetProjectUsageBatch(
  mediaIds: readonly string[]
): Promise<Map<string, MediaAssetProjectUsage[]>> {
  const ids = [...new Set(mediaIds)];
  if (!ids.length) return new Map();
  const db = await initDB();
  const tx = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      VIDEO_PROJECTS_STORE,
      PROJECT_ASSETS_STORE,
      SCENARIO_ASSETS_STORE,
      SCENARIO_PROJECTS_STORE,
      SCENARIO_PROJECT_HISTORY_STORE,
      SCENARIO_PROJECT_UNITS_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
    ],
    'readonly'
  );
  try {
    const result = new Map<string, MediaAssetProjectUsage[]>();
    for (const id of ids) {
      const root = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(id));
      result.set(id, root ? projectUsageFromSnapshot(id, await loadUsageSnapshot(tx, root)) : []);
    }
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The native snapshot may already be closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
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

/** Inspector lookup retains its existing advisory invalidation policy. */
export function listPreviewMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  return readIndexedProjectUsage(mediaId);
}
