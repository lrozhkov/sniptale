import { readPersistedSyncCatalogCards } from '../../workflows/sync-transfer/catalog-view';
import { createRemoteRootGalleryItem } from '../library/items';
import { listVideoWorkspaceSummaries } from '../../composition/persistence/review-workspaces/summaries';
import { runStorageStartupPhase } from '../../composition/persistence/infrastructure/startup-diagnostics';
import {
  listMediaThumbnailIds,
  listMediaLibrary,
} from '../../composition/persistence/media-library/index.library.ts';
import { listVideoProjects } from '../../composition/persistence/projects/index';
import { listScenarioExportRecords } from '../../composition/persistence/scenario/store/project-records/exports';
import { listScenarioProjectSummaries } from '../../composition/persistence/scenario/store/project-records/index';
import {
  getStorageEstimateInfo,
  type StorageEstimateInfo,
} from '../../features/media-hub/storage-capacity';
import { createGalleryItems, type GalleryItem } from '../library/items';
import { isGalleryMediaItem } from '../library/items';
import { isGalleryVideoProjectItem } from '../library/items';
import { loadSettings } from '../../composition/persistence/settings';
import {
  DEFAULT_LOCAL_STORAGE_POLICY,
  getDraftRetentionMs,
} from '../../composition/persistence/library-lifecycle';
import { listAggregatePresentations } from '../../composition/persistence/aggregate-presentations';

async function loadScenarioExports(projectId: string) {
  return [projectId, await listScenarioExportRecords(projectId)] as const;
}

async function loadScenarioExportsByProject(projectIds: string[]) {
  return Promise.all(projectIds.map((projectId) => loadScenarioExports(projectId)));
}

async function loadRemoteGalleryItems() {
  const cards = await readPersistedSyncCatalogCards();
  return {
    items: cards.filter((card) => !card.deleted).map(createRemoteRootGalleryItem),
    unavailable: false,
  };
}

export async function loadGalleryLibrarySnapshot(
  options: { includeRemote?: boolean } = {}
): Promise<{
  estimate: Promise<StorageEstimateInfo | null>;
  nextItems: GalleryItem[];
  remoteUnavailable?: boolean;
}> {
  const settings = await loadSettings().catch(() => null);
  const policy = settings?.localStoragePolicy ?? DEFAULT_LOCAL_STORAGE_POLICY;
  const [
    mediaItems,
    scenarioProjects,
    thumbnailIds,
    videoProjects,
    presentations,
    quickEditProjects,
    remote,
  ] = await Promise.all([
    runStorageStartupPhase('gallery-media-list', listMediaLibrary),
    runStorageStartupPhase('gallery-scenario-list', listScenarioProjectSummaries),
    runStorageStartupPhase('gallery-thumbnail-list', listMediaThumbnailIds),
    runStorageStartupPhase('gallery-video-project-list', listVideoProjects),
    runStorageStartupPhase('gallery-presentations', listAggregatePresentations),
    runStorageStartupPhase('gallery-quick-edit-project-list', listVideoWorkspaceSummaries),
    options.includeRemote === false
      ? { items: [], unavailable: false }
      : loadRemoteGalleryItems().catch(() => ({ items: [], unavailable: true })),
  ]);
  const scenarioExportsByProject = await runStorageStartupPhase('gallery-scenario-exports', () =>
    loadScenarioExportsByProject(scenarioProjects.map((project) => project.id))
  );

  const localItems = createGalleryItems({
    mediaItems,
    quickEditProjects,
    presentations,
    scenarioExportsByProjectId: new Map(scenarioExportsByProject),
    scenarioProjects,
    thumbnailIds: new Set(thumbnailIds),
    videoProjects,
  }).map((item) => {
    if (item.lifecycle?.storageClass !== 'temporary' || item.lifecycle.trashedAt !== undefined)
      return item;
    const retention = getDraftRetentionMs(
      policy,
      (isGalleryMediaItem(item) && item.source.kind === 'recording') ||
        (isGalleryVideoProjectItem(item) && item.project.retentionKind === 'video')
        ? 'video'
        : 'ordinary'
    );
    return {
      ...item,
      expiresAt: retention === null ? null : item.lifecycle.updatedAt + retention,
    };
  });
  const localRoots = new Set(
    localItems.flatMap((item) => {
      const kind =
        item.type === 'video-project'
          ? 'video-project'
          : item.type === 'quick-edit-project'
            ? 'video-review'
            : isGalleryMediaItem(item)
              ? 'media'
              : null;
      return kind ? [JSON.stringify([kind, item.entityId ?? item.id])] : [];
    })
  );
  const remoteItems = remote.items.filter(
    (item) =>
      !item.remote.materialized ||
      !localRoots.has(
        JSON.stringify([item.remote.selection.rootKind, item.remote.selection.rootId])
      )
  );
  return {
    ...(remote.unavailable ? { remoteUnavailable: true } : {}),
    estimate: runStorageStartupPhase('gallery-storage-estimate', getStorageEstimateInfo).catch(
      () => null
    ),
    nextItems: [...localItems, ...remoteItems],
  };
}
