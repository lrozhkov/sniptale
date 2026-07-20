import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  cancelProjectExportMock,
  consumeProjectExportInputMock,
  getProjectExportCapabilitiesMock,
  logOffscreenDebugErrorMock,
  loggerDebugMock,
  parseOffscreenRuntimeMessageMock,
  sendRuntimeMessageBestEffortMock,
  startProjectExportMock,
  startRecordingMock,
  stringifyOffscreenErrorMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  cancelProjectExportMock: vi.fn(),
  consumeProjectExportInputMock: vi.fn(),
  getProjectExportCapabilitiesMock: vi.fn(),
  logOffscreenDebugErrorMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
  startProjectExportMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stringifyOffscreenErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
}));

vi.mock('../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contracts/messaging/parsers/boundary')>()),
  parseOffscreenRuntimeMessage: parseOffscreenRuntimeMessageMock,
}));

vi.mock('../runtime-messaging/best-effort', () => ({
  logOffscreenDebugError: logOffscreenDebugErrorMock,
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
  stringifyOffscreenError: stringifyOffscreenErrorMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('../recording/setup/desktop-media', () => ({
  consumeDesktopStream: vi.fn(),
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: vi.fn(),
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: vi.fn(),
}));

vi.mock('../recording/controller', () => ({
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  setViewportDrawState: vi.fn(),
  startRecording: startRecordingMock,
  stopRecording: vi.fn(),
  updateViewportCrop: vi.fn(),
}));

vi.mock('../project-export/index', () => ({
  cancelProjectExport: cancelProjectExportMock,
  getProjectExportCapabilities: getProjectExportCapabilitiesMock,
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: startProjectExportMock,
}));

vi.mock('../../composition/persistence/project-export-inputs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/project-export-inputs')>()),
  consumeProjectExportInput: consumeProjectExportInputMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import {
  createExportSettings,
  createProject,
  createProjectExportInputReference,
} from './test-support';

type SubscriptionListener = (
  message: unknown,
  sender?: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown;
const trustedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;

function emitTrustedRuntimeMessage(
  listener: SubscriptionListener,
  message: { type: string } & Record<string, unknown>,
  sendResponse?: (response?: unknown) => void
): unknown {
  return listener(
    attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message)),
    trustedBackgroundSender,
    sendResponse
  );
}

async function captureSubscriptionListener(): Promise<SubscriptionListener> {
  let listener: SubscriptionListener | undefined;
  browserRuntimeSubscribeToMessagesMock.mockImplementation((callback: SubscriptionListener) => {
    listener = callback;
    return vi.fn();
  });

  const { registerOffscreenRuntimeMessageListener } = await import('./index');
  registerOffscreenRuntimeMessageListener();

  if (!listener) {
    throw new Error('Expected offscreen runtime subscription listener');
  }

  return listener;
}

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  startProjectExportMock.mockResolvedValue(undefined);
  cancelProjectExportMock.mockResolvedValue(undefined);
  consumeProjectExportInputMock.mockResolvedValue(createProject());
  getProjectExportCapabilitiesMock.mockResolvedValue({
    formats: [{ format: 'MP4', available: true }],
    mp4Codecs: [{ codec: 'AVC', available: true }],
    defaultMp4VideoCodec: 'AVC',
  });
  startRecordingMock.mockResolvedValue(undefined);
  stringifyOffscreenErrorMock.mockReturnValue('normalized-error');
});

it('routes export start, cancel, and capability probe messages', async () => {
  const listener = await captureSubscriptionListener();
  const settings = createExportSettings();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  const keepStartChannelOpen = emitTrustedRuntimeMessage(
    listener,
    {
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      input: createProjectExportInputReference(),
      jobId: 'job-1',
      settings,
    },
    sendResponse
  );
  emitTrustedRuntimeMessage(
    listener,
    {
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
      jobId: 'job-1',
    },
    sendResponse
  );
  const keepChannelOpen = emitTrustedRuntimeMessage(
    listener,
    {
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      settings,
    },
    sendResponse
  );
  await flushRuntimeRouting();

  expect(startProjectExportMock).toHaveBeenCalledWith('job-1', createProject(), settings);
  expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
  expect(getProjectExportCapabilitiesMock).toHaveBeenCalledWith(settings);
  expect(keepStartChannelOpen).toBe(true);
  expect(keepChannelOpen).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    capabilities: expect.objectContaining({
      defaultMp4VideoCodec: 'AVC',
    }),
  });
});

it('surfaces export failures through sendResponse when the caller keeps the channel open', async () => {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startProjectExportMock.mockRejectedValueOnce(new Error('export-failed'));
  const sendResponse = vi.fn();

  const keepChannelOpen = emitTrustedRuntimeMessage(
    listener,
    {
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      input: createProjectExportInputReference(),
      jobId: 'job-1',
      settings: createExportSettings(),
    },
    sendResponse
  );
  await flushRuntimeRouting();

  expect(keepChannelOpen).toBe(true);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'export-failed',
    });
  });
  expect(sendRuntimeMessageBestEffortMock).not.toHaveBeenCalled();
});

it('reports background export failures through OFFSCREEN_ERROR when no response handler exists', async () => {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  getProjectExportCapabilitiesMock.mockRejectedValueOnce(new Error('probe-failed'));

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
    settings: createExportSettings(),
  });
  await flushRuntimeRouting();

  await vi.waitFor(() => {
    expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
      context: {
        type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      },
      logger: expect.any(Object),
      logMessage: 'Failed to notify runtime about offscreen runtime failure',
      payload: {
        type: VideoMessageType.OFFSCREEN_ERROR,
        error: 'normalized-error',
        phase: 'export',
      },
    });
  });
});

it('keeps start-recording failures local after logging them', async () => {
  const listener = await captureSubscriptionListener();
  const { markRecordingStartErrorReported } = await import('../recording/start/error-reporting');
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  const reportedError = markRecordingStartErrorReported(new Error('recording-failed'));
  startRecordingMock.mockRejectedValueOnce(reportedError);

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    streamId: 'stream-1',
    settings: createExportSettings(),
    captureMode: CaptureMode.TAB,
  });
  await flushRuntimeRouting();

  expect(logOffscreenDebugErrorMock).toHaveBeenCalledWith(
    expect.any(Object),
    'Offscreen runtime start message failed after local reporting',
    expect.objectContaining({
      message: 'recording-failed',
    }),
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
    })
  );
  expect(sendRuntimeMessageBestEffortMock).not.toHaveBeenCalled();
});
