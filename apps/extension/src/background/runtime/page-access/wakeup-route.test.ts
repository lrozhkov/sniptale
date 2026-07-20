import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

const pageAccessMocks = vi.hoisted(() => ({
  ensureActivePageAccessRuntime: vi.fn(),
  hasActivePageAccess: vi.fn(),
}));

const pinStorageMocks = vi.hoisted(() => ({
  readPinToTabSessionStorageState: vi.fn(),
}));

const screenshotModeMocks = vi.hoisted(() => ({
  enableScreenshotMode: vi.fn(),
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  ensureActivePageAccessRuntime: pageAccessMocks.ensureActivePageAccessRuntime,
  hasActivePageAccess: pageAccessMocks.hasActivePageAccess,
}));

vi.mock('../../../composition/persistence/content-pin-session/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/content-pin-session/index')
  >()),
  readPinToTabSessionStorageState: pinStorageMocks.readPinToTabSessionStorageState,
}));

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotMode: screenshotModeMocks.enableScreenshotMode,
}));

import { routeContentRuntimeWakeupMessage } from './wakeup-route';

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
  runtimeState = createRuntimeState()
): Promise<{ reason?: string; restored: boolean; success: boolean }> {
  const responsePromise = new Promise<
    { reason?: string; restored?: boolean; success: boolean } | undefined
  >((resolve) => {
    const handled = routeContentRuntimeWakeupMessage({
      message: { type: MessageType.CONTENT_RUNTIME_WAKEUP },
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
  return response as { reason?: string; restored: boolean; success: boolean };
}

function firstInvocationOrder(invocationCallOrder: number[]): number {
  const [order] = invocationCallOrder;
  expect(order).toBeDefined();
  return order ?? 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  pageAccessMocks.ensureActivePageAccessRuntime.mockResolvedValue(undefined);
  pageAccessMocks.hasActivePageAccess.mockResolvedValue(true);
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);
  screenshotModeMocks.enableScreenshotMode.mockResolvedValue(undefined);
});

describe('routeContentRuntimeWakeupMessage basics', () => {
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

  it('restores user-pinned page preparation when page access is still active', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);

    await expect(routeWakeup()).resolves.toEqual({
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(7);
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });

  it('fails closed for user pin when page access is unavailable after navigation', async () => {
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    pageAccessMocks.hasActivePageAccess.mockResolvedValue(false);

    await expect(routeWakeup()).resolves.toEqual({ restored: false, success: true });

    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });
});

describe('routeContentRuntimeWakeupMessage scenario restore', () => {
  it('restores forced scenario preparation for an active scenario session without mutating user pin', async () => {
    const runtimeState = createRuntimeState({ scenarioEnabled: true });

    await expect(routeWakeup(runtimeState)).resolves.toEqual({
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
      reason: 'scenario',
      restored: true,
      success: true,
    });

    expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledOnce();
  });
});
