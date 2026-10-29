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

it('requests a library-bound capability for an explicit manual library save', async () => {
  sendRuntimeMessageMock.mockImplementation(async (message: { type?: string }) =>
    message.type === MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY
      ? {
          contentIntent: { requestId: 'request-1', token: 'capability-1' },
          success: true,
        }
      : { assetId: 'asset-1', success: true }
  );
  await persistSelectionCapture({
    actionType: 'save_to_library',
    contentIntentSource: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
    dataUrl: 'data:image/png;base64,selection',
    mode: 'selection',
    sessionActivePresetId: null,
    setSaveDialogState: vi.fn(),
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      actionType: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
      libraryDestinationRequested: true,
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
    })
  );
});

it('forwards the save-issued editor asset capability into the immediate editor request', async () => {
  sendRuntimeMessageMock.mockImplementation(async (message: { type?: string }) =>
    message.type === MessageType.SAVE_SCREENSHOT_TO_GALLERY
      ? {
          assetId: 'asset-1',
          editorAssetCapability: { requestId: 'save-request-1', token: 'editor-token-1' },
          success: true,
        }
      : { success: true }
  );

  await persistSelectionCapture({
    actionType: 'edit',
    dataUrl: 'data:image/png;base64,selection',
    mode: 'selection',
    sessionActivePresetId: null,
    setSaveDialogState: vi.fn(),
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,selection',
    editorAssetCapability: { requestId: 'save-request-1', token: 'editor-token-1' },
    type: MessageType.OPEN_EDITOR_WITH_IMAGE,
  });
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

it.each(['copy', 'edit', 'download_default', 'ask_preset', 'save_to_library'] as const)(
  'uses the stored appearance raster for the selection destination %s',
  async (actionType) => {
    const capability = { requestId: 'capture-1', token: 'editor-1' };
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: true,
      assetId: 'styled-asset',
      dataUrl: 'styled',
      filename: 'styled.webp',
      editorAssetCapability: capability,
    });
    const setSaveDialogState = vi.fn();
    await persistSelectionCapture({
      actionType,
      quickActionTransactionId: 'tx-1',
      dataUrl: 'raw',
      mode: 'selection',
      sessionActivePresetId: null,
      setSaveDialogState,
    });
    expect(sendRuntimeMessageMock.mock.calls[0]![0]).toMatchObject({
      type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
      actionType,
      quickActionTransactionId: 'tx-1',
      dataUrl: 'raw',
    });
    if (actionType === 'copy')
      expect(copyImageToClipboardMock).toHaveBeenCalledWith('styled', expect.any(Object));
    if (actionType === 'edit')
      expect(sendRuntimeMessageMock.mock.calls[1]![0]).toMatchObject({
        type: MessageType.OPEN_EDITOR_WITH_IMAGE,
        dataUrl: 'styled',
        assetId: 'styled-asset',
      });
    if (actionType === 'download_default')
      expect(sendRuntimeMessageMock.mock.calls[1]![0]).toMatchObject({
        type: MessageType.EXECUTE_SAVE,
        dataUrl: 'styled',
        filename: 'styled.webp',
      });
    if (actionType === 'ask_preset')
      expect(setSaveDialogState).toHaveBeenCalledWith({
        dataUrl: 'styled',
        filename: 'styled.webp',
      });
    if (actionType === 'save_to_library') expect(sendRuntimeMessageMock).toHaveBeenCalledOnce();
  }
);
it('does not deliver a raw selection after gallery preparation refuses', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'appearance refused' });
  await expect(
    persistSelectionCapture({
      actionType: 'copy',
      dataUrl: 'raw',
      mode: 'selection',
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    })
  ).rejects.toThrow('appearance refused');
  expect(copyImageToClipboardMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledOnce();
});

it('keeps the prepared filename when a native capture opens the preset dialog', async () => {
  const setSaveDialogState = vi.fn();
  await persistBackgroundCapture({
    mode: 'visible',
    response: { action: 'ask_preset', dataUrl: 'styled', filename: 'styled.webp' },
    sessionActivePresetId: null,
    setSaveDialogState,
  });
  expect(setSaveDialogState).toHaveBeenCalledWith({ dataUrl: 'styled', filename: 'styled.webp' });
});
