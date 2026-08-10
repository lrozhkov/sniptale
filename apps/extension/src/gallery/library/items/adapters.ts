import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import type { VideoProjectListItem } from '../../../features/media-hub/video-project-list-items';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  GalleryItem,
  GalleryScenarioExportItem,
  GalleryScenarioItem,
  GalleryVideoProjectItem,
} from './types';
import { createGalleryMediaItem } from './types';
import type { LibraryLifecycle } from '../../../contracts/settings/library-lifecycle';
import type { AggregatePresentationEntry } from '../../../composition/persistence/aggregate-presentations';
import { serializeAggregateRef } from '../../../composition/persistence/aggregate-presentations';

function resolveLifecycle(
  lifecycle: ScenarioProjectSummary['lifecycle'] | VideoProjectListItem['lifecycle'],
  updatedAt: number
): LibraryLifecycle {
  return lifecycle ?? { savedAt: updatedAt, storageClass: 'library' as const, updatedAt };
}

export function createScenarioGalleryItem(project: ScenarioProjectSummary): GalleryScenarioItem {
  return {
    createdAt: project.createdAt,
    entityId: project.id,
    expiresAt: null,
    filename: project.name,
    hasThumbnail: false,
    id: `scenario:${project.id}`,
    kind: 'scenario',
    lifecycle: resolveLifecycle(project.lifecycle, project.updatedAt),
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: project.tags ?? [],
    updatedAt: project.updatedAt,
    width: null,
    height: null,
    duration: null,
    mimeType: 'application/x-sniptale-scenario',
    project,
    type: 'scenario',
  };
}

export function createScenarioExportGalleryItem(
  project: ScenarioProjectSummary,
  exportEntry: ScenarioExportEntry
): GalleryScenarioExportItem {
  return {
    createdAt: exportEntry.createdAt,
    entityId: exportEntry.id,
    exportEntry,
    expiresAt: null,
    filename: exportEntry.filename,
    format: exportEntry.format,
    hasThumbnail: false,
    id: `scenario-export:${exportEntry.id}`,
    kind: 'scenario-export',
    lifecycle: resolveLifecycle(project.lifecycle, project.updatedAt),
    size: exportEntry.size,
    sourceFavicon: null,
    sourceTitle: project.name,
    sourceUrl: null,
    tags: project.tags ?? [],
    updatedAt: exportEntry.createdAt,
    width: null,
    height: null,
    duration: null,
    mimeType: 'application/x-sniptale-scenario-export',
    project,
    type: 'scenario-export',
  };
}

export function createVideoProjectGalleryItem(
  project: VideoProjectListItem
): GalleryVideoProjectItem {
  return {
    createdAt: project.createdAt,
    entityId: project.id,
    expiresAt: null,
    filename: project.name,
    hasThumbnail: false,
    id: `video-project:${project.id}`,
    kind: 'video-project',
    lifecycle: resolveLifecycle(project.lifecycle, project.updatedAt),
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: project.updatedAt,
    width: project.width,
    height: project.height,
    duration: project.duration,
    mimeType: 'application/x-sniptale-video-project',
    project,
    thumbnailSourceMediaId: project.thumbnailSourceMediaId,
    type: 'video-project',
    unavailableReason: project.unavailableReason ?? null,
  };
}

export function createGalleryItems(args: {
  mediaItems: MediaLibraryItem[];
  presentations?: AggregatePresentationEntry[];
  scenarioExportsByProjectId: Map<string, ScenarioExportEntry[]>;
  scenarioProjects: ScenarioProjectSummary[];
  thumbnailIds: Set<string>;
  videoProjects: VideoProjectListItem[];
}): GalleryItem[] {
  const presentations = new Map(
    (args.presentations ?? []).map((entry) => [
      serializeAggregateRef({ id: entry.aggregateId, kind: entry.aggregateKind }),
      entry,
    ])
  );
  const mediaItems = args.mediaItems
    .filter((media) => media.source.kind !== 'project-asset')
    .map((media) => {
      const item = createGalleryMediaItem(media);
      if (media.kind !== 'image' && media.kind !== 'screenshot') return item;
      const presentation = presentations.get(
        serializeAggregateRef({ id: media.id, kind: 'image' })
      );
      return {
        ...item,
        hasThumbnail: Boolean(presentation),
        presentationRevision: presentation?.presentationRevision ?? null,
        workspaceRevision: media.workspaceRevision ?? 0,
      };
    });
  const videoProjectItems = args.videoProjects.map((project) => {
    const item = createVideoProjectGalleryItem(project);
    const presentation = presentations.get(
      serializeAggregateRef({ id: project.id, kind: 'video-project' })
    );
    return {
      ...item,
      hasThumbnail: Boolean(presentation),
      presentationRevision: presentation?.presentationRevision ?? null,
      workspaceRevision: project.workspaceRevision ?? 0,
    };
  });
  const scenarioItems = args.scenarioProjects.map((project) => {
    const item = createScenarioGalleryItem(project);
    const presentation = presentations.get(
      serializeAggregateRef({ id: project.id, kind: 'scenario' })
    );
    return {
      ...item,
      hasThumbnail: Boolean(presentation),
      presentationRevision: presentation?.presentationRevision ?? null,
      workspaceRevision: project.workspaceRevision ?? 0,
    };
  });
  const exportItems = args.scenarioProjects.flatMap((project) =>
    (args.scenarioExportsByProjectId.get(project.id) ?? []).map((entry) => {
      const item = createScenarioExportGalleryItem(project, entry);
      return {
        ...item,
        hasThumbnail: args.thumbnailIds.has(item.id),
      };
    })
  );

  return [...mediaItems, ...videoProjectItems, ...scenarioItems, ...exportItems].sort(
    (left, right) => {
      return right.createdAt - left.createdAt;
    }
  );
}
