import {
  pageAccessMocks,
  readinessMocks,
  pinStorageMocks,
  screenshotModeMocks,
  senderBinding,
  createRuntimeState,
  routeWakeup,
  createDeferred,
} from './wakeup-route.test-support';
import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeContentRuntimeWakeupMessage } from './wakeup-route';
import { invalidatePinnedToolbarOperations } from '../../page-access/pinned-toolbar-operation';

it('activates a collapse pin through existing guarded registration without expanding the toolbar', async () => {
  await routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
    autoPinToTab: true,
  });
  expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).toHaveBeenCalledOnce();
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
    7,
    { pinToTab: true, toolbarVisible: false, automatic: true },
    expect.any(Function)
  );
  expect(screenshotModeMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();
});

it('clears only the automatic pin when the toolbar expands', async () => {
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  pinStorageMocks.readPinToTabAutomaticSessionStorageState.mockResolvedValue(true);
  await routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: true,
  });
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
    7,
    { pinToTab: false },
    expect.any(Function)
  );
});

it('preserves manual origin on trusted collapse and keeps it on expansion', async () => {
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  for (const toolbarVisible of [false, true]) {
    await routeWakeup(createRuntimeState(), {
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
      toolbarVisible,
      ...(!toolbarVisible ? { autoPinToTab: true } : {}),
    });
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenLastCalledWith(
      7,
      { toolbarVisible },
      expect.any(Function)
    );
  }
  expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
});

it('does not activate a collapse pin without the existing all-sites grant', async () => {
  pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValue(false);
  await routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
    autoPinToTab: true,
  });
  expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
  expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
});

it('does not let delayed automatic activation recreate a pin after explicit unpin', async () => {
  const ready = createDeferred<{ screenshotMode: boolean; visible: boolean }>();
  readinessMocks.waitForContentToolbarReady.mockReturnValueOnce(ready.promise);
  const collapse = routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
    autoPinToTab: true,
  });
  await vi.waitFor(() => expect(readinessMocks.waitForContentToolbarReady).toHaveBeenCalledOnce());
  const unpin = routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    pinToTab: false,
  });
  ready.resolve({ screenshotMode: true, visible: false });
  await Promise.all([collapse, unpin]);
  expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledExactlyOnceWith(
    7,
    { pinToTab: false },
    expect.any(Function)
  );
});

it('refuses a delayed automatic activation after its document is replaced', async () => {
  const ready = createDeferred<{ screenshotMode: boolean; visible: boolean }>();
  readinessMocks.waitForContentToolbarReady.mockReturnValueOnce(ready.promise);
  const collapse = routeWakeup(createRuntimeState(), {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
    autoPinToTab: true,
  });
  await vi.waitFor(() => expect(readinessMocks.waitForContentToolbarReady).toHaveBeenCalledOnce());
  invalidatePinnedToolbarOperations(7);
  ready.resolve({ screenshotMode: true, visible: false });
  await collapse;
  expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
  expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
});

it('allows an explicit automatic-pin retry after registration fails', async () => {
  pageAccessMocks.registerPinnedToolbarAllSitesAccess.mockRejectedValueOnce(
    new Error('registration failed')
  );
  const sendResponse = vi.fn();
  const message = {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
    autoPinToTab: true,
  };
  routeContentRuntimeWakeupMessage({
    message,
    runtimeState: createRuntimeState(),
    senderBinding,
    sendResponse,
  });
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'registration failed' })
  );
  expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  await routeWakeup(createRuntimeState(), message);
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
    7,
    { pinToTab: true, toolbarVisible: false, automatic: true },
    expect.any(Function)
  );
});

it('preserves an automatic pin if explicit promotion to manual pin fails', async () => {
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  pinStorageMocks.readPinToTabAutomaticSessionStorageState.mockResolvedValue(true);
  pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(false);
  pageAccessMocks.registerPinnedToolbarAllSitesAccess.mockRejectedValueOnce(
    new Error('promotion failed')
  );
  const sendResponse = vi.fn();
  routeContentRuntimeWakeupMessage({
    message: { type: MessageType.CONTENT_RUNTIME_WAKEUP, pinToTab: true },
    runtimeState: createRuntimeState(),
    senderBinding,
    sendResponse,
  });
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'promotion failed' })
  );
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenLastCalledWith(
    7,
    { pinToTab: true, toolbarVisible: false, automatic: true },
    expect.any(Function)
  );
});

it('clears automatic pin on expansion even when a scenario now owns the surface', async () => {
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  pinStorageMocks.readPinToTabAutomaticSessionStorageState.mockResolvedValue(true);
  await routeWakeup(
    createRuntimeState({
      scenarioEnabled: true,
      scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
    }),
    { type: MessageType.CONTENT_RUNTIME_WAKEUP, toolbarVisible: true }
  );
  expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenLastCalledWith(
    7,
    { pinToTab: false },
    expect.any(Function)
  );
});

it('replaces automatic origin when the user explicitly confirms a manual pin', async () => {
  let automatic = true;
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
  pinStorageMocks.readPinToTabAutomaticSessionStorageState.mockImplementation(
    async () => automatic
  );
  pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(async (_tabId, mutation) => {
    if (mutation.pinToTab === true) automatic = mutation.automatic === true;
  });
  await expect(
    routeWakeup(createRuntimeState(), {
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
      pinToTab: true,
    })
  ).resolves.toMatchObject({ success: true, pinToTab: true });
  expect(automatic).toBe(false);
});

it('rejects automatic activation shapes that are not an unambiguous collapse', () => {
  for (const mutation of [
    { autoPinToTab: true },
    { autoPinToTab: false, toolbarVisible: false },
    { autoPinToTab: true, toolbarVisible: true },
    { autoPinToTab: true, toolbarVisible: false, pinToTab: false },
  ]) {
    const sendResponse = vi.fn();
    expect(
      routeContentRuntimeWakeupMessage({
        message: { type: MessageType.CONTENT_RUNTIME_WAKEUP, ...mutation },
        runtimeState: createRuntimeState(),
        senderBinding,
        sendResponse,
      })
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  }
});
