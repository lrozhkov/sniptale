import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoSubtitleSidecarFormat,
  VideoExportQualityPreset,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  type VideoProjectSubtitleClip,
  type VideoProjectTrack,
  VideoTrackKind,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { saveProjectExportSafely } from '../../../../workflows/media-hub/store';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging/index';
import { finalizeExport } from './export/index';

const mediaRead = vi.hoisted(() => vi.fn());
vi.mock('../../../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: mediaRead,
}));
const telemetryRead = vi.hoisted(() => vi.fn());
vi.mock('../../../../composition/persistence/recordings/telemetry', () => ({
  getRecordingTelemetry: telemetryRead,
}));

const { loggerDebugMock, markTerminalMock, saveProjectExportSafelyMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    loggerDebugMock: vi.fn(),
    markTerminalMock: vi.fn(),
    saveProjectExportSafelyMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/media-hub/store')>()),
  saveProjectExportSafely: saveProjectExportSafelyMock,
}));

vi.mock('../../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/export-ledger')>()),
  markProjectExportJobTerminal: markTerminalMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Demo / Project',
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
}

function createExportSettings(
  overrides: Partial<VideoProjectExportSettings> = {}
): VideoProjectExportSettings {
  return {
    width: 1920,
    height: 1080,
    fps: 60,
    quality: VideoExportQualityPreset.HIGH,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    downloadAfterExport: true,
    ...overrides,
  } as VideoProjectExportSettings;
}

function createSubtitleExportProject() {
  const project = createProject();

  const subtitleTrack = {
    id: 'track-subtitle',
    isRoot: false,
    kind: VideoTrackKind.SUBTITLE,
    locked: false,
    name: 'Subtitles',
    order: 0,
    visible: true,
  } satisfies VideoProjectTrack;
  const subtitleClip = {
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'subtitle-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: true,
    name: 'Subtitle',
    startTime: 1,
    text: 'Экспорт',
    trackId: 'track-subtitle',
    transform: { height: 40, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: 'SUBTITLE' as const,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  } satisfies VideoProjectSubtitleClip;

  project.tracks = [subtitleTrack];
  project.clips = [subtitleClip];

  return project;
}

function mockRandomUuids(...values: string[]) {
  const randomUUID = vi.fn();
  for (const value of values) {
    randomUUID.mockReturnValueOnce(value);
  }

  vi.stubGlobal('crypto', {
    randomUUID,
  });

  return randomUUID;
}

function installFileReaderStub(): void {
  vi.stubGlobal(
    'FileReader',
    class {
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL(blob: Blob): void {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        });
      }
    }
  );
}

async function flushSidecarDownloadRequest(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  telemetryRead.mockResolvedValue(undefined);
  mediaRead.mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 22, 13, 11, 12, 345));
  installFileReaderStub();
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  saveProjectExportSafelyMock.mockResolvedValue(undefined);
  markTerminalMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('finalizes exports by downloading, persisting, and notifying completion', async () => {
  const project = createProject();
  const settings = createExportSettings();
  const blob = new Blob(['video'], { type: 'video/mp4' });
  const randomUUID = mockRandomUuids('export-uuid');

  await finalizeExport('job-1', project, settings, blob);

  expect(randomUUID).toHaveBeenCalledOnce();
  expect(saveProjectExportSafely).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'export-uuid',
      projectId: 'project-1',
      blob,
      filename: 'Sniptale_video-export_2026-03-22_13-11-12-345.mp4',
      format: VideoExportFormat.MP4,
    })
  );
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: 'PROJECT_EXPORT_COMPLETED',
      jobId: 'job-1',
      projectId: 'project-1',
      exportId: 'export-uuid',
    })
  );
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: VideoMessageType.DOWNLOAD_PROJECT_EXPORT,
    exportId: 'export-uuid',
    filename: 'Sniptale_video-export_2026-03-22_13-11-12-345.mp4',
  });
  expect(markTerminalMock).toHaveBeenCalledWith('job-1', 'completed');
});

it('falls back to the default export base name when the project is unnamed', async () => {
  const project = { ...createProject(), name: '' };
  const settings = createExportSettings();
  const blob = new Blob(['video'], { type: 'video/mp4' });

  mockRandomUuids('export-uuid');

  await finalizeExport('job-2', project, settings, blob);

  expect(saveProjectExportSafely).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'Sniptale_video-export_2026-03-22_13-11-12-345.mp4',
      projectId: 'project-1',
    })
  );
});

it('suppresses runtime side effects when export publication fails', async () => {
  const project = createProject();
  const settings = createExportSettings();
  const blob = new Blob(['video'], { type: 'video/mp4' });
  const exportError = new Error('export save failed');

  mockRandomUuids('export-uuid');
  saveProjectExportSafelyMock.mockRejectedValueOnce(exportError);

  await expect(finalizeExport('job-4', project, settings, blob)).rejects.toThrow(
    'export save failed'
  );

  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(markTerminalMock).not.toHaveBeenCalled();
});

it('downloads subtitle sidecars after persisting the completed export entry', async () => {
  const project = createSubtitleExportProject();
  const settings = createExportSettings({
    subtitleSidecarFormats: [VideoSubtitleSidecarFormat.SRT],
  });
  const blob = new Blob(['video'], { type: 'video/mp4' });
  mockRandomUuids('export-uuid');

  await finalizeExport('job-5', project, settings, blob);
  await flushSidecarDownloadRequest();

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'DOWNLOAD_RECORDING_SIDECAR',
    content: expect.stringContaining('1\n00:00:01,000 -->'),
    filename: 'Sniptale_video-export_2026-03-22_13-11-12-345.srt',
    mimeType: 'application/x-subrip',
  });
});

it('uses a category rule consistently for the export and its subtitle sidecar', async () => {
  const storage = await import('../../../../composition/persistence/settings');
  const read = vi.spyOn(storage, 'loadSettings').mockResolvedValue({
    ...storage.createDefaultSettings(),
    filenameRules: { template: 'general', recordings: 'Custom_{type}' },
  });
  try {
    mockRandomUuids('custom-export');
    await finalizeExport(
      'job-custom',
      createSubtitleExportProject(),
      createExportSettings({ subtitleSidecarFormats: [VideoSubtitleSidecarFormat.SRT] }),
      new Blob(['video'])
    );
    await flushSidecarDownloadRequest();
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DOWNLOAD_RECORDING_SIDECAR',
        filename: 'Custom_video-export.srt',
      })
    );
    expect(saveProjectExportSafely).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Custom_video-export.mp4' })
    );
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VideoMessageType.DOWNLOAD_PROJECT_EXPORT,
        filename: 'Custom_video-export.mp4',
      })
    );
  } finally {
    read.mockRestore();
  }
});

it.each(['native', 'missing'] as const)(
  'copies %s primary recording facts into full export',
  async (mode) => {
    const project = createProject();
    project.source = { kind: 'recording', recordingId: 'original' };
    const telemetry = {
      captureMode: 'TAB',
      displaySurface: 'browser',
      actionEvents: [{}],
      cursorTrack: null,
    };
    telemetryRead.mockResolvedValueOnce(mode === 'native' ? telemetry : undefined);
    mockRandomUuids('export-uuid');
    await finalizeExport('job', project, createExportSettings(), new Blob(['video']));
    expect(telemetryRead).toHaveBeenCalledWith('original');
    const saved = saveProjectExportSafelyMock.mock.calls[0]![0];
    if (mode === 'missing') expect(saved).not.toHaveProperty('recordingMetadata');
    else
      expect(saved.recordingMetadata).toEqual({
        captureMode: 'TAB',
        displaySurface: 'browser',
        actionCount: 1,
        hasPointer: false,
      });
    expect(saved).toMatchObject({ width: 1920, height: 1080, duration: 42 });
    project.source = { kind: 'manual' };
    telemetry.actionEvents.length = 0;
    if (mode === 'native') expect(saved.recordingMetadata.actionCount).toBe(1);
  }
);
it('does not publish partial metadata after a failed primary-source read', async () => {
  const project = createProject();
  project.baseRecordingId = 'original';
  telemetryRead.mockRejectedValueOnce(new Error('read failed'));
  mockRandomUuids('export-uuid');
  await expect(
    finalizeExport('job', project, createExportSettings(), new Blob(['video']))
  ).rejects.toThrow('read failed');
  expect(saveProjectExportSafelyMock).not.toHaveBeenCalled();
});

it('retains an existing export snapshot when its primary media is reused in the full editor', async () => {
  const project = createProject();
  project.baseRecordingId = 'copy';
  const recordingMetadata = {
    captureMode: 'CAMERA',
    displaySurface: null,
    actionCount: 7,
    hasPointer: false,
  };
  mediaRead.mockResolvedValueOnce({ recordingMetadata });
  mockRandomUuids('export-uuid');
  await finalizeExport('job', project, createExportSettings(), new Blob(['video']));
  expect(mediaRead).toHaveBeenCalledWith('recording:copy');
  expect(telemetryRead).not.toHaveBeenCalled();
  expect(saveProjectExportSafelyMock.mock.calls[0]![0].recordingMetadata).toEqual(
    recordingMetadata
  );
});
