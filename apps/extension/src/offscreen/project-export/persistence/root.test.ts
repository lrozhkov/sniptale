import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { saveProjectExportSafely } from '../../../workflows/media-hub/store';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging/index';
import { finalizeExport, prepareOutputBlob } from './index';

const { loggerDebugMock, saveProjectExportSafelyMock, sendRuntimeMessageMock, translateMock } =
  vi.hoisted(() => ({
    loggerDebugMock: vi.fn(),
    saveProjectExportSafelyMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
    translateMock: vi.fn((key: string) => key),
  }));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveProjectExportSafely: saveProjectExportSafelyMock,
}));

vi.mock('../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
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

function useProjectExportPersistenceTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:11:12.345Z'));
    sendRuntimeMessageMock.mockResolvedValue({ success: true });
    saveProjectExportSafelyMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

function expectCompletedExportMessage(jobId: string, format: VideoExportFormat) {
  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'PROJECT_EXPORT_COMPLETED',
    jobId,
    projectId: 'project-1',
    exportId: 'export-uuid',
    filename: `Demo_Project-2026-03-22T10-11-12.${format === VideoExportFormat.MP4 ? 'mp4' : 'webm'}`,
    format,
  });
}

async function verifiesFinalizeExportPersistence() {
  const project = createProject();
  const settings = createExportSettings();
  const blob = new Blob(['video'], { type: 'video/mp4' });
  const randomUUID = mockRandomUuids('export-uuid');

  await finalizeExport('job-1', project, settings, blob);

  expect(randomUUID).toHaveBeenCalledOnce();
  expect(saveProjectExportSafely).toHaveBeenCalledWith({
    id: 'export-uuid',
    projectId: 'project-1',
    blob,
    filename: 'Demo_Project-2026-03-22T10-11-12.mp4',
    createdAt: Date.now(),
    duration: 42,
    width: 1920,
    height: 1080,
    fps: 60,
    format: VideoExportFormat.MP4,
    mimeType: 'video/mp4',
  });
  expectCompletedExportMessage('job-1', VideoExportFormat.MP4);
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: VideoMessageType.DOWNLOAD_PROJECT_EXPORT,
    exportId: 'export-uuid',
    filename: 'Demo_Project-2026-03-22T10-11-12.mp4',
  });
}

async function verifiesDownloadSkipWhenDisabled() {
  const project = createProject();
  const settings = createExportSettings({
    downloadAfterExport: false,
    format: VideoExportFormat.WEBM,
  });
  const blob = new Blob(['video'], { type: 'video/webm' });

  mockRandomUuids('export-uuid');
  await finalizeExport('job-2', project, settings, blob);

  expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
  expectCompletedExportMessage('job-2', VideoExportFormat.WEBM);
}

async function verifiesCompletionNotificationFailureLogging() {
  const project = createProject();
  const settings = createExportSettings({ downloadAfterExport: false });
  const blob = new Blob(['video'], { type: 'video/mp4' });

  mockRandomUuids('export-uuid');
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('popup closed'));

  await finalizeExport('job-3', project, settings, blob);
  await Promise.resolve();
  await Promise.resolve();

  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Failed to notify runtime about completed project export',
    expect.objectContaining({
      errorMessage: 'popup closed',
      exportId: 'export-uuid',
      jobId: 'job-3',
      projectId: 'project-1',
    })
  );
}

async function verifiesNoRuntimeSideEffectsWhenExportSaveFails() {
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
}

async function verifiesCompatibleMimeNormalization() {
  const inputBlob = new Blob(['video'], { type: 'application/mp4' });
  const outputBlob = await prepareOutputBlob(createExportSettings(), inputBlob);

  expect(outputBlob).not.toBe(inputBlob);
  expect(outputBlob.type).toBe('video/mp4');
}

async function verifiesWebmPassthroughForUnknownMime() {
  const inputBlob = new Blob(['video'], { type: 'video/unknown' });

  await expect(
    prepareOutputBlob(createExportSettings({ format: VideoExportFormat.WEBM }), inputBlob)
  ).resolves.toBe(inputBlob);
}

async function verifiesLocalizedMp4CompatibilityError() {
  const inputBlob = new Blob(['video'], { type: 'video/unknown' });

  await expect(prepareOutputBlob(createExportSettings(), inputBlob)).rejects.toThrow(
    'offscreenExport.fastPathMp4OnlySourceAsset'
  );
  expect(translateMock).toHaveBeenCalledWith('offscreenExport.fastPathMp4OnlySourceAsset');
}

describe('project-export-persistence', () => {
  useProjectExportPersistenceTestScope();

  it(
    'finalizes exports by downloading, persisting, and notifying completion',
    verifiesFinalizeExportPersistence
  );
  it(
    'skips download transport when download-after-export is disabled',
    verifiesDownloadSkipWhenDisabled
  );
  it(
    'logs completion notification failures as low-noise debug traces',
    verifiesCompletionNotificationFailureLogging
  );
  it(
    'rolls back the saved recording when project-export persistence fails',
    verifiesNoRuntimeSideEffectsWhenExportSaveFails
  );
  it(
    'normalizes compatible mime types to the selected export format',
    verifiesCompatibleMimeNormalization
  );
  it('passes through incompatible blobs for webm exports', verifiesWebmPassthroughForUnknownMime);
  it(
    'throws a localized error when mp4 export receives an incompatible source blob',
    verifiesLocalizedMp4CompatibilityError
  );
});
