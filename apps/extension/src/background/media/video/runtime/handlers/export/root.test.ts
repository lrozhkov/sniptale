import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
  browserDownloadsDownloadMock,
  ensureOffscreenDocumentMock,
  executeDownloadBlobMock,
  getRecordingMock,
  getErrorMessageMock,
  hasOffscreenDocumentMock,
  loadSettingsMock,
  loadProjectExportInputMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(() => 'data:video/webm;base64,generated-download'),
  browserDownloadsDownloadMock: vi.fn(),
  ensureOffscreenDocumentMock: vi.fn(),
  executeDownloadBlobMock: vi.fn(),
  getRecordingMock: vi.fn(),
  getErrorMessageMock: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  hasOffscreenDocumentMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadProjectExportInputMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: {
    download: browserDownloadsDownloadMock,
  },
}));

vi.mock('../../../../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/recordings/index')
  >()),
  getRecording: getRecordingMock,
}));
vi.mock(
  '../../../../../../composition/persistence/project-export-inputs',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../../composition/persistence/project-export-inputs')
    >()),
    deleteProjectExportInput: vi.fn(async () => undefined),
    loadProjectExportInput: loadProjectExportInputMock,
  })
);

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  getErrorMessage: getErrorMessageMock,
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../../../../routing-contracts/download-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../routing-contracts/download-port')>()),
  executeDownloadBlob: executeDownloadBlobMock,
}));

vi.mock('../../session-state', () => ({
  getVideoRecordingRuntimeState: vi.fn(),
  resetVideoRecordingRuntimeState: vi.fn(),
  setVideoRecordingRuntimeState: vi.fn(),
}));

vi.mock('../../manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manager')>()),
  finalizeRecordingDiagnostics: vi.fn(),
  resetRecordingTabId: vi.fn(),
}));

vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: hasOffscreenDocumentMock,
  markOffscreenDocumentReady: vi.fn(),
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));

import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';
import { handleDownloadRecording, handleStartProjectExport } from './index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createExportHandlerInputReference as createInputReference,
  createExportHandlerProject as createProject,
  createExportHandlerSettings as createExportSettings,
} from './root.test-support';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL };

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetExportFlowMocks() {
  vi.clearAllMocks();
  browserDownloadsDownloadMock.mockResolvedValue(17);
  blobToDataUrlMock.mockResolvedValue('data:video/webm;base64,generated-download');
  executeDownloadBlobMock.mockResolvedValue(17);
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  getRecordingMock.mockResolvedValue({ blob: new Blob(['recording']) });
  hasOffscreenDocumentMock.mockReturnValue(true);
  loadSettingsMock.mockResolvedValue({ defaultVideoPresetId: 'preset-1' });
  loadProjectExportInputMock.mockResolvedValue(createProject());
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
}

async function verifiesDownloadFlows() {
  const successResponse = createSendResponse();
  const failureResponse = createSendResponse();

  expect(
    handleDownloadRecording({ recordingId: 'recording-1', filename: 'clip.webm' }, successResponse)
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();

  expect(getRecordingMock).toHaveBeenCalledWith('recording-1');
  expect(executeDownloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'clip.webm', 'preset-1');
  expect(successResponse).toHaveBeenCalledWith({ success: true, downloadId: 17 });

  const blobResponse = createSendResponse();

  handleDownloadRecording({ recordingId: 'recording-1', filename: 'blob-clip.webm' }, blobResponse);
  await flushPromises();

  expect(getRecordingMock).toHaveBeenCalledWith('recording-1');
  expect(executeDownloadBlobMock).toHaveBeenCalledWith(
    expect.any(Blob),
    'blob-clip.webm',
    'preset-1'
  );
  expect(blobResponse).toHaveBeenCalledWith({ success: true, downloadId: 17 });

  loadSettingsMock.mockRejectedValueOnce(new Error('settings failed'));

  handleDownloadRecording(
    { recordingId: 'failed-recording', filename: 'failed.webm' },
    failureResponse
  );
  await flushPromises();

  expect(getErrorMessageMock).toHaveBeenCalledWith(expect.any(Error), 'Error: settings failed');
  expect(failureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'settings failed',
  });
}

async function verifiesProjectExportStartup() {
  const sendResponse = createSendResponse();
  const settings = createExportSettings();

  expect(
    handleStartProjectExport(
      { input: createInputReference('job-1'), jobId: 'job-1', settings },
      sendResponse,
      VIDEO_EDITOR_OWNER
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();

  expect(ensureOffscreenDocumentMock).toHaveBeenCalledWith('Rendering video project export');
  expect(waitForOffscreenReadyMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: expect.any(String),
      input: createInputReference('job-1'),
      jobId: 'job-1',
      settings,
    })
  );
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    capabilityToken: expect.any(String),
    jobId: 'job-1',
    ownerDocumentId: 'editor-doc-1',
  });
}

async function verifiesProjectExportFailures() {
  const errorResponse = createSendResponse();
  const stringResponse = createSendResponse();
  const settings = createExportSettings();

  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('transport failed'));

  handleStartProjectExport(
    { input: createInputReference('job-3'), jobId: 'job-3', settings },
    errorResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(errorResponse).toHaveBeenCalledWith({
    success: false,
    error: 'transport failed',
  });

  waitForOffscreenReadyMock.mockClear();
  hasOffscreenDocumentMock.mockReturnValue(false);
  ensureOffscreenDocumentMock.mockResolvedValueOnce(false);
  sendRuntimeMessageMock.mockRejectedValueOnce('offline');

  handleStartProjectExport(
    { input: createInputReference('job-4'), jobId: 'job-4', settings },
    stringResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(waitForOffscreenReadyMock).not.toHaveBeenCalled();
  expect(stringResponse).toHaveBeenCalledWith({
    success: false,
    error: 'offline',
  });
}

describe('video-runtime-router-handlers export flows', () => {
  beforeEach(resetExportFlowMocks);

  it(
    'downloads recordings and returns transport errors through sendResponse',
    verifiesDownloadFlows
  );
  it('starts project export through the offscreen transport', verifiesProjectExportStartup);
  it(
    'returns export startup failures as normalized response errors',
    verifiesProjectExportFailures
  );
});
