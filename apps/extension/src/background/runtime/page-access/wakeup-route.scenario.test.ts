import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';

const pinStorageMocks = vi.hoisted(() => ({
  readPinToTabSessionStorageState: vi.fn(),
  readPinToTabToolbarVisibilitySessionStorageState: vi.fn(async () => true),
  writePinToTabSessionStorageState: vi.fn(),
}));
const screenshotModeMocks = vi.hoisted(() => ({
  enableScreenshotMode: vi.fn(),
  enableScreenshotModeGuarded: vi.fn(),
}));
vi.mock('../../../composition/persistence/content-pin-session/index', () => pinStorageMocks);
vi.mock('../tab-mode-router-screenshot', () => screenshotModeMocks);
vi.mock('../../page-access/service', () => ({
  ensureActivePageAccessRuntime: vi.fn(),
  hasActivePageAccess: vi.fn(async () => true),
  hasPinnedToolbarAllSitesAccess: vi.fn(async () => true),
  registerPinnedToolbarAllSitesAccess: vi.fn(),
}));
vi.mock('../../page-access/readiness', () => ({
  waitForContentToolbarReady: vi.fn(async () => ({ screenshotMode: true, visible: false })),
}));
import { routeContentRuntimeWakeupMessage } from './wakeup-route';

const senderBinding = {
  documentId: 'scenario-document',
  frameId: 0,
  senderUrl: 'https://example.test/',
  tabId: 7,
};

function createRuntimeState(overrides: {
  scenarioEnabled: boolean;
  scenarioSurface?: { captureAction: 'scenario'; screenshotMode: boolean };
}): BackgroundRuntimeMessageDeps {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    captureMode: 'manual',
    enabled: overrides.scenarioEnabled,
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
  });
  vi.mocked(scenarioSessionService.getSurface).mockResolvedValue({
    captureAction: overrides.scenarioSurface?.captureAction ?? 'scenario',
    screenshotMode: overrides.scenarioSurface?.screenshotMode ?? true,
    toolbarVisible: false,
  });
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

function routeWakeup(
  runtimeState: BackgroundRuntimeMessageDeps,
  message: unknown = { type: MessageType.CONTENT_RUNTIME_WAKEUP }
) {
  return new Promise((resolve) => {
    routeContentRuntimeWakeupMessage({
      runtimeState,
      message,
      senderBinding,
      sendResponse: resolve,
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(false);
});

it('reads scenario visibility after an earlier queued write when focus wakes the runtime', async () => {
  const runtimeState = createRuntimeState({ scenarioEnabled: true });
  let toolbarVisible = true;
  let releaseWrite!: () => void;
  let markStarted!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const writeReleased = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  vi.mocked(runtimeState.scenarioSessionService.getSurface).mockImplementation(async () => ({
    captureAction: 'scenario',
    screenshotMode: true,
    toolbarVisible,
  }));
  vi.mocked(runtimeState.scenarioSessionService.updateSurfaceState).mockImplementation(
    async (_tabId, patch) => {
      markStarted();
      await writeReleased;
      toolbarVisible = patch.toolbarVisible ?? toolbarVisible;
      return { captureAction: 'scenario', screenshotMode: true, toolbarVisible };
    }
  );
  const write = routeWakeup(runtimeState, {
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
    toolbarVisible: false,
  });
  await writeStarted;
  const refresh = routeWakeup(runtimeState);
  await Promise.resolve();
  releaseWrite();
  await write;
  await expect(refresh).resolves.toMatchObject({ restored: true, toolbarVisible: false });
  expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledWith(
    7,
    runtimeState.screenshotModeState,
    runtimeState.viewportState,
    runtimeState.viewportOwnerState,
    runtimeState.webSnapshotViewerPorts,
    { toolbarVisible: false }
  );
});

it.each([false, true])(
  'persists scenario toolbar visibility %s through its surface owner',
  async (toolbarVisible) => {
    const runtimeState = createRuntimeState({
      scenarioEnabled: true,
      scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
    });
    pinStorageMocks.readPinToTabSessionStorageState.mockResolvedValue(true);
    await expect(
      routeWakeup(runtimeState, {
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
        toolbarVisible,
      })
    ).resolves.toMatchObject({ success: true, restored: false });
    expect(runtimeState.scenarioSessionService.updateSurfaceState).toHaveBeenCalledWith(7, {
      toolbarVisible,
    });
    expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
    expect(screenshotModeMocks.enableScreenshotMode).not.toHaveBeenCalled();
  }
);

it('reports failed scenario visibility persistence without writing a second authority', async () => {
  const runtimeState = createRuntimeState({ scenarioEnabled: true });
  vi.mocked(runtimeState.scenarioSessionService.updateSurfaceState).mockRejectedValue(
    new Error('storage unavailable')
  );
  const response = new Promise((resolve) => {
    routeContentRuntimeWakeupMessage({
      runtimeState,
      senderBinding,
      message: { type: MessageType.CONTENT_RUNTIME_WAKEUP, toolbarVisible: false },
      sendResponse: resolve,
    });
  });
  await expect(response).resolves.toMatchObject({ success: false });
  expect(pinStorageMocks.writePinToTabSessionStorageState).not.toHaveBeenCalled();
});

it('restores an active collapsed scenario without forcing its toolbar open', async () => {
  const runtimeState = createRuntimeState({
    scenarioEnabled: true,
    scenarioSurface: { captureAction: 'scenario', screenshotMode: true },
  });
  await expect(routeWakeup(runtimeState)).resolves.toMatchObject({
    restored: true,
    toolbarVisible: false,
  });
  expect(runtimeState.scenarioSessionService.updateSurfaceState).not.toHaveBeenCalled();
  expect(screenshotModeMocks.enableScreenshotMode).toHaveBeenCalledWith(
    7,
    runtimeState.screenshotModeState,
    runtimeState.viewportState,
    runtimeState.viewportOwnerState,
    runtimeState.webSnapshotViewerPorts,
    { toolbarVisible: false }
  );
});
