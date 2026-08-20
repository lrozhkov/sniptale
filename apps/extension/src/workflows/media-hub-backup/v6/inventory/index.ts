import {
  initDB,
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import { collectVideoProjectReferences } from '../../../../composition/persistence/library-lifecycle/references';
import { createRecordingMediaId } from '../../../../features/media-hub/media-id';
import { buildMediaHubBackupExportPlanV6 } from '../export';
import type { MediaHubBackupExportOptions } from '../contracts';
import { buildEffectBundleRootInventory } from './effect-bundles';
import { buildMediaRootInventory } from './media';
import { buildScenarioProjectRootInventory } from './scenario-projects';
import { buildVideoProjectRootInventory } from './video-projects';

async function dependencyMediaIds(
  db: Awaited<ReturnType<typeof initDB>>,
  options: MediaHubBackupExportOptions
): Promise<string[]> {
  if (options.scope === 'all') return [];
  const ids = new Set(options.selected?.mediaAssetIds ?? []);
  for (const raw of await db.getAll(VIDEO_PROJECTS_STORE)) {
    const entry = parseVideoProjectEntry(raw);
    if (!entry || !options.selected?.videoProjectIds.includes(entry.id)) continue;
    for (const id of collectVideoProjectReferences(entry).recordingIds)
      ids.add(createRecordingMediaId(id));
  }
  const selectedScenarios = new Set(options.selected?.scenarioProjectIds ?? []);
  for (const raw of await db.getAll(SCENARIO_ASSETS_STORE)) {
    const entry = parseScenarioAssetEntry(raw);
    if (entry?.galleryAssetId && selectedScenarios.has(entry.projectId))
      ids.add(entry.galleryAssetId);
  }
  return [...ids];
}

export async function buildMediaHubBackupExportPlanFromLibraryV6(
  options: MediaHubBackupExportOptions
) {
  const db = await initDB();
  const selectedIds = await dependencyMediaIds(db, options);
  const effectiveOptions: MediaHubBackupExportOptions =
    options.scope === 'selected'
      ? {
          ...options,
          selected: {
            mediaAssetIds: selectedIds,
            scenarioProjectIds: options.selected?.scenarioProjectIds ?? [],
            videoProjectIds: options.selected?.videoProjectIds ?? [],
          },
        }
      : options;
  const items = (await db.getAll(MEDIA_LIBRARY_STORE))
    .map(parseMediaLibraryEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ ...entry, hasThumbnail: false }));
  const [media, effects, videoProjects, scenarioProjects] = await Promise.all([
    buildMediaRootInventory({ db, items, options: effectiveOptions }),
    buildEffectBundleRootInventory(db),
    buildVideoProjectRootInventory({ db, options: effectiveOptions }),
    buildScenarioProjectRootInventory({ db, options: effectiveOptions }),
  ]);
  return buildMediaHubBackupExportPlanV6({
    privacy: {
      includeSourceMetadata: options.includeSourceMetadata,
      includeTelemetry: options.includeTelemetry,
      includeWebSnapshots: options.includeWebSnapshots,
    },
    roots: [...media, ...effects, ...videoProjects, ...scenarioProjects],
  });
}
