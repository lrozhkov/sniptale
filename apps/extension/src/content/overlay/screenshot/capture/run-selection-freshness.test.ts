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

const frozenMocks = vi.hoisted(() => ({
  acquireFrame: vi.fn(),
  captureGeometry: vi.fn(),
  prepareFrame: vi.fn(),
  assertViewport: vi.fn(),
}));
vi.mock('../../../selection/selection-mode/frozen', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/selection-mode/frozen')>()),
  captureFrozenSelectionGeometry: frozenMocks.captureGeometry,
  prepareFrozenSelectionFrame: frozenMocks.prepareFrame,
}));

vi.mock('../../../selection/selection-mode/frozen-acquisition', () => ({
  SelectionFrameChangedError: class SelectionFrameChangedError extends Error {},
  acquireFrozenSelectionFrame: frozenMocks.acquireFrame,
}));

import { runSelectionScreenshot } from './run';
import { SelectionFrameChangedError } from '../../../selection/selection-mode/frozen-acquisition';
import type { ScreenshotControllerRuntime } from '../types';

function createRuntime(): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    session: {
      editingModeBaseline: null,
      navigationLockBaseline: false,
      runActive: true,
      runGeneration: 1,
    },
    restoreEditingMode: vi.fn(),
    setCaptureAction: vi.fn(),
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
  frozenMocks.acquireFrame.mockImplementation(async (capture: () => Promise<string>) => ({
    dataUrl: await capture(),
    geometry: frozenMocks.captureGeometry(),
  }));
  frozenMocks.captureGeometry.mockReturnValue({
    width: 1024,
    height: 768,
    scale: 1,
    getRect: vi.fn(),
    targetAt: vi.fn(),
    assertViewport: frozenMocks.assertViewport,
  });
  frozenMocks.prepareFrame.mockResolvedValue(undefined);
  frozenMocks.assertViewport.mockReset();
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
  runtime.session.runGeneration = 2;
  expect(isCurrent?.()).toBe(false);
}

async function expectStaleLazySelectionRejectionNormalizesToStaleRun() {
  const runtime = createRuntime();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(async () => {
    runtime.session.runGeneration = 2;
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
    runtime.session.runGeneration = 2;
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
  runtime.session.runGeneration = 2;
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

it('captures once before timed selection and crops that same frame after the page changes', async () => {
  const selected = createDeferred<{ x: number; y: number; width: number; height: number }>();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(() => selected.promise);
  const pending = runSelectionScreenshot(createRuntime(), { freezeSelection: true, runToken: 1 });
  await settleCaptureTimers();
  expect(hasSelectionFrameDispatch()).toBe(true);
  expect(cropImageMock).not.toHaveBeenCalled();
  expect(enableSelectionModeDeferredIfCurrentMock).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      frozenFrame: expect.objectContaining({ dataUrl: 'data:image/png;base64,frame' }),
    })
  );
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    dataUrl: 'data:image/png;base64,changed',
  });
  const area = { x: 20, y: 30, width: 100, height: 80 };
  selected.resolve(area);
  await settleCaptureTimers();
  await pending;
  expect(cropImageMock).toHaveBeenCalledWith('data:image/png;base64,frame', area);
  expect(
    sendRuntimeMessageMock.mock.calls.filter(
      ([message]) => message.type === CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
    )
  ).toHaveLength(1);
});

it('uses the captured raster for area-only selection when the page changes', async () => {
  frozenMocks.acquireFrame.mockImplementationOnce(
    async (capture: () => Promise<string>, options?: { onChanged?: string }) => {
      const dataUrl = await capture();
      if (options?.onChanged !== 'area-only') throw new SelectionFrameChangedError();
      return { areaOnly: true, dataUrl, geometry: frozenMocks.captureGeometry() };
    }
  );
  const selected = createDeferred<{ x: number; y: number; width: number; height: number }>();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(() => selected.promise);
  const pending = runSelectionScreenshot(createRuntime(), { freezeSelection: true, runToken: 1 });
  await settleCaptureTimers();
  expect(enableSelectionModeDeferredIfCurrentMock).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      frozenFrame: expect.objectContaining({
        areaOnly: true,
        dataUrl: 'data:image/png;base64,frame',
      }),
    })
  );
  const area = { x: 10, y: 20, width: 30, height: 40 };
  selected.resolve(area);
  await settleCaptureTimers();
  await pending;
  expect(cropImageMock).toHaveBeenCalledWith('data:image/png;base64,frame', area);
  expect(
    sendRuntimeMessageMock.mock.calls.filter(
      ([message]) => message.type === CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
    )
  ).toHaveLength(1);
});

it('restores the visible UI after an unrecoverable acquisition failure', async () => {
  frozenMocks.acquireFrame.mockRejectedValue(new Error('acquisition failed'));
  const runtime = createRuntime();
  const pending = runSelectionScreenshot(runtime, { freezeSelection: true, runToken: 1 });
  const rejected = expect(pending).rejects.toThrow('acquisition failed');
  await settleCaptureTimers();
  await rejected;
  expect(frozenMocks.acquireFrame).toHaveBeenCalledOnce();
  expect(enableSelectionModeDeferredIfCurrentMock).not.toHaveBeenCalled();
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
});

it('keeps untimed selection dynamic and captures only after confirmation', async () => {
  const selected = createDeferred<{ x: number; y: number; width: number; height: number }>();
  enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(() => selected.promise);
  const pending = runSelectionScreenshot(createRuntime(), { runToken: 1 });
  await settleCaptureTimers();
  expect(hasSelectionFrameDispatch()).toBe(false);
  expect(frozenMocks.captureGeometry).not.toHaveBeenCalled();
  selected.resolve({ x: 0, y: 0, width: 100, height: 80 });
  await settleCaptureTimers();
  await pending;
  expect(hasSelectionFrameDispatch()).toBe(true);
});

it('does not open frozen selection or persist when the frame request fails', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: false, error: 'capture failed' });
  const pending = runSelectionScreenshot(createRuntime(), { freezeSelection: true, runToken: 1 });
  const rejected = expect(pending).rejects.toThrow('capture failed');
  await settleCaptureTimers();
  await rejected;
  expect(enableSelectionModeDeferredIfCurrentMock).not.toHaveBeenCalled();
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
});

it('discards a frozen frame whose request completes after run invalidation', async () => {
  const runtime = createRuntime();
  const capture = createDeferred<{ success: true; dataUrl: string }>();
  sendRuntimeMessageMock.mockImplementationOnce(() => capture.promise);
  const pending = runSelectionScreenshot(runtime, { freezeSelection: true, runToken: 1 });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'StaleScreenshotRunError' });
  await settleCaptureTimers();
  runtime.session.runGeneration += 1;
  capture.resolve({ success: true, dataUrl: 'data:image/png;base64,stale' });
  await rejected;
  expect(enableSelectionModeDeferredIfCurrentMock).not.toHaveBeenCalled();
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
});

it('does not crop or publish a frozen selection after cancellation', async () => {
  enableSelectionModeDeferredIfCurrentMock.mockRejectedValueOnce(new Error('Cancelled by user'));
  const pending = runSelectionScreenshot(createRuntime(), { freezeSelection: true, runToken: 1 });
  const rejected = expect(pending).rejects.toThrow('Cancelled by user');
  await settleCaptureTimers();
  await rejected;
  expect(cropImageMock).not.toHaveBeenCalled();
  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
});
