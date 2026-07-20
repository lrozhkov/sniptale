import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserDownloadsDownloadMock,
  ensureOffscreenDocumentMock,
  executeDownloadBlobMock,
  getRecordingMock,
  loadProjectExportInputMock,
  loadSettingsMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  browserDownloadsDownloadMock: vi.fn(),
  ensureOffscreenDocumentMock: vi.fn(),
  executeDownloadBlobMock: vi.fn(),
  getRecordingMock: vi.fn(),
  loadProjectExportInputMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: { download: browserDownloadsDownloadMock },
}));
vi.mock('../../../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/recordings/index')
  >()),
  getRecording: getRecordingMock,
}));
vi.mock('../../../../../composition/persistence/project-export-inputs', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/project-export-inputs')
  >()),
  deleteProjectExportInput: vi.fn(async () => undefined),
  loadProjectExportInput: loadProjectExportInputMock,
}));
vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(() => 'data:video/webm;base64,generated-download'),
}));
vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));
vi.mock('../../../../routing-contracts/download-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../routing-contracts/download-port')>()),
  executeDownloadBlob: executeDownloadBlobMock,
}));
vi.mock('../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: vi.fn().mockReturnValue(true),
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));

import { installBackgroundRuntimeMessagingMock } from '../../../../routing-contracts/runtime-messaging/mock';
import { handleDownloadRecording, handleStartProjectExport } from './export';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL };

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserDownloadsDownloadMock.mockResolvedValue(17);
  executeDownloadBlobMock.mockResolvedValue(17);
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  getRecordingMock.mockResolvedValue({ blob: new Blob(['recording']) });
  loadSettingsMock.mockResolvedValue({ defaultVideoPresetId: 'preset-1' });
  loadProjectExportInputMock.mockResolvedValue(createProject());
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('downloads recordings and starts project export through the export owner', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleDownloadRecording({ recordingId: 'recording-1', filename: 'clip.webm' }, sendResponse)
  ).toEqual({ handled: true, keepChannelOpen: true });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(executeDownloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'clip.webm', 'preset-1');

  const settings = createExportSettings();
  expect(
    handleStartProjectExport(
      { input: createInputReference(), jobId: 'job-1', settings },
      sendResponse,
      VIDEO_EDITOR_OWNER
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: expect.any(String),
      input: createInputReference(),
      jobId: 'job-1',
      settings,
    })
  );
});
