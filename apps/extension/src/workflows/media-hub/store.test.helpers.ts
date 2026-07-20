import type {
  MediaLibraryEntry,
  MediaLibraryItem,
  SaveScreenshotMediaAssetInput,
} from '../../composition/persistence/media-library/contracts';
import type { ProjectExportEntry } from '../../composition/persistence/projects/contracts';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

export function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    createdAt: 1,
    duration: null,
    filename: 'shot.png',
    height: null,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'shot.png',
    size: 12,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
    ...overrides,
  };
}

export function createMediaItem(overrides: Partial<MediaLibraryItem> = {}): MediaLibraryItem {
  return {
    ...createMediaEntry(),
    hasThumbnail: false,
    ...overrides,
  };
}

export function createProjectExportEntry(
  overrides: Partial<ProjectExportEntry> = {}
): ProjectExportEntry {
  return {
    createdAt: 100,
    duration: 42,
    filename: 'project-export.webm',
    fps: 30,
    height: 1080,
    id: 'export-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    size: 512,
    width: 1920,
    ...overrides,
  };
}

export function createTelemetryEntry(): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'recording-1',
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

export function createScreenshotInput(
  overrides: Partial<SaveScreenshotMediaAssetInput> = {}
): SaveScreenshotMediaAssetInput {
  return {
    blob: new Blob(['shot'], { type: 'image/png' }),
    filename: 'shot.png',
    ...overrides,
  };
}
