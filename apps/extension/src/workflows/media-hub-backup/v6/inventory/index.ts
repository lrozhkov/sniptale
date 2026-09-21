import { parsePortableVideoProjectMetadata } from '../root-codecs/projects';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { listGallerySavedViews } from '../../../../composition/persistence/gallery-saved-views';
import { buildMediaHubBackupExportPlanV6 } from '../export';
import type { MediaHubBackupExportOptions } from '../contracts';
import { buildEffectBundleRootInventory } from './effect-bundles';
import { buildMediaRootInventory } from './media';
import { buildScenarioProjectRootInventory } from './scenario-projects';
import { buildVideoProjectRootInventory } from './video-projects';
import { resolveBackupDependencySelection } from './scenario-dependencies';

export async function buildMediaHubBackupExportPlanFromLibraryV6(
  options: MediaHubBackupExportOptions
) {
  const db = await initDB();
  const dependencies = await resolveBackupDependencySelection(db, options);
  const effectiveOptions: MediaHubBackupExportOptions =
    options.scope === 'selected'
      ? {
          ...options,
          selected: {
            mediaAssetIds: dependencies.media.selected,
            scenarioProjectIds: dependencies.scenarios.selected,
            videoProjectIds: options.selected?.videoProjectIds ?? [],
          },
        }
      : options;
  const items = (await db.getAll(MEDIA_LIBRARY_STORE))
    .map(parseMediaLibraryEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ ...entry, hasThumbnail: false }));
  const paths = createArchivePathAllocator();
  const videoProjects = await buildVideoProjectRootInventory({
    db,
    options: effectiveOptions,
    paths,
  });
  const coveredProjectMediaIds = new Set<string>();
  for (const root of videoProjects) {
    const { metadata } = await root.load();
    const project = parsePortableVideoProjectMetadata(metadata);
    for (const asset of project.projectAssets)
      coveredProjectMediaIds.add(`project-asset:${asset.entry.id}`);
    for (const item of project.projectExports)
      coveredProjectMediaIds.add(`export:${item.entry.id}`);
  }
  const media = await buildMediaRootInventory({
    coveredProjectMediaIds,
    db,
    items,
    options: effectiveOptions,
    paths,
  });
  const exportedMediaIds = new Set(media.map((root) => root.descriptor.rootId));
  const missingDependency = [...dependencies.media.required].find(
    (id) => !exportedMediaIds.has(id)
  );
  if (missingDependency) {
    throw new Error(
      `Selected project requires an excluded draft media item: ${missingDependency}.`
    );
  }
  const effects = await buildEffectBundleRootInventory(db, paths);

  const scenarioProjects = await buildScenarioProjectRootInventory({
    db,
    options: effectiveOptions,
    paths,
  });
  const exportedScenarioIds = new Set(scenarioProjects.map((root) => root.descriptor.rootId));
  const missingScenarioDependency = [...dependencies.scenarios.required].find(
    (id) => !exportedScenarioIds.has(id)
  );
  if (missingScenarioDependency) {
    throw new Error(
      `Selected video project requires an excluded scenario project: ${missingScenarioDependency}.`
    );
  }
  return buildMediaHubBackupExportPlanV6({
    ...(options.scope === 'all' ? { galleryViews: await listGallerySavedViews() } : {}),
    privacy: {
      includeSourceMetadata: options.includeSourceMetadata,
      includeTelemetry: options.includeTelemetry,
      includeWebSnapshots: options.includeWebSnapshots,
    },
    roots: [...media, ...effects, ...scenarioProjects, ...videoProjects],
  });
}
