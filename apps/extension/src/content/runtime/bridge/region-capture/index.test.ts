import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { handleRegionCaptureMessage } from '.';
import { createRegionCaptureProgressReporter } from './transport';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const {
  sendRuntimeMessage,
  createLogger,
  loggerDebug,
  loggerWarn,
  startRegionCapture,
  stopRegionCapture,
  getRegionCaptureSupport,
} = vi.hoisted(() => {
  const loggerDebug = vi.fn();
  const loggerWarn = vi.fn();

  return {
    sendRuntimeMessage: vi.fn(),
    loggerDebug,
    loggerWarn,
    createLogger: vi.fn(() => ({
      debug: loggerDebug,
      warn: loggerWarn,
    })),
    startRegionCapture: vi.fn(),
    stopRegionCapture: vi.fn(),
    getRegionCaptureSupport: vi.fn(),
  };
});

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger,
}));

vi.mock('../../../selection/region-capture', () => ({
  createRegionCaptureSession: vi.fn(),
  getRegionCaptureSupport,
  startRegionCapture,
  stopRegionCapture,
}));

function createRegionCaptureSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneEnabled: true,
    microphoneDeviceId: null,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessage);
  createLogger.mockImplementation(() => ({
    debug: loggerDebug,
    warn: loggerWarn,
  }));
});

async function expectRegionCaptureProgressTransport() {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage('REGION_CAPTURE_STARTED', () => ({ success: true }));
  transport.onRuntimeMessage('REGION_CAPTURE_ERROR', () => ({ success: true }));
  const reportProgress = createRegionCaptureProgressReporter(transport);

  reportProgress({ type: 'STARTED' });
  reportProgress({ type: 'ERROR', error: 'boom' });

  await Promise.resolve();

  expect(transport.runtimeRequests).toEqual([
    { type: 'REGION_CAPTURE_STARTED' },
    { type: 'REGION_CAPTURE_ERROR', error: 'boom' },
  ]);
}

async function expectDefaultTransportProgressRouting() {
  const reportProgress = createRegionCaptureProgressReporter();

  sendRuntimeMessage.mockResolvedValue({ success: true });
  reportProgress({ type: 'STARTED' });
  reportProgress({ type: 'ERROR', error: 'boom' });

  await Promise.resolve();
  await Promise.resolve();

  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    type: 'REGION_CAPTURE_STARTED',
  });
  expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: 'REGION_CAPTURE_ERROR',
    error: 'boom',
  });
}

async function expectRegionCaptureProgressWarning() {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage('REGION_CAPTURE_STARTED', async () => {
    throw new Error('bridge failed');
  });
  const reportProgress = createRegionCaptureProgressReporter(transport);

  reportProgress({ type: 'STARTED' });
  await Promise.resolve();
  await Promise.resolve();

  expect(loggerWarn).toHaveBeenCalledWith(
    'Failed to forward region capture progress update',
    { type: 'REGION_CAPTURE_STARTED' },
    expect.any(Error)
  );
}

async function expectStartMessageUsesInjectedTransport() {
  const transport = new FakeRuntimeMessagingTransport();
  transport.onRuntimeMessage('REGION_CAPTURE_STARTED', () => ({ success: true }));
  const startCapture = vi.fn(async (_settings, onProgress) => {
    onProgress({ type: 'STARTED' });
  });
  const sendResponse = vi.fn();

  const didHandle = handleRegionCaptureMessage(
    {
      type: 'START_REGION_CAPTURE',
      settings: createRegionCaptureSettings(),
    },
    sendResponse,
    {
      getSupport: vi.fn(),
      logger: { debug: vi.fn() },
      startCapture,
      stopCapture: vi.fn(),
      transport,
    }
  );

  expect(didHandle).toBe(true);
  await Promise.resolve();
  expect(startCapture).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  expect(transport.runtimeRequests).toContainEqual({ type: 'REGION_CAPTURE_STARTED' });
}

async function expectStartMessageFailureResponse() {
  const sendResponse = vi.fn();
  const startCapture = vi.fn(async () => {
    throw new Error('capture failed');
  });

  expect(
    handleRegionCaptureMessage(
      {
        type: 'START_REGION_CAPTURE',
        settings: createRegionCaptureSettings(),
      },
      sendResponse,
      {
        getSupport: vi.fn(),
        logger: { debug: vi.fn() },
        startCapture,
        stopCapture: vi.fn(),
        transport: new FakeRuntimeMessagingTransport(),
      }
    )
  ).toBe(true);

  await Promise.resolve();
  await Promise.resolve();

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'capture failed',
  });
}

function expectStopAndSupportRouting() {
  const stopCapture = vi.fn();
  const stopResponse = vi.fn();

  expect(
    handleRegionCaptureMessage({ type: 'STOP_REGION_CAPTURE' }, stopResponse, {
      getSupport: vi.fn(),
      logger: { debug: vi.fn() },
      startCapture: vi.fn(),
      stopCapture,
      transport: new FakeRuntimeMessagingTransport(),
    })
  ).toBe(true);
  expect(stopCapture).toHaveBeenCalledOnce();
  expect(stopResponse).toHaveBeenCalledWith({ success: true });
}

async function expectDefaultDepsStartPath() {
  const startCaptureImpl = vi.fn(async (_settings, onProgress) => {
    onProgress({ type: 'STARTED' });
  });
  const support = { cropTo: true, produceCropTarget: true, supported: true };

  startRegionCapture.mockImplementation(startCaptureImpl);
  getRegionCaptureSupport.mockReturnValue(support);
  stopRegionCapture.mockImplementation(() => undefined);
  sendRuntimeMessage.mockResolvedValue({ success: true });

  const sendResponse = vi.fn();

  expect(
    handleRegionCaptureMessage(
      {
        type: 'START_REGION_CAPTURE',
        settings: createRegionCaptureSettings(),
      },
      sendResponse
    )
  ).toBe(true);

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(startRegionCapture).toHaveBeenCalledOnce();
  expect(loggerDebug).toHaveBeenCalledWith('[ContentRegionCapture] start', {
    microphoneEnabled: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectUnrelatedMessageRouting() {
  expect(handleRegionCaptureMessage({ type: 'UNKNOWN' } as never, vi.fn())).toBeNull();
  expect(
    handleRegionCaptureMessage({ type: MessageType.SHOW_TOOLBAR } as never, vi.fn())
  ).toBeNull();
}

describe('region capture runtime transport', () => {
  it(
    'forwards progress lifecycle messages through typed runtime transport',
    expectRegionCaptureProgressTransport
  );
  it(
    'uses the default runtime transport when callers do not inject one',
    expectDefaultTransportProgressRouting
  );
  it(
    'warns when fail-soft region capture progress forwarding rejects',
    expectRegionCaptureProgressWarning
  );
});

describe('handleRegionCaptureMessage', () => {
  it(
    'starts region capture with injected transport ownership and resolves the response',
    expectStartMessageUsesInjectedTransport
  );
  it(
    'returns a normalized error response when injected start capture rejects',
    expectStartMessageFailureResponse
  );
  it('routes stop and support messages through injected deps', expectStopAndSupportRouting);
  it(
    'starts region capture through default bridge deps when callers do not inject them',
    expectDefaultDepsStartPath
  );
  it('returns null for unrelated region-capture messages', expectUnrelatedMessageRouting);
});
