import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  consumeProjectExportInputMock,
  parseOffscreenRuntimeMessageMock,
  startProjectExportMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  consumeProjectExportInputMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  startProjectExportMock: vi.fn(),
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

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: vi.fn() }),
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
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  updateViewportCrop: vi.fn(),
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

import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
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
type SendResponse = (response?: unknown) => void;

const trustedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;

let freshnessNonce = 0;

function createDeferred() {
  let rejectPromise: ((error: unknown) => void) | undefined;
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return {
    promise,
    reject: (error: unknown) => rejectPromise?.(error),
    resolve: () => resolvePromise?.(),
  };
}

function createExportCommand() {
  return attachOffscreenCommandCapability({
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    input: createProjectExportInputReference('job-idempotent'),
    jobId: 'job-idempotent',
    settings: createExportSettings(),
  });
}

function emitCommand(
  listener: SubscriptionListener,
  command: ReturnType<typeof createExportCommand>,
  sendResponse: SendResponse
): unknown {
  freshnessNonce += 1;
  return listener(
    attachRuntimeMessageFreshness(command, {
      issuedAtEpochMs: Date.now(),
      nonce: `offscreen-idempotency-${freshnessNonce}`,
    }),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  freshnessNonce = 0;
  consumeProjectExportInputMock.mockResolvedValue(createProject());
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
});

it('shares successful duplicate export commands without rerunning side effects', async () => {
  const listener = await captureSubscriptionListener();
  const command = createExportCommand();
  const sendResponse = vi.fn<SendResponse>();
  const started = createDeferred();
  startProjectExportMock.mockReturnValueOnce(started.promise);

  expect(emitCommand(listener, command, sendResponse)).toBe(true);
  expect(emitCommand(listener, command, sendResponse)).toBe(true);
  started.resolve();
  await vi.waitFor(() => {
    expect(startProjectExportMock).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledTimes(2);
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('returns the original failure to an in-flight duplicate export command', async () => {
  const listener = await captureSubscriptionListener();
  const command = createExportCommand();
  const sendResponse = vi.fn<SendResponse>();
  const started = createDeferred();
  startProjectExportMock.mockReturnValueOnce(started.promise);

  emitCommand(listener, command, sendResponse);
  expect(emitCommand(listener, command, sendResponse)).toBe(true);
  started.reject(new Error('export failed'));
  await vi.waitFor(() => {
    expect(startProjectExportMock).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledTimes(2);
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'export failed' });
});

it('allows retry after a failed export command with the same capability generation', async () => {
  const listener = await captureSubscriptionListener();
  const command = createExportCommand();
  const firstResponse = vi.fn<SendResponse>();
  startProjectExportMock.mockRejectedValueOnce(new Error('first failed'));

  emitCommand(listener, command, firstResponse);
  await vi.waitFor(() => {
    expect(firstResponse).toHaveBeenCalledWith({ success: false, error: 'first failed' });
  });

  const retryResponse = vi.fn<SendResponse>();
  startProjectExportMock.mockResolvedValueOnce(undefined);
  expect(emitCommand(listener, command, retryResponse)).toBe(true);
  await vi.waitFor(() => {
    expect(startProjectExportMock).toHaveBeenCalledTimes(2);
    expect(retryResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });
});
