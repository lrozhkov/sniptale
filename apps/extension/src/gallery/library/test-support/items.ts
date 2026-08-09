import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  GalleryMediaItem,
  GalleryEditorSessionItem,
  GalleryScenarioExportItem,
  GalleryScenarioItem,
  GalleryVideoProjectItem,
} from '../items';

export function createEditorSessionItem(
  overrides: Partial<GalleryEditorSessionItem> = {}
): GalleryEditorSessionItem {
  const session = overrides.session ?? {
    assetId: null,
    createdAt: 1,
    dirty: true,
    document: {
      version: 1,
      canvasHeight: 80,
      canvasJson: '{"objects":[]}',
      canvasWidth: 100,
      frame: {
        backgroundColor: '#fff',
        backgroundGradientAngle: 0,
        backgroundGradientFrom: '#fff',
        backgroundGradientTo: '#000',
        backgroundImageData: null,
        backgroundImageFit: 'cover',
        backgroundMode: 'color',
        browserMode: false,
        browserTitle: '',
        browserUrl: '',
        layoutMode: 'fit-image',
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
      },
      sourceDisplayHeight: 80,
      sourceDisplayWidth: 100,
      sourceHeight: 80,
      sourceImageData: 'data:image/png;base64,YQ==',
      sourceLeft: 0,
      sourceName: 'Draft.png',
      sourceTop: 0,
      sourceWidth: 100,
    },
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
    sessionId: 'session-draft',
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  return {
    createdAt: session.createdAt,
    duration: null,
    entityId: session.sessionId,
    filename: session.document.sourceName ?? 'Draft image',
    hasThumbnail: false,
    height: session.document.sourceHeight,
    id: `editor-draft:${session.sessionId}`,
    kind: 'editor-session',
    lifecycle: session.lifecycle ?? {
      savedAt: null,
      storageClass: 'temporary',
      updatedAt: session.updatedAt,
    },
    mimeType: 'application/x-sniptale-editor-session',
    session,
    size: session.document.sourceImageData.length,
    sourceFavicon: null,
    sourceTitle: session.sourceTitle,
    sourceUrl: session.sourceUrl,
    tags: [],
    type: 'editor-session',
    updatedAt: session.updatedAt,
    width: session.document.sourceWidth,
    ...overrides,
  };
}

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
    ...(overrides.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
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
    retentionKind: overrides.project?.retentionKind ?? 'ordinary',
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
