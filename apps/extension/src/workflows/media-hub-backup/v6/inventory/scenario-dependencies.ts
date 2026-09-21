import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
  type initDB,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import {
  parseScenarioAssetEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { collectVideoProjectReferences } from '../../../../composition/persistence/library-lifecycle/references';
import { createRecordingMediaId } from '../../../../features/media-hub/media-id';
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
  scenarioAssets: ReturnType<typeof indexScenarioAssets>
) {
  const mediaIds = new Set<string>();
  const scenarioIds = new Set<string>();
  for (const entry of projects) {
    for (const id of collectVideoProjectReferences(entry).recordingIds) {
      mediaIds.add(createRecordingMediaId(id));
    }
    if (entry.project.source.kind === 'scenario') {
      scenarioIds.add(entry.project.source.scenarioProjectId);
    }
    for (const asset of entry.project.assets) {
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
  const videoDependencies = collectVideoDependencies(
    admittedVideoProjects(await db.getAll(VIDEO_PROJECTS_STORE), options),
    scenarioAssets
  );
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
    if (asset.galleryAssetId && admittedScenarios.has(asset.projectId)) {
      selectedMediaIds.add(asset.galleryAssetId);
      videoDependencies.mediaIds.add(asset.galleryAssetId);
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
