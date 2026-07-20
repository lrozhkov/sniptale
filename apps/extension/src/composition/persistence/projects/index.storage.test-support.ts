import type { MediaLibraryEntry } from '../media-library/contracts';
import type { ProjectAssetEntry, ProjectExportEntry } from './contracts';

export function createProjectAssetEntry(
  overrides: Partial<ProjectAssetEntry> = {}
): ProjectAssetEntry {
  return {
    blob: new Blob(['asset'], { type: 'image/png' }),
    createdAt: 200,
    id: 'asset-1',
    mimeType: 'image/png',
    size: 12,
    ...overrides,
  };
}

export function createProjectExportEntry(
  overrides: Partial<ProjectExportEntry> = {}
): ProjectExportEntry {
  return {
    createdAt: 300,
    duration: 42,
    filename: 'export-1.webm',
    fps: 30,
    height: 1080,
    id: 'export-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    size: 55,
    width: 1920,
    ...overrides,
  };
}

export function createMediaLibraryEntry(
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
  return {
    createdAt: 1,
    duration: null,
    filename: 'asset-name.png',
    height: null,
    id: 'project-asset:asset-1',
    kind: 'image',
    mimeType: 'image/png',
    originalFilename: 'asset-name.png',
    size: 12,
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
    ...overrides,
  };
}
