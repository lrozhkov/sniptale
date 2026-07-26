import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

const pageAccessMocks = vi.hoisted(() => ({
  ensureActivePageAccessRuntime: vi.fn(),
  hasActivePageAccess: vi.fn(),
  registerPinnedToolbarAllSitesAccess: vi.fn(),
  requestPinnedToolbarAllSitesPermission: vi.fn(),
}));

const pinStorageMocks = vi.hoisted(() => ({
  readPinToTabSessionStorageState: vi.fn(),
  writePinToTabSessionStorageState: vi.fn(),
}));

const screenshotModeMocks = vi.hoisted(() => ({
  enableScreenshotMode: vi.fn(),
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  ensureActivePageAccessRuntime: pageAccessMocks.ensureActivePageAccessRuntime,
  hasActivePageAccess: pageAccessMocks.hasActivePageAccess,
  registerPinnedToolbarAllSitesAccess: pageAccessMocks.registerPinnedToolbarAllSitesAccess,
  requestPinnedToolbarAllSitesPermission: pageAccessMocks.requestPinnedToolbarAllSitesPermission,
}));

vi.mock('../../../composition/persistence/content-pin-session/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/content-pin-session/index')
  >()),
  readPinToTabSessionStorageState: pinStorageMocks.readPinToTabSessionStorageState,
  writePinToTabSessionStorageState: pinStorageMocks.writePinToTabSessionStorageState,
}));

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotMode: screenshotModeMocks.enableScreenshotMode,
}));

import { routeContentRuntimeWakeupMessage } from './wakeup-route';
import { invalidatePinnedToolbarOperations } from './pinned-toolbar-operation';

const senderBinding: ContentSenderBinding = {
  documentId: 'document-7',
  frameId: 0,
  senderUrl: 'https://example.test/path',
  tabId: 7,
};

function createRuntimeState(overrides?: {
  scenarioEnabled?: boolean;
  scenarioSurface?: { captureAction?: CaptureActionType; screenshotMode?: boolean };
}): BackgroundRuntimeMessageDeps {
  const scenarioSessionService = createScenarioSessionServiceStub();
  scenarioSessionService.getSession = vi.fn(async () => ({
    captureMode: 'manual' as const,
    enabled: overrides?.scenarioEnabled ?? false,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: false,
  }));
  scenarioSessionService.getSurface = vi.fn(async () => ({
    captureAction: overrides?.scenarioSurface?.captureAction ?? 'copy',
    screenshotMode: overrides?.scenarioSurface?.screenshotMode ?? false,
    toolbarVisible: false,
  }));

  return {
    captureGuardState: { isCapturing: false },
    highlighterModeState: new Map(),
    quickEditModeState: new Map(),
    scenarioSessionService,
    screenshotModeState: new Map(),
    viewportOwnerState: new Map(),
    viewportState: new Map(),
    webSnapshotViewerPorts: new Map(),
  };
}

async function routeWakeup(
  runtimeState = createRuntimeState(),
  message: unknown = { type: MessageType.CONTENT_RUNTIME_WAKEUP }
): Promise<{ pinToTab?: boolean; reason?: string; restored: boolean; success: boolean }> {
  const responsePromise = new Promise<
    { pinToTab?: boolean; reason?: string; restored?: boolean; success: boolean } | undefined
  >((resolve) => {
    const handled = routeContentRuntimeWakeupMessage({
      message,
      runtimeState,
      senderBinding,
      sendResponse: resolve,
    });
    expect(handled).toBe(true);
  });
  await Promise.resolve();
  const response = await responsePromise;
  if (!response || typeof response.restored !== 'boolean') {
    throw new Error('Expected content runtime wake-up response');
  }
  return response as {
    pinToTab?: boolean;
    reason?: string;
    restored: boolean;
    success: boolean;
  };
}

function firstInvocationOrder(invocationCallOrder: number[]): number {
  const [order] = invocationCallOrder;
  expect(order).toBeDefined();
  return order ?? 0;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  pageAccessMocks.ensureActivePageAccessRuntime.mockResolvedValue(undefined);
  pageAccessMocks.registerPinnedToolbarAllSitesAccess.mockImplementation(
    async (args: { commit: () => Promise<boolean> }) =>
      (await args.commit()) ? 'registered' : 'superseded'
  );
  pageAccessMocks.requestPinnedToolbarAllSitesPermission.mockResolvedValue(true);
  pageAccessMocks.hasActivePageAccess.mockResolvedValue(true);
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);
  pinStorageMocks.writePinToTabSessionStorageState.mockResolvedValue(undefined);
  screenshotModeMocks.enableScreenshotMode.mockResolvedValue(undefined);
});

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
      restored: false,
      success: false,
    });
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage pinned restore', () => {
  it('restores user-pinned page preparation when page access is still active', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });

  it('stops a delayed passive restore when a newer unpin invalidates it', async () => {
    let authoritativePin = true;
    pinStorageMocks.readPinToTabSessionStorageState.mockImplementation(
      async () => authoritativePin
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(
      async (_scope: unknown, value: boolean) => {
        authoritativePin = value;
      }
    );
    const pageAccess = createDeferred<boolean>();
    pageAccessMocks.hasActivePageAccess.mockReturnValueOnce(pageAccess.promise);
    const passiveRestore = routeWakeup();
    await vi.waitFor(() => {
      expect(pageAccessMocks.hasActivePageAccess).toHaveBeenCalledWith(7);
    });

    const unpin = routeWakeup(createRuntimeState(), {
      pinToTab: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await expect(unpin).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });
    pageAccess.resolve(true);

    await expect(passiveRestore).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage pin mutation', () => {
  it('persists pin changes through the background session-storage owner', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);

    await expect(
      routeWakeup(runtimeState, {
        pinToTab: true,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      {
        screenshotModeEnabled: true,
        storageKey: 'sniptale.content.pin-to-tab:tab:7',
      },
      true,
      expect.any(Function)
    );
    expect(pageAccessMocks.requestPinnedToolbarAllSitesPermission).toHaveBeenCalledOnce();
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).toHaveBeenCalledWith({
      commit: expect.any(Function),
      expectedUrl: 'https://example.test/path',
      isCurrent: expect.any(Function),
      tabId: 7,
    });
    expect(
      firstInvocationOrder(
        pageAccessMocks.requestPinnedToolbarAllSitesPermission.mock.invocationCallOrder
      )
    ).toBeLessThan(
      firstInvocationOrder(
        pageAccessMocks.registerPinnedToolbarAllSitesAccess.mock.invocationCallOrder
      )
    );
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
    runtimeState.screenshotModeState.set(7, true);
    pageAccessMocks.requestPinnedToolbarAllSitesPermission.mockResolvedValueOnce(false);

    await expect(
      routeWakeup(runtimeState, {
        pinToTab: true,
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledTimes(1);
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      {
        screenshotModeEnabled: true,
        storageKey: 'sniptale.content.pin-to-tab:tab:7',
      },
      false,
      expect.any(Function)
    );
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
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
      {
        screenshotModeEnabled: true,
        storageKey: 'sniptale.content.pin-to-tab:tab:7',
      },
      false,
      expect.any(Function)
    );
    expect(pageAccessMocks.requestPinnedToolbarAllSitesPermission).toHaveBeenCalledOnce();
  });

  it('does not register or commit a delayed grant after navigation invalidates its document', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    const permission = createDeferred<boolean>();
    pageAccessMocks.requestPinnedToolbarAllSitesPermission.mockReturnValueOnce(permission.promise);
    const response = routeWakeup(runtimeState, {
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(pageAccessMocks.requestPinnedToolbarAllSitesPermission).toHaveBeenCalledOnce();
    });

    invalidatePinnedToolbarOperations(7);
    permission.resolve(true);

    await expect(response).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });

  it('lets a newer unpin supersede a delayed grant before registration or commit', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    const permission = createDeferred<boolean>();
    pageAccessMocks.requestPinnedToolbarAllSitesPermission.mockReturnValueOnce(permission.promise);
    const pinResponse = routeWakeup(runtimeState, {
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(pageAccessMocks.requestPinnedToolbarAllSitesPermission).toHaveBeenCalledOnce();
    });

    const unpinResponse = routeWakeup(runtimeState, {
      pinToTab: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await expect(unpinResponse).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });
    permission.resolve(true);

    await expect(pinResponse).resolves.toEqual({
      pinToTab: false,
      restored: false,
      success: true,
    });
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledTimes(1);
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      {
        screenshotModeEnabled: true,
        storageKey: 'sniptale.content.pin-to-tab:tab:7',
      },
      false,
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
      restored: false,
      success: true,
    });

    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      {
        screenshotModeEnabled: false,
        storageKey: 'sniptale.content.pin-to-tab:tab:7',
      },
      false,
      expect.any(Function)
    );
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage unavailable access', () => {
  it('fails closed for user pin when page access is unavailable after navigation', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pageAccessMocks.hasActivePageAccess.mockResolvedValue(false);

    await expect(routeWakeup()).resolves.toEqual({
      pinToTab: true,
      restored: false,
      success: true,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage scenario restore', () => {
  it('restores forced scenario preparation for an active scenario session without mutating user pin', async () => {
    const runtimeState = createRuntimeState({ scenarioEnabled: true });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      reason: 'scenario',
      restored: true,
      success: true,
    });

    expect(pinStorageMocks.readPinToTabSessionStorageState).toHaveBeenCalledWith(7);
    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(runtimeState.scenarioSessionService.updateSurfaceState).toHaveBeenCalledWith(7, {
      captureAction: 'scenario',
      screenshotMode: true,
      toolbarVisible: true,
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
});

describe('routeContentRuntimeWakeupMessage scenario surface restore', () => {
  it('restores scenario preparation surface even when user pin is false', async () => {
    const runtimeState = createRuntimeState({
      scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
    });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      reason: 'scenario',
      restored: true,
      success: true,
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

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
      pinToTab: false,
      reason: 'scenario',
      restored: true,
      success: true,
    });

    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });
});
