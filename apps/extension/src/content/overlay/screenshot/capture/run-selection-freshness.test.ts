import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const {
  cropImageMock,
  enableSelectionModeDeferredIfCurrentMock,
  persistBackgroundCaptureMock,
  persistSelectionCaptureMock,
  sendRuntimeMessageMock,
  setUIHiddenMock,
} = vi.hoisted(() => ({
  cropImageMock: vi.fn(),
  enableSelectionModeDeferredIfCurrentMock: vi.fn(),
  persistBackgroundCaptureMock: vi.fn(),
  persistSelectionCaptureMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-crop')>()),
  cropImage: cropImageMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

vi.mock('../../../selection/selection-mode/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/selection-mode/lazy')>()),
  enableSelectionModeDeferredIfCurrent: enableSelectionModeDeferredIfCurrentMock,
}));

vi.mock('../persistence', () => ({
  persistBackgroundCapture: persistBackgroundCaptureMock,
  persistSelectionCapture: persistSelectionCaptureMock,
}));

import { runSelectionScreenshot } from './run';
import type { ScreenshotControllerRuntime } from '../types';

function createRuntime(): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: true },
    screenshotRunGenerationRef: { current: 1 },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

async function settleCaptureTimers() {
  await vi.advanceTimersByTimeAsync(500);
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function hasSelectionFrameDispatch(): boolean {
  return sendRuntimeMessageMock.mock.calls.some(
    ([message]) => message.type === CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  vi.useFakeTimers();
  const requestAnimationFrameMock: typeof requestAnimationFrame = (callback) => {
    setTimeout(() => callback(0), 0);
    return 0;
  };
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  persistSelectionCaptureMock.mockResolvedValue({ successMessage: null });
  sendRuntimeMessageMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,frame',
    success: true,
  });
  enableSelectionModeDeferredIfCurrentMock.mockResolvedValue({
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  });
  cropImageMock.mockResolvedValue('data:image/png;base64,crop');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function expectSelectionCapturePassesFreshnessGuardToLazySelection() {
  const runtime = createRuntime();

  const capturePromise = runSelectionScreenshot(runtime, {
    runToken: 1,
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  const isCurrent = enableSelectionModeDeferredIfCurrentMock.mock.calls[0]?.[0];
  expect(isCurrent).toBeTypeOf('function');
  expect(isCurrent?.()).toBe(true);
  runtime.screenshotRunGenerationRef.current = 2;
  expect(isCurrent?.()).toBe(false);
}

async function expectStaleLazySelectionRejectionNormalizesToStaleRun() {
  const runtime = createRuntime();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(async () => {
    runtime.screenshotRunGenerationRef.current = 2;
    throw new Error('Selection mode activation was superseded.');
  });

  const capturePromise = runSelectionScreenshot(runtime, {
    runToken: 1,
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });
  await settleCaptureTimers();
  await captureExpectation;
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
}

async function expectStaleSelectionCancelNormalizesToStaleRun() {
  const runtime = createRuntime();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(async () => {
    runtime.screenshotRunGenerationRef.current = 2;
    throw new Error('Cancelled by user');
  });

  const capturePromise = runSelectionScreenshot(runtime, {
    runToken: 1,
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });
  await settleCaptureTimers();
  await captureExpectation;
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
}

async function expectStaleSelectionSkipsFrameDispatchAfterIntentAwait() {
  const runtime = createRuntime();
  const capability = createDeferred<{
    contentIntent: { requestId: string; token: string };
    success: true;
  }>();
  sendRuntimeMessageMock.mockImplementation(
    async (message: { requestId?: string; type?: string }) => {
      if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY) {
        return capability.promise;
      }
      return { dataUrl: 'data:image/png;base64,frame', success: true };
    }
  );

  const capturePromise = runSelectionScreenshot(runtime, {
    contentIntentSource: { grantToken: 'grant-1', kind: 'background-auto-start' },
    runToken: 1,
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });

  await settleCaptureTimers();
  runtime.screenshotRunGenerationRef.current = 2;
  capability.resolve({
    contentIntent: { requestId: 'request-1', token: 'capability-1' },
    success: true,
  });
  await captureExpectation;

  expect(hasSelectionFrameDispatch()).toBe(false);
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
}

describe('selection screenshot lazy activation freshness', () => {
  it(
    'passes screenshot run freshness into the lazy selection-mode activation',
    expectSelectionCapturePassesFreshnessGuardToLazySelection
  );
  it(
    'normalizes stale lazy selection activation rejection into a stale screenshot run',
    expectStaleLazySelectionRejectionNormalizesToStaleRun
  );
  it(
    'normalizes stale selection cleanup cancellation into a stale screenshot run',
    expectStaleSelectionCancelNormalizesToStaleRun
  );
  it(
    'skips crop-frame dispatch when the run is superseded before request send',
    expectStaleSelectionSkipsFrameDispatchAfterIntentAwait
  );
});
