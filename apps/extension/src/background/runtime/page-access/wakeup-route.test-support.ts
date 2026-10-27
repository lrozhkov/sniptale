import { beforeEach, expect, vi } from 'vitest';
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
  readPinToTabAutomaticSessionStorageState: vi.fn(),
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
  readPinToTabAutomaticSessionStorageState:
    pinStorageMocks.readPinToTabAutomaticSessionStorageState,
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

export const senderBinding: ContentSenderBinding = {
  documentId: 'document-7',
  frameId: 0,
  senderUrl: 'https://example.test/path',
  tabId: 7,
};

export function createRuntimeState(overrides?: {
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

export async function routeWakeup(
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

export function firstInvocationOrder(invocationCallOrder: number[]): number {
  const [order] = invocationCallOrder;
  expect(order).toBeDefined();
  return order ?? 0;
}

export function createDeferred<T>() {
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
  pinStorageMocks.readPinToTabAutomaticSessionStorageState.mockResolvedValue(false);
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);
  pinStorageMocks.readPinToTabToolbarVisibilitySessionStorageState.mockResolvedValue(true);
  pinStorageMocks.writePinToTabSessionStorageState.mockResolvedValue(undefined);
  screenshotModeMocks.enableScreenshotMode.mockResolvedValue(undefined);
  screenshotModeMocks.enableScreenshotModeGuarded.mockResolvedValue(true);
});

export { pageAccessMocks, readinessMocks, pinStorageMocks, screenshotModeMocks };
