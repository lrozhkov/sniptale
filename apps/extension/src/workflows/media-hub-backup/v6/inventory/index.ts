import { createRecordingCursorTrajectoryStore } from '../../../../composition/persistence/recordings/cursor-trajectory/store';
import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';
import { parsePortableVideoProjectMetadata } from '../root-codecs/projects';
import {
  initDB,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { listGallerySavedViews } from '../../../../composition/persistence/gallery-saved-views';
import { buildMediaHubBackupExportPlanV6 } from '../export';
import type { MediaHubBackupExportOptions, MediaHubBackupRootPreparation } from '../contracts';
import { buildEffectBundleRootInventory } from './effect-bundles';
import { buildMediaRootInventory } from './media';
import { buildScenarioProjectRootInventory } from './scenario-projects';
import { buildVideoProjectRootInventory } from './video-projects';
import { resolveBackupDependencySelection } from './scenario-dependencies';
import { MEDIA_HUB_BACKUP_SHARED_LAYOUT } from '../layout';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/parser';

interface LibraryInventoryAdmission {
  expectedReview?: VideoWorkspaceSnapshot | undefined;
  requireSelected?: boolean;
  prepareRoot?: MediaHubBackupRootPreparation;
  archive?: boolean;
}

function selectLinkedImageProjects(workspaces: unknown[], selected: ReadonlySet<string> | null) {
  return workspaces.flatMap((row) => {
    if (
      !isRecord(row) ||
      row['sourceMediaId'] === undefined ||
      (selected !== null &&
        (typeof row['aggregateId'] !== 'string' || !selected.has(row['aggregateId'])))
    )
      return [];
    const entry = parseImageWorkspaceEntry(row);
    if (!entry?.sourceMediaId) throw new Error('Image project backup metadata is invalid.');
    return [{ ...entry, sourceMediaId: entry.sourceMediaId }];
  });
}

function imageInventoryIdentity(project: ReturnType<typeof selectLinkedImageProjects>[number]) {
  return JSON.stringify([
    project.aggregateId,
    project.sourceMediaId,
    project.revision,
    project.updatedAt,
    project.publicationId,
    project.lifecycle,
  ]);
}

function assertPortableImageWorkspaceSelection(
  workspaces: unknown[],
  selected: ReadonlySet<string> | null
): void {
  if (
    workspaces.some(
      (row) =>
        isRecord(row) &&
        row['sourceMediaId'] !== undefined &&
        (selected === null ||
          (typeof row['aggregateId'] === 'string' && selected.has(row['aggregateId'])))
    )
  ) {
    throw new Error('This backup format cannot include independent image projects.');
  }
}

async function collectNativeLibraryRoots(
  options: MediaHubBackupExportOptions,
  admission: LibraryInventoryAdmission
) {
  const db = await initDB();
  const selected = options.scope === 'all' ? null : new Set(options.selected?.mediaAssetIds);
  const checkImageProjects = selected === null || selected.size > 0;
  const snapshot = db.transaction([MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE], 'readonly');
  const mediaRead: Promise<unknown[]> = snapshot.objectStore(MEDIA_LIBRARY_STORE).getAll();
  const imageRead: Promise<unknown[]> = checkImageProjects
    ? snapshot.objectStore(IMAGE_WORKSPACES_STORE).getAll()
    : Promise.resolve([]);
  const [mediaRows, workspaces] = await Promise.all([mediaRead, imageRead]);
  await snapshot.done;
  if (!admission.archive) assertPortableImageWorkspaceSelection(workspaces, selected);
  const imageProjects = admission.archive ? selectLinkedImageProjects(workspaces, selected) : [];
  const reviewWorkspaceHeads: unknown[] = await db.getAll(VIDEO_WORKSPACES_STORE);
  const dependencies = await resolveBackupDependencySelection(db, options, {
    includeAllDependencies: Boolean(
      admission.archive &&
      mediaRows.some((raw) => isRecord(raw) && raw['savedIndependently'] === false)
    ),
  });
  const linkedOriginalIds = new Set(imageProjects.map((project) => project.sourceMediaId));
  if (admission.archive) {
    for (const row of reviewWorkspaceHeads) {
      if (
        isRecord(row) &&
        typeof row['sourceMediaId'] === 'string' &&
        typeof row['aggregateId'] === 'string' &&
        (selected === null || selected.has(row['aggregateId']))
      )
        linkedOriginalIds.add(row['sourceMediaId']);
    }
    for (const id of linkedOriginalIds) dependencies.media.required.add(id);
    if (selected !== null)
      dependencies.media.selected = [
        ...new Set([...dependencies.media.selected, ...linkedOriginalIds]),
      ];
  }
  const effectiveOptions = withRequiredBackupDependencies(options, dependencies);
  const items = mediaRows
    .map(parseMediaLibraryEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ ...entry, hasThumbnail: false }));
  const paths = createArchivePathAllocator();
  const videoProjects = await buildVideoProjectRootInventory({
    db,
    options: effectiveOptions,
    ...(admission.prepareRoot ? { prepareRoot: admission.prepareRoot } : {}),
    paths,
  });
  const coveredProjectMediaIds = await coveredProjectMedia(videoProjects);
  for (const id of linkedOriginalIds) coveredProjectMediaIds.delete(id);
  const media = await buildMediaRootInventory({
    cursorStore: createRecordingCursorTrajectoryStore({
      database: async () => db,
      mintGeneration: () => crypto.randomUUID(),
    }),
    coveredProjectMediaIds,
    expectedReview: admission.expectedReview,
    reviewWorkspaceHeads,
    ...(admission.archive
      ? {
          imageProjects,
          includeLibraryRelationships: true,
          requiredMediaIds: dependencies.media.required,
        }
      : {}),
    db,
    items,
    options: effectiveOptions,
    ...(admission.prepareRoot ? { prepareRoot: admission.prepareRoot } : {}),
    paths,
  });
  const exportedMediaIds = new Set(media.map((root) => root.descriptor.rootId));
  const missingDependency = [...dependencies.media.required].find(
    (id) =>
      !exportedMediaIds.has(id) &&
      (linkedOriginalIds.has(id) ||
        (options.scope === 'selected' && !coveredProjectMediaIds.has(id)))
  );
  if (missingDependency) {
    throw new Error(
      `Selected project requires an excluded draft media item: ${missingDependency}.`
    );
  }
  const scenarioProjects = await buildScenarioProjectRootInventory({
    db,
    options: effectiveOptions,
    ...(admission.prepareRoot ? { prepareRoot: admission.prepareRoot } : {}),
    paths,
  });
  const exportedScenarioIds = new Set(scenarioProjects.map((root) => root.descriptor.rootId));
  const missingScenarioDependency = [...dependencies.scenarios.required].find(
    (id) => !exportedScenarioIds.has(id)
  );
  if (missingScenarioDependency && options.scope === 'selected') {
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
  // Individual root preparation can reread native state after the initial inventory.
  if (checkImageProjects) {
    const current: unknown[] = await db.getAll(IMAGE_WORKSPACES_STORE);
    if (admission.archive) {
      const currentProjects = selectLinkedImageProjects(current, selected);
      if (
        currentProjects.length !== imageProjects.length ||
        currentProjects.some(
          (project, index) =>
            imageInventoryIdentity(project) !== imageInventoryIdentity(imageProjects[index]!)
        )
      )
        throw new Error('Image project inventory changed during backup preparation.');
    } else {
      assertPortableImageWorkspaceSelection(current, selected);
    }
  }
  return { db, paths, media, scenarioProjects, videoProjects };
}

/** Prepare the canonical native graph without browser-storage-only archive settings. */
export async function prepareMediaHubBackupRootsFromLibraryV6(
  options: MediaHubBackupExportOptions,
  admission: { prepareRoot: MediaHubBackupRootPreparation; requireSelected?: boolean }
): Promise<void> {
  await collectNativeLibraryRoots(options, admission);
}

export async function buildMediaHubBackupExportPlanFromLibraryV6(
  options: MediaHubBackupExportOptions,
  admission: LibraryInventoryAdmission = {}
) {
  const { db, paths, media, scenarioProjects, videoProjects } = await collectNativeLibraryRoots(
    options,
    { ...admission, archive: true }
  );
  const effects = options.scope === 'all' ? await buildEffectBundleRootInventory(db, paths) : [];
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
