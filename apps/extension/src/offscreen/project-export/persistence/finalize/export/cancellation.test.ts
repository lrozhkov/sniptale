import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../features/video/project/types';
import { finalizeExport } from './index';

const {
  deleteOrphanedRawRecordingsSafelyMock,
  deleteProjectExportSafelyMock,
  downloadExportRecordingMock,
  downloadExportSidecarMock,
  notifyProjectExportCompletedMock,
  saveProjectExportSafelyMock,
  saveRecordingSafelyMock,
} = vi.hoisted(() => ({
  deleteOrphanedRawRecordingsSafelyMock: vi.fn(),
  deleteProjectExportSafelyMock: vi.fn(),
  downloadExportRecordingMock: vi.fn(),
  downloadExportSidecarMock: vi.fn(),
  notifyProjectExportCompletedMock: vi.fn(),
  saveProjectExportSafelyMock: vi.fn(),
  saveRecordingSafelyMock: vi.fn(),
}));

vi.mock('../../../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../workflows/media-hub/store')>()),
  deleteOrphanedRawRecordingsSafely: deleteOrphanedRawRecordingsSafelyMock,
  deleteProjectExportSafely: deleteProjectExportSafelyMock,
  saveProjectExportSafely: saveProjectExportSafelyMock,
  saveRecordingSafely: saveRecordingSafelyMock,
}));

vi.mock('./runtime/index', () => ({
  downloadExportRecording: downloadExportRecordingMock,
  downloadExportSidecar: downloadExportSidecarMock,
  notifyProjectExportCompleted: notifyProjectExportCompletedMock,
}));

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createProject(name: string): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 1,
    cursorTrack: null,
    duration: 0,
    fps: 30,
    height: 720,
    id: 'project-1',
    name,
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    tracks: [],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}

function mockRandomUuids(): void {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRandomUuids();
  deleteOrphanedRawRecordingsSafelyMock.mockResolvedValue(undefined);
  deleteProjectExportSafelyMock.mockResolvedValue(undefined);
  notifyProjectExportCompletedMock.mockResolvedValue(true);
  saveProjectExportSafelyMock.mockResolvedValue(undefined);
  saveRecordingSafelyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('does not write an export entry when cancellation arrives after raw recording save', async () => {
  const abortController = new AbortController();
  saveRecordingSafelyMock.mockImplementation(async () => {
    abortController.abort();
  });

  await expect(
    finalizeExport(
      'job-raw-cancel',
      createProject('Raw cancel'),
      createSettings(),
      new Blob(['video'], { type: 'video/mp4' }),
      { signal: abortController.signal }
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');

  expect(saveProjectExportSafelyMock).not.toHaveBeenCalled();
  expect(deleteProjectExportSafelyMock).not.toHaveBeenCalled();
  expect(deleteOrphanedRawRecordingsSafelyMock).toHaveBeenCalledWith([
    expect.stringMatching(/^export-/),
  ]);
  expect(downloadExportRecordingMock).not.toHaveBeenCalled();
  expect(downloadExportSidecarMock).not.toHaveBeenCalled();
  expect(notifyProjectExportCompletedMock).not.toHaveBeenCalled();
});

it('rolls back the export entry when cancellation arrives after export entry save', async () => {
  const abortController = new AbortController();
  saveProjectExportSafelyMock.mockImplementation(async () => {
    abortController.abort();
  });

  await expect(
    finalizeExport(
      'job-export-cancel',
      createProject('Export cancel'),
      createSettings(),
      new Blob(['video'], { type: 'video/mp4' }),
      { signal: abortController.signal }
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');

  expect(saveRecordingSafelyMock).toHaveBeenCalledOnce();
  expect(saveProjectExportSafelyMock).toHaveBeenCalledOnce();
  expect(deleteProjectExportSafelyMock).toHaveBeenCalledWith(expect.any(String));
  expect(deleteOrphanedRawRecordingsSafelyMock).toHaveBeenCalledWith([
    expect.stringMatching(/^export-/),
  ]);
  expect(downloadExportRecordingMock).not.toHaveBeenCalled();
  expect(downloadExportSidecarMock).not.toHaveBeenCalled();
  expect(notifyProjectExportCompletedMock).not.toHaveBeenCalled();
});
