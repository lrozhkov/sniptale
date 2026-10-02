import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { collectReviewAssetReferences } from '../../../../composition/persistence/review-workspaces/asset-refs';
import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  VIDEO_WORKSPACES_STORE,
  type initDB,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import {
  parseScenarioAssetEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { collectVideoProjectReferences } from '../../../../composition/persistence/library-lifecycle/references';
import { createRecordingMediaId } from '../../../../features/media-hub/media-id';
import { scenarioLibraryMediaId } from '../../../../composition/persistence/scenario/library-publication';
import type { MediaHubBackupExportOptions } from '../contracts';

interface BackupDependencySelection {
  media: { required: Set<string>; selected: string[] };
  scenarios: { required: Set<string>; selected: string[] };
}

function admittedVideoProjects(rows: unknown[], options: MediaHubBackupExportOptions) {
  return rows.flatMap((raw) => {
    const entry = parseVideoProjectEntry(raw);
    if (
      !entry ||
      !options.selected?.videoProjectIds.includes(entry.id) ||
      (entry.lifecycle?.storageClass === 'temporary' && !options.includeDrafts)
    ) {
      return [];
    }
    return [entry];
  });
}

function indexScenarioAssets(rows: unknown[]) {
  return new Map(
    rows.flatMap((raw) => {
      const entry = parseScenarioAssetEntry(raw);
      return entry ? [[entry.id, entry] as const] : [];
    })
  );
}

function collectVideoDependencies(
  projects: ReturnType<typeof admittedVideoProjects>,
  scenarioAssets: ReturnType<typeof indexScenarioAssets>,
  published: ReadonlySet<string>
) {
  const mediaIds = new Set<string>();
  const scenarioIds = new Set<string>();
  for (const entry of projects) {
    const references = collectVideoProjectReferences(entry);
    for (const id of references.projectAssetIds) {
      const mediaId = `project-asset:${id}`;
      if (published.has(mediaId)) mediaIds.add(mediaId);
    }
    for (const id of references.libraryMediaIds) mediaIds.add(id);
    for (const id of references.recordingIds) {
      mediaIds.add(createRecordingMediaId(id));
    }
    if (entry.project.source.kind === 'scenario') {
      scenarioIds.add(entry.project.source.scenarioProjectId);
    }
    for (const asset of entry.project.assets) {
      if (asset.source.kind === 'library-asset') {
        mediaIds.add(asset.source.mediaId);
        continue;
      }
      if (asset.source.kind !== 'scenario-asset') continue;
      const scenarioAsset = scenarioAssets.get(asset.source.scenarioAssetId);
      if (!scenarioAsset) {
        throw new Error(
          `Selected video project requires a missing scenario asset: ${asset.source.scenarioAssetId}.`
        );
      }
      scenarioIds.add(scenarioAsset.projectId);
    }
  }
  return { mediaIds, scenarioIds };
}

function admittedScenarioIds(
  rows: unknown[],
  selectedIds: ReadonlySet<string>,
  includeDrafts: boolean
): Set<string> {
  return new Set(
    rows.flatMap((raw) => {
      const entry = parseScenarioProjectEntry(raw);
      return entry &&
        selectedIds.has(entry.id) &&
        (entry.lifecycle?.storageClass !== 'temporary' || includeDrafts)
        ? [entry.id]
        : [];
    })
  );
}

export async function resolveBackupDependencySelection(
  db: Awaited<ReturnType<typeof initDB>>,
  options: MediaHubBackupExportOptions
): Promise<BackupDependencySelection> {
  if (options.scope === 'all') {
    return {
      media: { required: new Set(), selected: [] },
      scenarios: { required: new Set(), selected: [] },
    };
  }
  const scenarioAssets = indexScenarioAssets(await db.getAll(SCENARIO_ASSETS_STORE));
  const projects = admittedVideoProjects(await db.getAll(VIDEO_PROJECTS_STORE), options);
  const published = new Set(
    (await db.getAll(MEDIA_LIBRARY_STORE)).flatMap((raw) => {
      const media = parseMediaLibraryEntry(raw);
      return media ? [media.id] : [];
    })
  );
  const videoDependencies = collectVideoDependencies(projects, scenarioAssets, published);
  const selectedScenarioIds = new Set([
    ...(options.selected?.scenarioProjectIds ?? []),
    ...videoDependencies.scenarioIds,
  ]);
  const admittedScenarios = admittedScenarioIds(
    await db.getAll(SCENARIO_PROJECTS_STORE),
    selectedScenarioIds,
    options.includeDrafts
  );
  const selectedMediaIds = new Set(options.selected?.mediaAssetIds ?? []);
  for (const mediaId of videoDependencies.mediaIds) selectedMediaIds.add(mediaId);
  for (const asset of scenarioAssets.values()) {
    if (!admittedScenarios.has(asset.projectId)) continue;
    const mediaId =
      asset.borrowedMediaId ?? asset.galleryAssetId ?? scenarioLibraryMediaId(asset.id);
    selectedMediaIds.add(mediaId);
    videoDependencies.mediaIds.add(mediaId);
  }
  const reviewOwners = new Set(
    projects.flatMap((entry) =>
      [...collectVideoProjectReferences(entry).projectAssetIds].map((id) => `project-asset:${id}`)
    )
  );
  const projectIds = new Set(projects.map((entry) => entry.id));
  for (const raw of await db.getAll(PROJECT_EXPORTS_STORE)) {
    const entry = parseProjectExportEntry(raw);
    if (entry && projectIds.has(entry.projectId)) {
      const mediaId = `export:${entry.id}`;
      reviewOwners.add(mediaId);
      if (published.has(mediaId)) {
        selectedMediaIds.add(mediaId);
        videoDependencies.mediaIds.add(mediaId);
      }
    }
  }
  const reviews = (await db.getAll(VIDEO_WORKSPACES_STORE)).flatMap((raw) => {
    const workspace = parseVideoWorkspace(raw);
    return workspace ? [workspace] : [];
  });
  const projectAssets = (await db.getAll(PROJECT_ASSETS_STORE)).flatMap((raw) => {
    const entry = parseProjectAssetEntry(raw);
    return entry ? [entry] : [];
  });
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const asset of projectAssets) {
      const id = `project-asset:${asset.id}`;
      if (
        !asset.originMediaId ||
        (!reviewOwners.has(id) && !selectedMediaIds.has(id)) ||
        selectedMediaIds.has(asset.originMediaId)
      )
        continue;
      selectedMediaIds.add(asset.originMediaId);
      videoDependencies.mediaIds.add(asset.originMediaId);
      expanded = true;
    }
    for (const workspace of reviews) {
      if (!reviewOwners.has(workspace.aggregateId) && !selectedMediaIds.has(workspace.aggregateId))
        continue;
      for (const reference of collectReviewAssetReferences(workspace)) {
        if (!reviewOwners.has(reference)) {
          reviewOwners.add(reference);
          expanded = true;
        }
        if (!published.has(reference) || selectedMediaIds.has(reference)) continue;
        selectedMediaIds.add(reference);
        videoDependencies.mediaIds.add(reference);
        expanded = true;
      }
    }
  }
  return {
    media: { required: videoDependencies.mediaIds, selected: [...selectedMediaIds] },
    scenarios: {
      required: videoDependencies.scenarioIds,
      selected: [...selectedScenarioIds],
    },
  };
}
