// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const {
  attachContentActionIntentMock,
  createTrustedContentActionIntentSourceMock,
  cropImageMock,
  enableSelectionModeDeferredIfCurrentMock,
  persistSelectionCaptureMock,
  sendRuntimeMessageMock,
  setUIHiddenMock,
} = vi.hoisted(() => ({
  attachContentActionIntentMock: vi.fn(async (message) => message),
  createTrustedContentActionIntentSourceMock: vi.fn(),
  cropImageMock: vi.fn(),
  enableSelectionModeDeferredIfCurrentMock: vi.fn(),
  persistSelectionCaptureMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: attachContentActionIntentMock,
  createTrustedContentActionIntentSource: createTrustedContentActionIntentSourceMock,
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

vi.mock('../persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence')>()),
  persistSelectionCapture: persistSelectionCaptureMock,
}));

import { runSelectionScreenshot } from './selection';
import type { ScreenshotControllerRuntime } from '../types';
import type { SelectionModeActivationOptions } from '../../../selection/selection-mode/types';

const expiredAutoStartSource = {
  grantToken: 'expired-quick-action-grant',
  kind: 'background-auto-start',
} as const satisfies ContentPrivilegedActionIntentSource;
const freshConfirmSource = {
  kind: 'trusted-content-event',
} as const satisfies ContentPrivilegedActionIntentSource;

function createRuntime(): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'copy' },
    session: {
      editingModeBaseline: null,
      navigationLockBaseline: false,
      runActive: false,
      runGeneration: 1,
    },
    restoreEditingMode: vi.fn(),
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    setTimeout(() => callback(0), 0);
    return 0;
  });
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  sendRuntimeMessageMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,frame',
    success: true,
  });
  cropImageMock.mockResolvedValue('data:image/png;base64,crop');
  persistSelectionCaptureMock.mockResolvedValue({ successMessage: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('selection screenshot confirmation intent', () => {
  it('replaces an expired quick-action grant with the final trusted confirm after a delay', async () => {
    const selection = createDeferred<CaptureArea>();
    let activationOptions: SelectionModeActivationOptions | undefined;
    enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce((_isCurrent, options) => {
      activationOptions = options;
      return selection.promise;
    });
    createTrustedContentActionIntentSourceMock.mockReturnValue(freshConfirmSource);

    const capturePromise = runSelectionScreenshot(createRuntime(), {
      contentIntentSource: expiredAutoStartSource,
      showSuccessToast: false,
    });
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(30_000);

    const confirmEvent = new MouseEvent('click');
    activationOptions?.onConfirmEvent?.(confirmEvent);
    selection.resolve({ x: 10, y: 20, width: 100, height: 80 });
    await vi.advanceTimersByTimeAsync(500);
    await capturePromise;

    expect(createTrustedContentActionIntentSourceMock).toHaveBeenCalledWith(confirmEvent);
    expect(attachContentActionIntentMock).toHaveBeenCalledWith(
      { type: 'CAPTURE_VISIBLE_FOR_CROP' },
      freshConfirmSource
    );
    expect(persistSelectionCaptureMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentIntentSource: freshConfirmSource })
    );
  });

  it('keeps the original fail-closed source when confirmation is not trusted', async () => {
    enableSelectionModeDeferredIfCurrentMock.mockImplementationOnce(async (_isCurrent, options) => {
      options?.onConfirmEvent?.(new Event('selection-confirm'));
      return { x: 10, y: 20, width: 100, height: 80 };
    });
    createTrustedContentActionIntentSourceMock.mockReturnValue(null);

    const capturePromise = runSelectionScreenshot(createRuntime(), {
      contentIntentSource: expiredAutoStartSource,
      showSuccessToast: false,
    });
    await vi.advanceTimersByTimeAsync(500);
    await capturePromise;

    expect(attachContentActionIntentMock).toHaveBeenCalledWith(
      { type: 'CAPTURE_VISIBLE_FOR_CROP' },
      expiredAutoStartSource
    );
    expect(persistSelectionCaptureMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentIntentSource: expiredAutoStartSource })
    );
  });
});
