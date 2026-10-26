import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';
import { parsePortableVideoProjectMetadata } from '../root-codecs/projects';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
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
import { MEDIA_HUB_BACKUP_SHARED_LAYOUT } from '../layout';

export async function buildMediaHubBackupExportPlanFromLibraryV6(
  options: MediaHubBackupExportOptions,
  admission: { expectedReview?: VideoWorkspaceSnapshot | undefined; requireSelected?: boolean } = {}
) {
  const db = await initDB();
  const dependencies = await resolveBackupDependencySelection(db, options);
  const effectiveOptions = withRequiredBackupDependencies(options, dependencies);
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
  const coveredProjectMediaIds = await coveredProjectMedia(videoProjects);
  const media = await buildMediaRootInventory({
    coveredProjectMediaIds,
    expectedReview: admission.expectedReview,
    reviewWorkspaceHeads: await db.getAll(VIDEO_WORKSPACES_STORE),
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
  const effects =
    options.scope === 'all' || videoProjects.length > 0
      ? await buildEffectBundleRootInventory(db, paths)
      : [];

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
  if (admission.requireSelected)
    assertExplicitBackupTargets(options, {
      mediaAssetIds: new Set([...exportedMediaIds, ...coveredProjectMediaIds]),
      scenarioProjectIds: exportedScenarioIds,
      videoProjectIds: new Set(videoProjects.map((root) => root.descriptor.rootId)),
    });
  return buildMediaHubBackupExportPlanV6({
    layout: MEDIA_HUB_BACKUP_SHARED_LAYOUT,
    ...(options.scope === 'all' ? { galleryViews: await listGallerySavedViews() } : {}),
    privacy: {
      includeSourceMetadata: options.includeSourceMetadata,
      includeTelemetry: options.includeTelemetry,
      includeWebSnapshots: options.includeWebSnapshots,
    },
    roots: [...media, ...effects, ...scenarioProjects, ...videoProjects],
  });
}

async function coveredProjectMedia(
  videoProjects: Awaited<ReturnType<typeof buildVideoProjectRootInventory>>
): Promise<Set<string>> {
  const coveredProjectMediaIds = new Set<string>();
  for (const root of videoProjects) {
    const { metadata } = await root.load();
    const project = parsePortableVideoProjectMetadata(metadata);
    for (const asset of project.projectAssets) {
      if (!asset.libraryMediaId && asset.publishToLibrary !== false)
        coveredProjectMediaIds.add(`project-asset:${asset.entry.id}`);
    }
    for (const item of project.projectExports) {
      if (!item.libraryMediaId) coveredProjectMediaIds.add(`export:${item.entry.id}`);
    }
  }
  return coveredProjectMediaIds;
}

/** Direct item commands must not silently omit requested roots; the full export modal retains its filters. */
function assertExplicitBackupTargets(
  options: MediaHubBackupExportOptions,
  available: Record<keyof NonNullable<MediaHubBackupExportOptions['selected']>, ReadonlySet<string>>
) {
  if (options.scope !== 'selected' || !options.selected) return;
  for (const kind of ['mediaAssetIds', 'scenarioProjectIds', 'videoProjectIds'] as const) {
    if (options.selected[kind].some((id) => !available[kind].has(id)))
      throw new Error('A selected backup item is missing or excluded.');
  }
}

/** Preserve explicit roots and add only dependencies admitted by the existing resolver. */
function withRequiredBackupDependencies(
  options: MediaHubBackupExportOptions,
  dependencies: Awaited<ReturnType<typeof resolveBackupDependencySelection>>
): MediaHubBackupExportOptions {
  if (options.scope !== 'selected') return options;
  return {
    ...options,
    selected: {
      mediaAssetIds: dependencies.media.selected,
      scenarioProjectIds: dependencies.scenarios.selected,
      videoProjectIds: options.selected?.videoProjectIds ?? [],
    },
  };
}
