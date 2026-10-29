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
import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeContentRuntimeWakeupMessage } from './wakeup-route';
import { invalidatePinnedToolbarOperations } from '../../page-access/pinned-toolbar-operation';
import { firstInvocationOrder } from './wakeup-route.test-support';
import { restorePinnedToolbarAfterNavigation } from './pinned-toolbar-restore';

describe('routeContentRuntimeWakeupMessage boundary', () => {
  it('ignores non-wakeup messages', () => {
    const sendResponse = vi.fn();

    expect(
      routeContentRuntimeWakeupMessage({
        message: { type: MessageType.PAGE_ACCESS },
        runtimeState: createRuntimeState(),
        senderBinding,
        sendResponse,
      })
    ).toBe(false);

    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('rejects malformed pin mutations at the route boundary', () => {
    const sendResponse = vi.fn();

    expect(
      routeContentRuntimeWakeupMessage({
        message: { pinToTab: 'yes', type: MessageType.CONTENT_RUNTIME_WAKEUP },
        runtimeState: createRuntimeState(),
        senderBinding,
        sendResponse,
      })
    ).toBe(false);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });

  it('rejects ambiguous pin and visibility mutations at the route boundary', () => {
    const sendResponse = vi.fn();

    expect(
      routeContentRuntimeWakeupMessage({
        message: {
          pinToTab: true,
          toolbarVisible: false,
          type: MessageType.CONTENT_RUNTIME_WAKEUP,
        },
        runtimeState: createRuntimeState(),
        senderBinding,
        sendResponse,
      })
    ).toBe(false);

    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('does not mutate pin state without a preauthorized content sender binding', async () => {
    const response = vi.fn();

    expect(
      routeContentRuntimeWakeupMessage({
        message: { pinToTab: true, type: MessageType.CONTENT_RUNTIME_WAKEUP },
        runtimeState: createRuntimeState(),
        senderBinding: null,
        sendResponse: response,
      })
    ).toBe(true);

    expect(response).toHaveBeenCalledWith({
      pinToTab: false,
      pinToTabAvailable: false,
      restored: false,
      success: false,
    });
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage pinned restore', () => {
  it('reports whether persistent all-sites access makes pin-to-tab available', async () => {
    pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValueOnce(false);

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: false,
      restored: false,
      success: true,
      toolbarVisible: true,
    });
  });

  it('does not restore a stored user pin through site-specific or temporary access', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValueOnce(true);
    pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValueOnce(false);

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: true,
      pinToTabAvailable: false,
      restored: false,
      success: true,
      toolbarVisible: true,
    });

    expect(pageAccessMocks.hasActivePageAccess).not.toHaveBeenCalled();
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });

  it('restores user-pinned page preparation when page access is still active', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: true,
      pinToTabAvailable: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
      toolbarVisible: true,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(screenshotModeMocks.enableScreenshotModeGuarded).toHaveBeenCalledOnce();
  });

  it('reconciles background state when the active toolbar already matches stored state', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(false);
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: true,
      visible: false,
    });

    await expect(routeWakeup()).resolves.toMatchObject({
      pinToTab: true,
      restored: true,
      success: true,
      toolbarVisible: false,
    });

    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotModeGuarded).toHaveBeenCalledWith(
      7,
      expect.any(Map),
      expect.any(Map),
      expect.any(Map),
      expect.any(Map),
      expect.objectContaining({ toolbarVisible: false })
    );
  });
});

describe('routeContentRuntimeWakeupMessage pin mutation', () => {
  it('persists pin changes through the background session-storage owner', async () => {
    const runtimeState = createRuntimeState();
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);

    await expect(
      routeWakeup(runtimeState, {
        pinToTab: true,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: true,
      pinToTabAvailable: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
      toolbarVisible: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { pinToTab: true, toolbarVisible: true },
      expect.any(Function)
    );
    expect(readinessMocks.waitForContentToolbarReady).toHaveBeenCalledWith(7);
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).toHaveBeenCalledWith({
      commit: expect.any(Function),
      expectedUrl: 'https://example.test/path',
      isCurrent: expect.any(Function),
      tabId: 7,
    });
    expect(
      firstInvocationOrder(
        pageAccessMocks.registerPinnedToolbarAllSitesAccess.mock.invocationCallOrder
      )
    ).toBeLessThan(
      firstInvocationOrder(
        pinStorageMocks.writePinToTabSessionStorageState.mock.invocationCallOrder
      )
    );
  });

  it('keeps pin disabled when persistent page access is denied', async () => {
    const runtimeState = createRuntimeState();
    pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValueOnce(false);

    await expect(
      routeWakeup(runtimeState, {
        pinToTab: true,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: false,
      restored: false,
      success: true,
      toolbarVisible: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledTimes(1);
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { pinToTab: false },
      expect.any(Function)
    );
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
    expect(readinessMocks.waitForContentToolbarReady).not.toHaveBeenCalled();
  });

  it('keeps pin disabled when persistent page-access setup fails', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    pageAccessMocks.registerPinnedToolbarAllSitesAccess.mockRejectedValueOnce(
      new Error('persistent access setup failed')
    );
    const sendResponse = vi.fn();

    routeContentRuntimeWakeupMessage({
      message: { pinToTab: true, type: MessageType.CONTENT_RUNTIME_WAKEUP },
      runtimeState,
      senderBinding,
      sendResponse,
    });
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'persistent access setup failed',
        success: false,
      });
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledTimes(1);
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { pinToTab: false },
      expect.any(Function)
    );
  });

  it('removes a user pin without requiring active screenshot mode', async () => {
    const runtimeState = createRuntimeState();
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);

    await expect(
      routeWakeup(runtimeState, {
        pinToTab: false,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      restored: false,
      success: true,
      toolbarVisible: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { pinToTab: false },
      expect.any(Function)
    );
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
  });

  it('commits an accepted unpin before navigation restore can observe the tab', async () => {
    let authoritativePin = true;
    const permissionCheck = createDeferred<boolean>();
    pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockReturnValueOnce(permissionCheck.promise);
    pinStorageMocks.readPinToTabSessionStorageState.mockImplementation(
      async () => authoritativePin
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(
      async (_tabId: number, mutation: { pinToTab?: boolean }) => {
        authoritativePin = mutation.pinToTab ?? authoritativePin;
      }
    );

    const runtimeState = createRuntimeState();
    const response = routeWakeup(runtimeState, {
      pinToTab: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(pageAccessMocks.hasPinnedToolbarAllSitesAccess).toHaveBeenCalledOnce();
    });

    invalidatePinnedToolbarOperations(7);
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });
    const restore = restorePinnedToolbarAfterNavigation(7, runtimeState);
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    permissionCheck.resolve(true);

    await expect(response).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      restored: false,
      success: true,
      toolbarVisible: true,
    });
    await expect(restore).resolves.toBe(false);
    expect(authoritativePin).toBe(false);
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });

  it('keeps authoritative pin state unchanged when the coupled unpin transaction fails', async () => {
    let authoritativePin = true;
    pinStorageMocks.readPinToTabSessionStorageState.mockImplementation(
      async () => authoritativePin
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockRejectedValueOnce(
      new Error('pin session mutation failed')
    );
    const sendResponse = vi.fn();

    routeContentRuntimeWakeupMessage({
      message: { pinToTab: false, type: MessageType.CONTENT_RUNTIME_WAKEUP },
      runtimeState: createRuntimeState(),
      senderBinding,
      sendResponse,
    });
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'pin session mutation failed',
        success: false,
      });
    });

    expect(authoritativePin).toBe(true);
  });
});

describe('routeContentRuntimeWakeupMessage toolbar visibility mutation', () => {
  it('persists collapsed state for an authoritative user pin without restoring the runtime', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      routeWakeup(createRuntimeState(), {
        toolbarVisible: false,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: true,
      pinToTabAvailable: true,
      restored: false,
      success: true,
      toolbarVisible: false,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { toolbarVisible: false },
      expect.any(Function)
    );
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });

  it('ignores toolbar visibility writes when the tab is not pinned', async () => {
    await expect(
      routeWakeup(createRuntimeState(), {
        toolbarVisible: false,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      restored: false,
      success: true,
      toolbarVisible: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });

  it('commits an accepted collapse before navigation restore reads visibility', async () => {
    let toolbarVisible = true;
    const permissionCheck = createDeferred<boolean>();
    pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockReturnValueOnce(permissionCheck.promise);
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockImplementation(
      async () => toolbarVisible
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(
      async (_tabId: number, mutation: { toolbarVisible?: boolean }) => {
        toolbarVisible = mutation.toolbarVisible ?? toolbarVisible;
      }
    );

    const runtimeState = createRuntimeState();
    const response = routeWakeup(runtimeState, {
      toolbarVisible: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(pageAccessMocks.hasPinnedToolbarAllSitesAccess).toHaveBeenCalledOnce();
    });

    invalidatePinnedToolbarOperations(7);
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });
    const restore = restorePinnedToolbarAfterNavigation(7, runtimeState);
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    permissionCheck.resolve(true);

    await expect(response).resolves.toMatchObject({
      pinToTab: true,
      restored: false,
      success: true,
      toolbarVisible: false,
    });
    await expect(restore).resolves.toBe(true);
    expect(toolbarVisible).toBe(false);
    expect(screenshotModeMocks.enableScreenshotModeGuarded).toHaveBeenCalledWith(
      7,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts,
      expect.objectContaining({
        commitGuard: expect.any(Function),
        readPreparationState: expect.any(Function),
        toolbarVisible: false,
      })
    );
  });
});

describe('routeContentRuntimeWakeupMessage unavailable access', () => {
  it('fails closed for user pin when page access is unavailable after navigation', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pageAccessMocks.hasActivePageAccess.mockResolvedValue(false);

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: true,
      pinToTabAvailable: true,
      restored: false,
      success: true,
      toolbarVisible: true,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage scenario restore', () => {
  it('restores forced scenario preparation for an active scenario session without mutating user pin', async () => {
    const runtimeState = createRuntimeState({ scenarioEnabled: true });
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      reason: 'scenario',
      restored: true,
      success: true,
      toolbarVisible: false,
    });

    expect(pinStorageMocks.readPinToTabSessionStorageState).toHaveBeenCalledWith(7);
    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(runtimeState.scenarioSessionService.updateSurfaceState).toHaveBeenCalledWith(7, {
      captureAction: 'copy',
      screenshotMode: true,
      toolbarVisible: false,
    });
    const scenarioUpdateOrder = firstInvocationOrder(
      vi.mocked(runtimeState.scenarioSessionService.updateSurfaceState).mock.invocationCallOrder
    );
    const runtimeEnsureOrder = firstInvocationOrder(
      pageAccessMocks.ensureActivePageAccessRuntime.mock.invocationCallOrder
    );
    expect(scenarioUpdateOrder).toBeLessThan(runtimeEnsureOrder);
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });

  it('preserves collapsed scenario visibility independently of the user pin', async () => {
    const runtimeState = createRuntimeState({ scenarioEnabled: true });
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(false);
    readinessMocks.waitForContentToolbarReady.mockResolvedValue({
      screenshotMode: true,
      visible: false,
    });

    await expect(routeWakeup(runtimeState)).resolves.toMatchObject({
      restored: true,
      success: true,
      toolbarVisible: false,
    });

    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledWith(
      7,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts,
      { toolbarVisible: false }
    );
    expect(screenshotModeMocks.enableScreenshotModeGuarded).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage scenario surface restore', () => {
  it('restores scenario preparation surface even when user pin is false', async () => {
    const runtimeState = createRuntimeState({
      scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
    });
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      reason: 'scenario',
      restored: true,
      success: true,
      toolbarVisible: false,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });

  it('keeps an already-forced scenario surface intact after browser history restore', async () => {
    const runtimeState = createRuntimeState({
      scenarioEnabled: true,
      scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
    });
    runtimeState.scenarioSessionService.getSurface = vi.fn(async () => ({
      captureAction: 'scenario' as const,
      screenshotMode: true,
      toolbarVisible: true,
    }));
    readinessMocks.waitForContentToolbarReady.mockResolvedValueOnce({
      screenshotMode: false,
      visible: false,
    });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      pinToTabAvailable: true,
      reason: 'scenario',
      restored: true,
      success: true,
      toolbarVisible: true,
    });

    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });
});

it.each(['copy', 'edit', 'save_to_library'] as const)(
  'does not replace ordinary %s delivery when waking an enabled scenario',
  async (captureAction) => {
    const runtimeState = createRuntimeState({
      scenarioEnabled: true,
      scenarioSurface: { captureAction, screenshotMode: true },
    });
    readinessMocks.waitForContentToolbarReady.mockResolvedValue({
      screenshotMode: true,
      visible: false,
    });
    await expect(routeWakeup(runtimeState)).resolves.toMatchObject({
      success: true,
      reason: 'scenario',
    });
    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
  }
);
