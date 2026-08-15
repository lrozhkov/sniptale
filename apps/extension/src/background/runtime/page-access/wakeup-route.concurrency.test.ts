import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const senderBinding: ContentSenderBinding = {
  documentId: 'document-7',
  frameId: 0,
  senderUrl: 'https://example.test/path',
  tabId: 7,
};

function createRuntimeState(): BackgroundRuntimeMessageDeps {
  const scenarioSessionService = createScenarioSessionServiceStub();
  scenarioSessionService.getSession = vi.fn(async () => ({
    captureMode: 'manual' as const,
    enabled: false,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: false,
  }));
  scenarioSessionService.getSurface = vi.fn(async () => ({
    captureAction: 'copy' as const,
    screenshotMode: false,
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
) {
  return new Promise<{
    pinToTab?: boolean;
    restored?: boolean;
    success: boolean;
  }>((resolve, reject) => {
    const handled = routeContentRuntimeWakeupMessage({
      message,
      runtimeState,
      senderBinding,
      sendResponse: (response) => {
        if (!response) {
          reject(new Error('Expected content runtime wake-up response'));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      },
    });
    expect(handled).toBe(true);
  });
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
  pageAccessMocks.hasActivePageAccess.mockResolvedValue(true);
  pageAccessMocks.hasPinnedToolbarAllSitesAccess.mockResolvedValue(true);
  pageAccessMocks.registerPinnedToolbarAllSitesAccess.mockImplementation(
    async (args: { commit: () => Promise<boolean> }) =>
      (await args.commit()) ? 'registered' : 'superseded'
  );
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

describe('content runtime wakeup ordering', () => {
  it('stops a delayed passive restore when a newer unpin invalidates it', async () => {
    let authoritativePin = true;
    pinStorageMocks.readPinToTabSessionStorageState.mockImplementation(
      async () => authoritativePin
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(
      async (_tabId: number, mutation: { pinToTab?: boolean }) => {
        authoritativePin = mutation.pinToTab ?? authoritativePin;
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
    await expect(unpin).resolves.toMatchObject({ pinToTab: false, restored: false });
    pageAccess.resolve(true);

    await expect(passiveRestore).resolves.toMatchObject({
      pinToTab: false,
      restored: false,
    });
    expect(pageAccessMocks.ensureActivePageAccessRuntime).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });

  it('does not commit stale visible projection after an accepted collapse', async () => {
    let authoritativePin = true;
    let toolbarVisible = true;
    const finalEnable = createDeferred<void>();
    pinStorageMocks.readPinToTabSessionStorageState.mockImplementation(
      async () => authoritativePin
    );
    pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockImplementation(
      async () => toolbarVisible
    );
    pinStorageMocks.writePinToTabSessionStorageState.mockImplementation(
      async (_tabId: number, mutation: { pinToTab?: boolean; toolbarVisible?: boolean }) => {
        authoritativePin = mutation.pinToTab ?? authoritativePin;
        toolbarVisible = mutation.toolbarVisible ?? toolbarVisible;
      }
    );
    readinessMocks.waitForContentToolbarReady.mockResolvedValue({
      screenshotMode: false,
      visible: false,
    });
    screenshotModeMocks.enableScreenshotModeGuarded.mockImplementationOnce(
      async (...args: unknown[]) => {
        await finalEnable.promise;
        const options = args.at(-1) as { commitGuard: () => Promise<boolean> };
        return options.commitGuard();
      }
    );

    const passiveRestore = routeWakeup();
    await vi.waitFor(() => {
      expect(screenshotModeMocks.enableScreenshotModeGuarded).toHaveBeenCalledOnce();
    });
    const collapse = routeWakeup(createRuntimeState(), {
      toolbarVisible: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await expect(collapse).resolves.toMatchObject({ restored: false, success: true });
    finalEnable.resolve(undefined);

    await expect(passiveRestore).resolves.toMatchObject({ restored: false, success: true });
    expect(toolbarVisible).toBe(false);
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  });

  it('does not register or commit a delayed grant after navigation invalidates its document', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    const toolbarReady = createDeferred<{ screenshotMode: boolean; visible: boolean }>();
    readinessMocks.waitForContentToolbarReady.mockReturnValueOnce(toolbarReady.promise);
    const response = routeWakeup(runtimeState, {
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(readinessMocks.waitForContentToolbarReady).toHaveBeenCalledWith(7);
    });

    invalidatePinnedToolbarOperations(7);
    toolbarReady.resolve({ screenshotMode: true, visible: true });

    await expect(response).resolves.toMatchObject({ pinToTab: false, restored: false });
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
  });

  it('lets a newer unpin supersede a delayed grant before registration or commit', async () => {
    const runtimeState = createRuntimeState();
    runtimeState.screenshotModeState.set(7, true);
    const toolbarReady = createDeferred<{ screenshotMode: boolean; visible: boolean }>();
    readinessMocks.waitForContentToolbarReady.mockReturnValueOnce(toolbarReady.promise);
    const pinResponse = routeWakeup(runtimeState, {
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await vi.waitFor(() => {
      expect(readinessMocks.waitForContentToolbarReady).toHaveBeenCalledWith(7);
    });

    const unpinResponse = routeWakeup(runtimeState, {
      pinToTab: false,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    });
    await expect(unpinResponse).resolves.toMatchObject({ pinToTab: false, restored: false });
    toolbarReady.resolve({ screenshotMode: true, visible: true });

    await expect(pinResponse).resolves.toMatchObject({ pinToTab: false, restored: false });
    expect(pageAccessMocks.registerPinnedToolbarAllSitesAccess).not.toHaveBeenCalled();
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledOnce();
    expect(pinStorageMocks.writePinToTabSessionStorageState).toHaveBeenCalledWith(
      7,
      { pinToTab: false },
      expect.any(Function)
    );
  });
});
