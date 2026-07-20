import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  consumeProjectExportInputMock,
  loggerDebugMock,
  parseOffscreenRuntimeMessageMock,
  recordingContextMock,
  requestDesktopMediaMock,
  sendRuntimeMessageMock,
  startProjectExportMock,
  stopRecordingMock,
  updateViewportCropMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  consumeProjectExportInputMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  recordingContextMock: { currentRecordingId: null as string | null },
  requestDesktopMediaMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startProjectExportMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  updateViewportCropMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contracts/messaging/parsers/boundary')>()),
  parseOffscreenRuntimeMessage: parseOffscreenRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../recording/setup/desktop-media', () => ({
  consumeDesktopStream: vi.fn(),
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: vi.fn(),
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: requestDesktopMediaMock,
}));

vi.mock('../recording/controller', () => ({
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  setViewportDrawState: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: stopRecordingMock,
  updateViewportCrop: updateViewportCropMock,
}));

vi.mock('../recording/context', () => ({
  recordingContext: recordingContextMock,
}));

vi.mock('../project-export/index', () => ({
  cancelProjectExport: vi.fn(),
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: startProjectExportMock,
}));

vi.mock('../../composition/persistence/project-export-inputs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/project-export-inputs')>()),
  consumeProjectExportInput: consumeProjectExportInputMock,
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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
let freshnessNonceSequence = 0;

function emitTrustedRuntimeMessage(
  listener: SubscriptionListener,
  message: { type: string } & Record<string, unknown>
): unknown {
  freshnessNonceSequence += 1;
  return listener(
    attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message), {
      issuedAtEpochMs: Date.now(),
      nonce: `offscreen-error-nonce-${freshnessNonceSequence}`,
    }),
    trustedBackgroundSender
  );
}

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function resetOffscreenRuntimeErrorMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  freshnessNonceSequence = 0;
  consumeProjectExportInputMock.mockResolvedValue(createProject());
  requestDesktopMediaMock.mockResolvedValue(undefined);
  recordingContextMock.currentRecordingId = null;
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  startProjectExportMock.mockResolvedValue(undefined);
  updateViewportCropMock.mockReturnValue(undefined);
}

async function verifiesRejectedRuntimeHandlersBecomeTypedOffscreenErrors() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  recordingContextMock.currentRecordingId = 'rec-1';
  stopRecordingMock.mockRejectedValueOnce(new Error('stop timed out'));

  emitTrustedRuntimeMessage(listener, {
    type: 'OFFSCREEN_STOP_RECORDING',
  });
  await flushRuntimeRouting();

  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Offscreen runtime message failed',
    expect.objectContaining({
      errorMessage: 'stop timed out',
      type: 'OFFSCREEN_STOP_RECORDING',
    })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_ERROR',
    error: 'stop timed out',
    phase: 'stop',
    recordingId: 'rec-1',
  });
}

async function verifiesRuntimePhaseErrorsBecomeTypedOffscreenErrors() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  requestDesktopMediaMock.mockRejectedValueOnce(new Error('desktop denied'));

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    captureMode: CaptureMode.TAB,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'desktop denied',
    phase: 'runtime',
  });

  emitTrustedRuntimeMessage(listener, {
    type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
    operation: 'verify',
    preservePreferences: false,
  });
  await flushRuntimeRouting();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Offscreen page storage privacy erasure failed',
    expect.objectContaining({
      errorMessage: expect.any(String),
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
    })
  );
}

async function verifiesExportPhaseErrorsBecomeTypedOffscreenErrors() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startProjectExportMock.mockRejectedValueOnce(new Error('encoder missing'));

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    input: createProjectExportInputReference('job-1'),
    jobId: 'job-1',
    settings: createExportSettings(),
  });
  await vi.waitFor(() => {
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: 'encoder missing',
      phase: 'export',
    });
  });
}

async function verifiesViewportCropFailuresBecomeTypedOffscreenErrors() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  updateViewportCropMock.mockImplementationOnce(() => {
    throw new Error('crop failed');
  });

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
    targetResolution: { width: 1920, height: 1080 },
  });
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'crop failed',
    phase: 'runtime',
  });
}

async function verifiesUnknownRuntimeFailuresAreStringifiedBeforeNotification() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  requestDesktopMediaMock.mockRejectedValueOnce({ reason: 'blocked' });

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    captureMode: CaptureMode.TAB,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: '[object Object]',
    phase: 'runtime',
  });
}

describe('offscreen-runtime error paths', () => {
  beforeEach(resetOffscreenRuntimeErrorMocks);

  it('reports runtime-phase errors', verifiesRuntimePhaseErrorsBecomeTypedOffscreenErrors);
  it('reports rejected async handlers', verifiesRejectedRuntimeHandlersBecomeTypedOffscreenErrors);
  it('reports export errors', verifiesExportPhaseErrorsBecomeTypedOffscreenErrors);
  it('reports viewport-crop errors', verifiesViewportCropFailuresBecomeTypedOffscreenErrors);
  it(
    'stringifies unknown runtime failures before notifying the main runtime',
    verifiesUnknownRuntimeFailuresAreStringifiedBeforeNotification
  );
});
