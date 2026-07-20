import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  GalleryMediaItem,
  GalleryScenarioExportItem,
  GalleryScenarioItem,
  GalleryVideoProjectItem,
} from '../items';

export function createMediaItem(overrides: Partial<GalleryMediaItem> = {}): GalleryMediaItem {
  return {
    id: overrides.id ?? 'asset-1',
    entityId: overrides.entityId ?? overrides.id ?? 'asset-1',
    kind: overrides.kind ?? 'image',
    filename: overrides.filename ?? 'capture.png',
    originalFilename: overrides.originalFilename ?? 'capture.png',
    mimeType: overrides.mimeType ?? 'image/png',
    size: overrides.size ?? 256,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    width: overrides.width ?? 1280,
    height: overrides.height ?? 720,
    duration: overrides.duration ?? null,
    source: overrides.source ?? { kind: 'screenshot' },
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? [],
    hasThumbnail: overrides.hasThumbnail ?? false,
    type: overrides.type ?? 'media',
  };
}

function createScenarioProjectSummary(
  overrides: Partial<ScenarioProjectSummary> = {}
): ScenarioProjectSummary {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Scenario',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    tags: overrides.tags ?? [],
  };
}

export function createScenarioItem(
  overrides: Partial<GalleryScenarioItem> = {}
): GalleryScenarioItem {
  const project = createScenarioProjectSummary(overrides.project);

  return {
    id: overrides.id ?? `scenario:${project.id}`,
    entityId: overrides.entityId ?? project.id,
    kind: 'scenario',
    filename: overrides.filename ?? project.name,
    size: overrides.size ?? 0,
    createdAt: overrides.createdAt ?? project.createdAt,
    updatedAt: overrides.updatedAt ?? project.updatedAt,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? project.tags ?? [],
    hasThumbnail: overrides.hasThumbnail ?? false,
    width: null,
    height: null,
    duration: null,
    mimeType: 'application/x-sniptale-scenario',
    project,
    type: 'scenario',
  };
}

function createScenarioExportEntry(
  overrides: Partial<ScenarioExportEntry> = {}
): ScenarioExportEntry {
  return {
    id: overrides.id ?? 'export-1',
    projectId: overrides.projectId ?? 'project-1',
    format: overrides.format ?? 'html',
    filename: overrides.filename ?? 'scenario.html',
    createdAt: overrides.createdAt ?? 1,
    size: overrides.size ?? 1024,
  };
}

export function createScenarioExportItem(
  overrides: Partial<GalleryScenarioExportItem> = {}
): GalleryScenarioExportItem {
  const project = createScenarioProjectSummary(overrides.project);
  const exportEntry = createScenarioExportEntry({
    projectId: project.id,
    ...overrides.exportEntry,
  });

  return {
    id: overrides.id ?? `scenario-export:${exportEntry.id}`,
    entityId: overrides.entityId ?? exportEntry.id,
    kind: 'scenario-export',
    filename: overrides.filename ?? exportEntry.filename,
    size: overrides.size ?? exportEntry.size,
    createdAt: overrides.createdAt ?? exportEntry.createdAt,
    updatedAt: overrides.updatedAt ?? exportEntry.createdAt,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? project.name,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? project.tags ?? [],
    hasThumbnail: overrides.hasThumbnail ?? false,
    width: null,
    height: null,
    duration: null,
    mimeType: 'application/x-sniptale-scenario-export',
    exportEntry,
    format: overrides.format ?? exportEntry.format,
    project,
    type: 'scenario-export',
  };
}

export function createVideoProjectItem(
  overrides: Partial<GalleryVideoProjectItem> = {}
): GalleryVideoProjectItem {
  const project = {
    clipCount: overrides.project?.clipCount ?? 1,
    createdAt: overrides.createdAt ?? 1,
    duration: overrides.duration ?? 30,
    height: overrides.height ?? 720,
    id: overrides.entityId ?? 'video-project-1',
    name: overrides.filename ?? 'Video project',
    thumbnailId:
      overrides.project?.thumbnailId ?? `video-project:${overrides.entityId ?? 'video-project-1'}`,
    thumbnailSourceMediaId: overrides.thumbnailSourceMediaId ?? 'project-asset:asset-1',
    trackCount: overrides.project?.trackCount ?? 1,
    updatedAt: overrides.updatedAt ?? 2,
    width: overrides.width ?? 1280,
  };

  return {
    id: overrides.id ?? `video-project:${project.id}`,
    entityId: overrides.entityId ?? project.id,
    kind: 'video-project',
    filename: overrides.filename ?? project.name,
    size: overrides.size ?? 0,
    createdAt: overrides.createdAt ?? project.createdAt,
    updatedAt: overrides.updatedAt ?? project.updatedAt,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? [],
    hasThumbnail: overrides.hasThumbnail ?? false,
    width: overrides.width ?? project.width,
    height: overrides.height ?? project.height,
    duration: overrides.duration ?? project.duration,
    mimeType: 'application/x-sniptale-video-project',
    project: overrides.project ?? project,
    thumbnailSourceMediaId: overrides.thumbnailSourceMediaId ?? project.thumbnailSourceMediaId,
    type: 'video-project',
    unavailableReason: overrides.unavailableReason ?? null,
  };
}
