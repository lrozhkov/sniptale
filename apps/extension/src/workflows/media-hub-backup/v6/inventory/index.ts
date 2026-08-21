import {
  initDB,
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseScenarioProjectEntry } from '../../../../composition/persistence/scenario/read-guards';
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
): Promise<{ required: Set<string>; selected: string[] }> {
  if (options.scope === 'all') return { required: new Set(), selected: [] };
  const ids = new Set(options.selected?.mediaAssetIds ?? []);
  const required = new Set<string>();
  for (const raw of await db.getAll(VIDEO_PROJECTS_STORE)) {
    const entry = parseVideoProjectEntry(raw);
    if (
      !entry ||
      !options.selected?.videoProjectIds.includes(entry.id) ||
      (entry.lifecycle?.storageClass === 'temporary' && !options.includeDrafts)
    )
      continue;
    for (const id of collectVideoProjectReferences(entry).recordingIds) {
      const mediaId = createRecordingMediaId(id);
      ids.add(mediaId);
      required.add(mediaId);
    }
  }
  const selectedScenarios = new Set(
    (await db.getAll(SCENARIO_PROJECTS_STORE)).flatMap((raw) => {
      const entry = parseScenarioProjectEntry(raw);
      return entry &&
        options.selected?.scenarioProjectIds.includes(entry.id) &&
        (entry.lifecycle?.storageClass !== 'temporary' || options.includeDrafts)
        ? [entry.id]
        : [];
    })
  );
  for (const raw of await db.getAll(SCENARIO_ASSETS_STORE)) {
    const entry = parseScenarioAssetEntry(raw);
    if (entry?.galleryAssetId && selectedScenarios.has(entry.projectId)) {
      ids.add(entry.galleryAssetId);
      required.add(entry.galleryAssetId);
    }
  }
  return { required, selected: [...ids] };
}

export async function buildMediaHubBackupExportPlanFromLibraryV6(
  options: MediaHubBackupExportOptions
) {
  const db = await initDB();
  const mediaSelection = await dependencyMediaIds(db, options);
  const effectiveOptions: MediaHubBackupExportOptions =
    options.scope === 'selected'
      ? {
          ...options,
          selected: {
            mediaAssetIds: mediaSelection.selected,
            scenarioProjectIds: options.selected?.scenarioProjectIds ?? [],
            videoProjectIds: options.selected?.videoProjectIds ?? [],
          },
        }
      : options;
  const items = (await db.getAll(MEDIA_LIBRARY_STORE))
    .map(parseMediaLibraryEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ ...entry, hasThumbnail: false }));
  const paths = createArchivePathAllocator();
  const media = await buildMediaRootInventory({
    db,
    items,
    options: effectiveOptions,
    paths,
  });
  const exportedMediaIds = new Set(media.map((root) => root.descriptor.rootId));
  const missingDependency = [...mediaSelection.required].find((id) => !exportedMediaIds.has(id));
  if (missingDependency) {
    throw new Error(
      `Selected project requires an excluded draft media item: ${missingDependency}.`
    );
  }
  const effects = await buildEffectBundleRootInventory(db, paths);
  const videoProjects = await buildVideoProjectRootInventory({
    db,
    options: effectiveOptions,
    paths,
  });
  const scenarioProjects = await buildScenarioProjectRootInventory({
    db,
    options: effectiveOptions,
    paths,
  });
  return buildMediaHubBackupExportPlanV6({
    privacy: {
      includeSourceMetadata: options.includeSourceMetadata,
      includeTelemetry: options.includeTelemetry,
      includeWebSnapshots: options.includeWebSnapshots,
    },
    roots: [...media, ...effects, ...videoProjects, ...scenarioProjects],
  });
}
