import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const { copyImageToClipboardMock, loadSettingsMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  copyImageToClipboardMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../clipboard-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../clipboard-image')>()),
  copyImageToClipboard: copyImageToClipboardMock,
}));

import { persistBackgroundCapture, persistSelectionCapture } from '.';

type ClipboardOptions = {
  assertFresh?: () => void;
};

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createStaleGuard() {
  const staleError = new Error('stale screenshot run');
  staleError.name = 'StaleScreenshotRunError';
  return {
    assertFresh: vi.fn(() => {
      throw staleError;
    }),
    staleError,
  };
}

function createConditionalFreshnessGuard() {
  const staleError = new Error('stale screenshot run');
  staleError.name = 'StaleScreenshotRunError';
  let fresh = true;
  return {
    assertFresh: vi.fn(() => {
      if (!fresh) {
        throw staleError;
      }
    }),
    markStale: () => {
      fresh = false;
    },
    staleError,
  };
}

function hasRuntimeDispatch(type: string): boolean {
  return sendRuntimeMessageMock.mock.calls.some(([message]) => message.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  loadSettingsMock.mockResolvedValue({
    defaultImagePresetId: null,
    saveCapturesToGallery: false,
  });
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
  copyImageToClipboardMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('skips selection persistence side effects when the run goes stale during settings load', async () => {
  const settings = createDeferred<{ defaultImagePresetId: null; saveCapturesToGallery: boolean }>();
  const setSaveDialogState = vi.fn();
  const { assertFresh, staleError } = createStaleGuard();
  loadSettingsMock.mockReturnValueOnce(settings.promise);

  const persistPromise = persistSelectionCapture({
    actionType: 'download_default',
    assertFresh,
    dataUrl: 'data:image/png;base64,selection',
    mode: 'selection',
    sessionActivePresetId: null,
    setSaveDialogState,
  });
  const persistResult = expect(persistPromise).rejects.toBe(staleError);

  settings.resolve({ defaultImagePresetId: null, saveCapturesToGallery: true });
  await persistResult;

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(copyImageToClipboardMock).not.toHaveBeenCalled();
  expect(setSaveDialogState).not.toHaveBeenCalled();
});

it('skips save dispatch when the run goes stale during content-intent attachment', async () => {
  const capability = createDeferred<{
    contentIntent: { requestId: string; token: string };
    success: true;
  }>();
  const capabilityRequested = createDeferred<void>();
  const freshness = createConditionalFreshnessGuard();
  sendRuntimeMessageMock.mockImplementation(async (message: { type?: string }) => {
    if (message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY) {
      capabilityRequested.resolve();
      return capability.promise;
    }
    return { success: true };
  });

  const persistPromise = persistSelectionCapture({
    actionType: 'download_default',
    assertFresh: freshness.assertFresh,
    contentIntentSource: { grantToken: 'grant-1', kind: 'background-auto-start' },
    dataUrl: 'data:image/png;base64,selection',
    mode: 'selection',
    sessionActivePresetId: null,
    setSaveDialogState: vi.fn(),
  });
  const persistResult = expect(persistPromise).rejects.toBe(freshness.staleError);

  await capabilityRequested.promise;
  freshness.markStale();
  capability.resolve({
    contentIntent: { requestId: 'request-1', token: 'capability-1' },
    success: true,
  });
  await persistResult;

  expect(hasRuntimeDispatch(MessageType.EXECUTE_SAVE)).toBe(false);
});

it('skips save dialog mutation when background ask-preset capture becomes stale', async () => {
  const setSaveDialogState = vi.fn();
  const { assertFresh, staleError } = createStaleGuard();

  await expect(
    persistBackgroundCapture({
      assertFresh,
      mode: 'visible',
      response: {
        action: 'ask_preset',
        dataUrl: 'data:image/png;base64,visible',
      },
      sessionActivePresetId: null,
      setSaveDialogState,
    })
  ).rejects.toBe(staleError);

  expect(setSaveDialogState).not.toHaveBeenCalled();
});

it('passes screenshot freshness into background clipboard persistence', async () => {
  const { assertFresh, staleError } = createStaleGuard();
  copyImageToClipboardMock.mockImplementation(
    async (_dataUrl: string, options: ClipboardOptions) => {
      options.assertFresh?.();
    }
  );

  await expect(
    persistBackgroundCapture({
      assertFresh,
      mode: 'visible',
      response: {
        action: 'copy',
        dataUrl: 'data:image/png;base64,visible',
      },
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    })
  ).rejects.toBe(staleError);

  expect(copyImageToClipboardMock).toHaveBeenCalledWith(
    'data:image/png;base64,visible',
    expect.objectContaining({
      assertFresh,
      shouldRethrowError: expect.any(Function),
    })
  );
});
