import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types/export';
import {
  VideoTimelinePlacementMode,
  type VideoProject,
} from '../../../features/video/project/types/model';
import { buildProjectExportEntry } from './entry';

function createProject(): VideoProject {
  const project = {
    version: 2,
    id: 'project-1',
    name: 'Demo',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 42,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  } satisfies VideoProject;

  return project;
}

function createExportSettings(): VideoProjectExportSettings {
  const settings = {
    width: 1920,
    height: 1080,
    fps: 60,
    format: VideoExportFormat.MP4,
    quality: VideoExportQualityPreset.BALANCED,
    downloadAfterExport: true,
  } satisfies VideoProjectExportSettings;

  return settings;
}

function createExpectedEntry() {
  return {
    id: 'export-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    filename: 'Demo.mp4',
    createdAt: 1234567890,
    size: 5,
    duration: 42,
    width: 1920,
    height: 1080,
    fps: 60,
    format: VideoExportFormat.MP4,
    mimeType: 'video/mp4',
  };
}

describe('persistence entry helper', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a persistence entry from project and export settings', () => {
    expect(
      buildProjectExportEntry({
        blob: new Blob(['video']),
        exportId: 'export-1',
        filename: 'Demo.mp4',
        project: createProject(),
        recordingId: 'recording-1',
        settings: createExportSettings(),
      })
    ).toEqual(createExpectedEntry());
  });

  it('stores the clipped export duration when exporting only part of the project', () => {
    expect(
      buildProjectExportEntry({
        blob: new Blob(['video']),
        exportId: 'export-2',
        filename: 'Demo-range.mp4',
        project: createProject(),
        recordingId: 'recording-2',
        settings: {
          ...createExportSettings(),
          rangeEndSeconds: 10,
          rangeStartSeconds: 4,
        },
      }).duration
    ).toBe(6);
  });
});
