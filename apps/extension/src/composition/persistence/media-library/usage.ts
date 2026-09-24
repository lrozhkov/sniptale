import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { listScenarioProjectEntries } from '../scenario/projects';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import { listVideoProjectEntries } from '../projects';
import {
  initDB,
  SCENARIO_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from './read-guards';
import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import type { MediaLibraryEntry } from './contracts';
import type { ScenarioAssetEntry } from '../scenario/contracts';
import type { VideoProject } from '../../../features/video/project/types';

export interface MediaAssetProjectUsage {
  id: string;
  kind: 'scenario' | 'video' | 'review';
  name: string;
  primary: boolean;
}

function scenarioChildrenUsingMedia(
  media: MediaLibraryEntry,
  children: readonly ScenarioAssetEntry[]
): ScenarioAssetEntry[] {
  return children.filter(
    (child) =>
      child.borrowedMediaId === media.id ||
      (media.source.kind === 'stored-asset' &&
        !child.borrowedMediaId &&
        child.assetId === media.source.assetId &&
        (!media.id.startsWith('scenario-asset:') ||
          child.id === media.id.slice('scenario-asset:'.length)))
  );
}

function videoProjectUsesMedia(
  project: VideoProject,
  media: MediaLibraryEntry,
  scenarioChildIds: ReadonlySet<string>
): { attached: boolean; primary: boolean } {
  const source = media.source;
  const primary =
    source.kind === 'recording' &&
    (project.baseRecordingId === source.recordingId ||
      (project.source.kind === 'recording' && project.source.recordingId === source.recordingId));
  const attached = project.assets.some((asset) => {
    const ref = asset.source;
    if (ref.kind === 'library-asset') return ref.mediaId === media.id;
    if (ref.kind === 'recording')
      return source.kind === 'recording' && ref.recordingId === source.recordingId;
    if (ref.kind === 'project-asset')
      return source.kind === 'project-asset' && ref.projectAssetId === source.projectAssetId;
    return scenarioChildIds.has(ref.scenarioAssetId);
  });
  return { attached, primary };
}

/** Read-only projection from authoritative project documents, not a cached counter. */
export async function listMediaAssetProjectUsage(
  mediaId: string
): Promise<MediaAssetProjectUsage[]> {
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, mediaId));
  if (!media) return [];
  const [videoProjects, scenarioProjects, rawScenarioAssets, rawReviewWorkspaces, rawMedia] =
    await Promise.all([
      listVideoProjectEntries(),
      listScenarioProjectEntries(),
      db.getAll(SCENARIO_ASSETS_STORE),
      db.getAll(VIDEO_WORKSPACES_STORE),
      db.getAll(MEDIA_LIBRARY_STORE),
    ]);
  const scenarioAssets = rawScenarioAssets
    .map(parseScenarioAssetEntry)
    .filter((entry) => entry !== null);
  const mediaById = new Map(
    rawMedia
      .map(parseMediaLibraryEntry)
      .filter((entry) => entry !== null)
      .map((entry) => [entry.id, entry])
  );
  const usage: MediaAssetProjectUsage[] = [];
  const scenarioChildrenForMedia = scenarioChildrenUsingMedia(media, scenarioAssets);
  const scenarioChildIds = new Set(scenarioChildrenForMedia.map((child) => child.id));

  for (const entry of videoProjects) {
    const project = entry.project;
    const { attached, primary } = videoProjectUsesMedia(project, media, scenarioChildIds);
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

  for (const raw of rawReviewWorkspaces) {
    const workspace = parseVideoWorkspace(raw);
    if (!workspace) continue;
    const primary = workspace.aggregateId === mediaId;
    const attached =
      media.source.kind === 'project-asset' &&
      collectReviewAssetReferences(workspace).has(`project-asset:${media.source.projectAssetId}`);
    if (primary || attached) {
      usage.push({
        id: workspace.aggregateId,
        kind: 'review',
        name: mediaById.get(workspace.aggregateId)?.filename ?? media.filename,
        primary,
      });
    }
  }

  return usage;
}
