import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

const pageAccessMocks = vi.hoisted(() => ({
  ensureActivePageAccessRuntime: vi.fn(),
  hasActivePageAccess: vi.fn(),
  hasPinnedToolbarAllSitesAccess: vi.fn(),
  registerPinnedToolbarAllSitesAccess: vi.fn(),
}));

const readinessMocks = vi.hoisted(() => ({
  waitForContentToolbarReady: vi.fn(),
}));

const pinStorageMocks = vi.hoisted(() => ({
  readPinToTabSessionStorageState: vi.fn(),
  readPinToTabToolbarVisibilitySessionStorageState: vi.fn(),
  writePinToTabSessionStorageState: vi.fn(),
}));

const screenshotModeMocks = vi.hoisted(() => ({
  enableScreenshotMode: vi.fn(),
  enableScreenshotModeGuarded: vi.fn(),
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: pageAccessMocks.ensureActivePageAccessRuntime,
  hasActivePageAccess: pageAccessMocks.hasActivePageAccess,
  hasPinnedToolbarAllSitesAccess: pageAccessMocks.hasPinnedToolbarAllSitesAccess,
  registerPinnedToolbarAllSitesAccess: pageAccessMocks.registerPinnedToolbarAllSitesAccess,
}));

vi.mock('../../page-access/readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/readiness')>()),
  waitForContentToolbarReady: readinessMocks.waitForContentToolbarReady,
}));

vi.mock('../../../composition/persistence/content-pin-session/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/content-pin-session/index')
  >()),
  readPinToTabSessionStorageState: pinStorageMocks.readPinToTabSessionStorageState,
  readPinToTabToolbarVisibilitySessionStorageState:
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState,
  writePinToTabSessionStorageState: pinStorageMocks.writePinToTabSessionStorageState,
}));

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotMode: screenshotModeMocks.enableScreenshotMode,
  enableScreenshotModeGuarded: screenshotModeMocks.enableScreenshotModeGuarded,
}));

import { routeContentRuntimeWakeupMessage } from './wakeup-route';
import { invalidatePinnedToolbarOperations } from '../../page-access/pinned-toolbar-operation';
import { restorePinnedToolbarAfterNavigation } from './pinned-toolbar-restore';

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
): Promise<{
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  reason?: string;
  restored: boolean;
  success: boolean;
}> {
  const responsePromise = new Promise<
    | {
        pinToTab?: boolean;
        pinToTabAvailable?: boolean;
        reason?: string;
        restored?: boolean;
        success: boolean;
      }
    | undefined
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
    pinToTabAvailable?: boolean;
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
  pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValue(true);
  pageAccessMocks.hasActivePageAccess.mockResolvedValue(true);
  readinessMocks.waitForContentToolbarReady.mockResolvedValue({
    screenshotMode: true,
    visible: true,
  });
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);
  pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(true);
  pinStorageMocks.writePinToTabSessionStorageState.mockResolvedValue(undefined);
  screenshotModeMocks.enableScreenshotMode.mockResolvedValue(undefined);
  screenshotModeMocks.enableScreenshotModeGuarded.mockResolvedValue(true);
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

  it('gives forced scenario visibility precedence over a collapsed user pin', async () => {
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
    });

    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledWith(
      7,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts,
      { toolbarVisible: true }
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
    });

    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });
});
