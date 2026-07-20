import type { GalleryItem, GalleryItemKind } from '../items';

function createMinimalScenarioItem(id: string): GalleryItem {
  return {
    id,
    entityId: id,
    filename: id,
    createdAt: 0,
    updatedAt: 0,
    hasThumbnail: false,
    kind: 'scenario',
    project: { id, name: id, createdAt: 0, updatedAt: 0 },
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    mimeType: 'application/x-sniptale-scenario',
    width: null,
    height: null,
    duration: null,
    type: 'scenario',
  };
}

function createMinimalScenarioExportItem(id: string): GalleryItem {
  return {
    id,
    entityId: id,
    exportEntry: { id, projectId: id, format: 'html', filename: id, createdAt: 0, size: 0 },
    filename: id,
    format: 'html',
    createdAt: 0,
    updatedAt: 0,
    hasThumbnail: false,
    kind: 'scenario-export',
    project: { id, name: id, createdAt: 0, updatedAt: 0 },
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    mimeType: 'application/x-sniptale-scenario-export',
    width: null,
    height: null,
    duration: null,
    type: 'scenario-export',
  };
}

function createMinimalVideoProjectItem(id: string): GalleryItem {
  return {
    id,
    entityId: id,
    filename: id,
    createdAt: 0,
    updatedAt: 0,
    hasThumbnail: false,
    kind: 'video-project',
    project: {
      id,
      name: id,
      createdAt: 0,
      updatedAt: 0,
      duration: 0,
      width: 0,
      height: 0,
      clipCount: 0,
      trackCount: 0,
      thumbnailId: `video-project:${id}`,
      thumbnailSourceMediaId: null,
    },
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    mimeType: 'application/x-sniptale-video-project',
    width: 0,
    height: 0,
    duration: 0,
    thumbnailSourceMediaId: null,
    type: 'video-project',
    unavailableReason: null,
  };
}

function createMinimalMediaItem(
  id: string,
  kind: Exclude<GalleryItemKind, 'scenario' | 'scenario-export' | 'video-project'>
): GalleryItem {
  return {
    id,
    filename: id,
    createdAt: 0,
    updatedAt: 0,
    hasThumbnail: false,
    kind,
    size: 0,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    mimeType: '',
    width: null,
    height: null,
    duration: null,
    source: { kind: 'screenshot' },
  };
}

export function createMediaThumbFallbackItem(kind: GalleryItemKind, id: string): GalleryItem {
  if (kind === 'scenario') {
    return createMinimalScenarioItem(id);
  }
  if (kind === 'scenario-export') {
    return createMinimalScenarioExportItem(id);
  }
  if (kind === 'video-project') {
    return createMinimalVideoProjectItem(id);
  }
  return createMinimalMediaItem(id, kind);
}
