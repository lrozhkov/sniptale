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
  cleanupDrafts,
  DEFAULT_LOCAL_STORAGE_POLICY,
  getDraftRetentionMs,
  repairTemporaryProjectLifecycles,
} from '../../composition/persistence/library-lifecycle';
import { listAggregatePresentations } from '../../composition/persistence/aggregate-presentations';
import { backfillScenarioLibraryAssets } from '../../composition/persistence/scenario/library-publication';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'GalleryLibrarySnapshot' });

async function loadScenarioExports(projectId: string) {
  return [projectId, await listScenarioExportRecords(projectId)] as const;
}

async function loadScenarioExportsByProject(projectIds: string[]) {
  return Promise.all(projectIds.map((projectId) => loadScenarioExports(projectId)));
}

export async function loadGalleryLibrarySnapshot(): Promise<{
  estimate: StorageEstimateInfo;
  nextItems: GalleryItem[];
}> {
  await runStorageStartupPhase('gallery-lifecycle-repair', () =>
    repairTemporaryProjectLifecycles()
  );
  await runStorageStartupPhase('gallery-scenario-backfill', backfillScenarioLibraryAssets);
  const settings = await loadSettings().catch(() => null);
  if (settings) {
    await runStorageStartupPhase('gallery-draft-cleanup', () =>
      cleanupDrafts({ policy: settings.localStoragePolicy })
    ).catch(() => {
      logger.warn('Draft maintenance failed; showing current library items.');
    });
  }
  const policy = settings?.localStoragePolicy ?? DEFAULT_LOCAL_STORAGE_POLICY;
  const [mediaItems, scenarioProjects, thumbnailIds, estimate, videoProjects, presentations] =
    await Promise.all([
      runStorageStartupPhase('gallery-media-list', listMediaLibrary),
      runStorageStartupPhase('gallery-scenario-list', listScenarioProjectSummaries),
      runStorageStartupPhase('gallery-thumbnail-list', listMediaThumbnailIds),
      runStorageStartupPhase('gallery-storage-estimate', getStorageEstimateInfo),
      runStorageStartupPhase('gallery-video-project-list', listVideoProjects),
      runStorageStartupPhase('gallery-presentations', listAggregatePresentations),
    ]);
  const scenarioExportsByProject = await runStorageStartupPhase('gallery-scenario-exports', () =>
    loadScenarioExportsByProject(scenarioProjects.map((project) => project.id))
  );

  return {
    estimate,
    nextItems: createGalleryItems({
      mediaItems,
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
    }),
  };
}
