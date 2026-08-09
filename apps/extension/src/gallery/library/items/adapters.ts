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
import type { EditorSessionEntry } from '../../../composition/persistence/editor-sessions/contracts';
import type { GalleryEditorSessionItem } from './types';

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

export function createEditorSessionGalleryItem(
  session: EditorSessionEntry
): GalleryEditorSessionItem {
  return {
    createdAt: session.createdAt,
    entityId: session.sessionId,
    expiresAt: null,
    filename: session.document.sourceName ?? 'Draft image',
    hasThumbnail: false,
    id: `editor-draft:${session.sessionId}`,
    kind: 'editor-session',
    lifecycle: session.lifecycle!,
    size: session.document.sourceImageData.length,
    sourceFavicon: null,
    sourceTitle: session.sourceTitle,
    sourceUrl: session.sourceUrl,
    tags: [],
    updatedAt: session.updatedAt,
    width: session.document.sourceWidth,
    height: session.document.sourceHeight,
    duration: null,
    mimeType: 'application/x-sniptale-editor-session',
    session,
    type: 'editor-session',
  };
}

export function createGalleryItems(args: {
  mediaItems: MediaLibraryItem[];
  editorSessions?: EditorSessionEntry[];
  scenarioExportsByProjectId: Map<string, ScenarioExportEntry[]>;
  scenarioProjects: ScenarioProjectSummary[];
  thumbnailIds: Set<string>;
  videoProjects: VideoProjectListItem[];
}): GalleryItem[] {
  const mediaItems = args.mediaItems.map(createGalleryMediaItem);
  const editorSessionItems = (args.editorSessions ?? []).map(createEditorSessionGalleryItem);
  const videoProjectItems = args.videoProjects.map((project) => {
    const item = createVideoProjectGalleryItem(project);
    return {
      ...item,
      hasThumbnail: args.thumbnailIds.has(item.id),
    };
  });
  const scenarioItems = args.scenarioProjects.map((project) => {
    const item = createScenarioGalleryItem(project);
    return {
      ...item,
      hasThumbnail: args.thumbnailIds.has(item.id),
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

  return [
    ...mediaItems,
    ...editorSessionItems,
    ...videoProjectItems,
    ...scenarioItems,
    ...exportItems,
  ].sort((left, right) => {
    return right.createdAt - left.createdAt;
  });
}
