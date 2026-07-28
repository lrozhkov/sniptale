import { beforeEach, vi } from 'vitest';

const {
  browserDebugger,
  browserTabs,
  cleanupCapture,
  cleanupOldRecordings,
  cleanupExpiredProjectExportInputs,
  cleanupScreenshotModeAfterNavigation,
  cleanupScreenshotModeAfterTabClose,
  clearDebuggerSessionState,
  ensurePersistentStorage,
  ensureActiveVideoRecordingLeaseHydrated,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleExportHarNavigationStart,
  handleTabClose,
  handleTabNavigation,
  handleRegionSelectionNavigationStart,
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  initializeAiStorageAccess,
  initializeBackgroundContextMenus,
  nativeAppConnect,
  parseInstalledDetails,
  parseTopLevelDocumentNavigation,
  parseTopLevelNavigation,
  rebuildBackgroundContextMenus,
  recoverInterruptedSessions,
  recoverVideoCaptureSurfaceOnStartup,
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
  registerWebSnapshotViewerPorts,
  resetVideoRecordingRuntimeState,
  reconcileVideoRecordingLeaseOnStartup,
} = vi.hoisted(() => ({
  browserDebugger: {
    subscribeToDetach: vi.fn(),
    subscribeToEvent: vi.fn(),
  },
  browserTabs: {
    subscribeToRemoved: vi.fn(),
    subscribeToUpdated: vi.fn(),
  },
  cleanupCapture: vi.fn(),
  cleanupOldRecordings: vi.fn(),
  cleanupExpiredProjectExportInputs: vi.fn(),
  cleanupScreenshotModeAfterNavigation: vi.fn(),
  cleanupScreenshotModeAfterTabClose: vi.fn(),
  clearDebuggerSessionState: vi.fn(),
  ensurePersistentStorage: vi.fn(),
  ensureActiveVideoRecordingLeaseHydrated: vi.fn(),
  handleDebuggerEvent: vi.fn(),
  handleDiagnosticsForcedDetach: vi.fn(),
  handleExportHarDebuggerEvent: vi.fn(),
  handleExportHarForcedDetach: vi.fn(),
  handleExportHarNavigationStart: vi.fn(),
  handleTabClose: vi.fn(),
  handleTabNavigation: vi.fn(),
  handleRegionSelectionNavigationStart: vi.fn(),
  handleTabRecordingDebuggerDetach: vi.fn(),
  handleTabRecordingNavigationCommitted: vi.fn(),
  handleTabRecordingNavigationCompleted: vi.fn(),
  handleTabRecordingNavigationError: vi.fn(),
  handleTabRecordingNavigationStart: vi.fn(),
  initializeAiStorageAccess: vi.fn(),
  initializeBackgroundContextMenus: vi.fn(),
  nativeAppConnect: vi.fn(),
  parseInstalledDetails: vi.fn(),
  parseTopLevelDocumentNavigation: vi.fn(),
  rebuildBackgroundContextMenus: vi.fn(),
  parseTopLevelNavigation: vi.fn(),
  recoverInterruptedSessions: vi.fn(),
  recoverVideoCaptureSurfaceOnStartup: vi.fn(),
  reconcileCaptureJobDownloadOnStartup: vi.fn(),
  reconcileCaptureJobsOnStartup: vi.fn(),
  registerWebSnapshotViewerPorts: vi.fn(),
  resetVideoRecordingRuntimeState: vi.fn(),
  reconcileVideoRecordingLeaseOnStartup: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({ browserDebugger }));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs }));
vi.mock(
  '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core')
    >()),
    ensurePersistentStorage,
  })
);
vi.mock(
  '../../../apps/extension/src/composition/persistence/recordings/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../apps/extension/src/composition/persistence/recordings/index')
    >()),
    cleanupOldRecordings,
  })
);
vi.mock('../../../apps/extension/src/composition/persistence/ai-settings/init', () => ({
  initializeAiStorageAccess,
}));
vi.mock('../../../apps/extension/src/composition/persistence/project-export-inputs', () => ({
  cleanupExpiredProjectExportInputs,
}));
vi.mock('../../../apps/extension/src/background/diagnostics/lifecycle', () => ({
  getTabIdByTargetId: vi.fn((targetId: string) => (targetId === 'target-7' ? 7 : undefined)),
  clearDebuggerSessionState,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleTabNavigation,
  recoverInterruptedSessions,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleExportHarNavigationStart,
}));
vi.mock('../../../apps/extension/src/background/capture/lifecycle', () => ({
  cleanupCapture,
  createWebSnapshotViewerPorts: () => new Map(),
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
  registerWebSnapshotViewerPorts,
}));
vi.mock('../../../apps/extension/src/background/runtime/routing/runtime-wiring/parsers', () => ({
  parseInstalledDetails,
  parseTopLevelDocumentNavigation,
  parseTopLevelNavigation,
}));
vi.mock('../../../apps/extension/src/background/media/lifecycle', () => ({
  ensureActiveVideoRecordingLeaseHydrated,
  handleRegionSelectionNavigationStart,
  handleTabClose,
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  reconcileVideoRecordingLeaseOnStartup,
  recoverVideoCaptureSurfaceOnStartup,
  resetVideoRecordingRuntimeState,
}));
vi.mock('../../../apps/extension/src/background/runtime/context-menu/service', () => ({
  initializeBackgroundContextMenus,
  rebuildBackgroundContextMenus,
}));
vi.mock('../../../apps/extension/src/background/runtime/native-app/service-singleton', () => ({
  getNativeAppRuntimeService: () => ({ connect: nativeAppConnect }),
}));
vi.mock('../../../apps/extension/src/background/runtime/tab-mode-router-screenshot', () => ({
  cleanupScreenshotModeAfterNavigation,
  cleanupScreenshotModeAfterTabClose,
}));

import { createScenarioSessionServiceStub } from './scenario-session-service.stub';
import type { WebSnapshotViewerPorts } from '../../../apps/extension/src/background/capture/lifecycle';

export {
  cleanupCapture,
  cleanupOldRecordings,
  cleanupExpiredProjectExportInputs,
  cleanupScreenshotModeAfterNavigation,
  cleanupScreenshotModeAfterTabClose,
  clearDebuggerSessionState,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  handleExportHarNavigationStart,
  ensureActiveVideoRecordingLeaseHydrated,
  handleTabClose,
  handleTabNavigation,
  handleRegionSelectionNavigationStart,
  handleTabRecordingDebuggerDetach,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  recoverVideoCaptureSurfaceOnStartup,
  initializeAiStorageAccess,
  initializeBackgroundContextMenus,
  nativeAppConnect,
  parseInstalledDetails,
  parseTopLevelDocumentNavigation,
  parseTopLevelNavigation,
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
  recoverInterruptedSessions,
  registerWebSnapshotViewerPorts,
  rebuildBackgroundContextMenus,
  resetVideoRecordingRuntimeState,
  reconcileVideoRecordingLeaseOnStartup,
};

type RemovedListener = Parameters<typeof browserTabs.subscribeToRemoved>[0];
type UpdatedListener = Parameters<typeof browserTabs.subscribeToUpdated>[0];
type DebuggerEventListener = Parameters<typeof browserDebugger.subscribeToEvent>[0];
type DebuggerDetachListener = Parameters<typeof browserDebugger.subscribeToDetach>[0];

export const removedListenerRef: { current: RemovedListener | null } = { current: null };
export const updatedListenerRef: { current: UpdatedListener | null } = { current: null };
export const debuggerEventListenerRef: { current: DebuggerEventListener | null } = {
  current: null,
};
export const debuggerDetachListenerRef: { current: DebuggerDetachListener | null } = {
  current: null,
};
export const navigationListenerRef: { current: ((details: unknown) => void) | null } = {
  current: null,
};
export const navigationCommittedListenerRef: { current: ((details: unknown) => void) | null } = {
  current: null,
};
export const navigationCompletedListenerRef: { current: ((details: unknown) => void) | null } = {
  current: null,
};
export const navigationErrorListenerRef: { current: ((details: unknown) => void) | null } = {
  current: null,
};
export const installedListenerRef: { current: ((details: unknown) => void) | null } = {
  current: null,
};

export function createModeState() {
  const webSnapshotViewerPorts: WebSnapshotViewerPorts = new Map();

  return {
    captureGuardState: { isCapturing: false },
    screenshotModeState: new Map<number, boolean>([[7, true]]),
    highlighterModeState: new Map<number, boolean>([[7, true]]),
    quickEditModeState: new Map<number, boolean>([[7, true]]),
    viewportOwnerState: new Map([[7, 'capture-surface' as const]]),
    viewportState: new Map<
      number,
      {
        presetId: string;
        target: 'viewport' | 'window';
        width: number;
        height: number;
      } | null
    >([[7, { presetId: 'test:viewport', target: 'viewport', width: 1280, height: 720 }]]),
    webSnapshotViewerPorts,
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve().then(() => Promise.resolve());
}

function resetListenerRefs() {
  removedListenerRef.current = null;
  updatedListenerRef.current = null;
  debuggerEventListenerRef.current = null;
  debuggerDetachListenerRef.current = null;
  navigationListenerRef.current = null;
  navigationCommittedListenerRef.current = null;
  navigationCompletedListenerRef.current = null;
  navigationErrorListenerRef.current = null;
  installedListenerRef.current = null;
}

function resetMockDefaults() {
  ensurePersistentStorage.mockResolvedValue(undefined);
  ensureActiveVideoRecordingLeaseHydrated.mockResolvedValue(null);
  cleanupOldRecordings.mockResolvedValue(undefined);
  cleanupExpiredProjectExportInputs.mockResolvedValue(undefined);
  cleanupScreenshotModeAfterNavigation.mockResolvedValue(undefined);
  cleanupScreenshotModeAfterTabClose.mockResolvedValue(undefined);
  handleExportHarNavigationStart.mockResolvedValue(undefined);
  initializeBackgroundContextMenus.mockReturnValue(undefined);
  nativeAppConnect.mockReturnValue(undefined);
  rebuildBackgroundContextMenus.mockResolvedValue(undefined);
  recoverInterruptedSessions.mockResolvedValue(undefined);
  recoverVideoCaptureSurfaceOnStartup.mockResolvedValue(undefined);
  reconcileCaptureJobsOnStartup.mockResolvedValue({
    activeFailed: 0,
    downloadsReconciled: 0,
    staleRemoved: 0,
  });
  initializeAiStorageAccess.mockResolvedValue(undefined);
  parseInstalledDetails.mockReturnValue(null);
  parseTopLevelDocumentNavigation.mockReturnValue(null);
  parseTopLevelNavigation.mockReturnValue(null);
}

function installBrowserListenerMocks() {
  browserTabs.subscribeToRemoved.mockImplementation((listener: RemovedListener) => {
    removedListenerRef.current = listener;
  });
  browserTabs.subscribeToUpdated.mockImplementation((listener: UpdatedListener) => {
    updatedListenerRef.current = listener;
  });
  browserDebugger.subscribeToEvent.mockImplementation((listener: DebuggerEventListener) => {
    debuggerEventListenerRef.current = listener;
  });
  browserDebugger.subscribeToDetach.mockImplementation((listener: DebuggerDetachListener) => {
    debuggerDetachListenerRef.current = listener;
  });

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        onInstalled: {
          addListener: vi.fn((listener: (details: unknown) => void) => {
            installedListenerRef.current = listener;
          }),
        },
      },
      webNavigation: {
        onBeforeNavigate: {
          addListener: vi.fn((listener: (details: unknown) => void) => {
            navigationListenerRef.current = listener;
          }),
        },
        onCommitted: {
          addListener: vi.fn((listener: (details: unknown) => void) => {
            navigationCommittedListenerRef.current = listener;
          }),
        },
        onCompleted: {
          addListener: vi.fn((listener: (details: unknown) => void) => {
            navigationCompletedListenerRef.current = listener;
          }),
        },
        onErrorOccurred: {
          addListener: vi.fn((listener: (details: unknown) => void) => {
            navigationErrorListenerRef.current = listener;
          }),
        },
      },
    },
  });
}

function reset() {
  vi.clearAllMocks();
  resetListenerRefs();
  resetMockDefaults();
  installBrowserListenerMocks();
}

beforeEach(reset);

export const initializeBackgroundRuntimeWiringMocks = {
  ensurePersistentStorage,
  installedListenerRef,
  reset,
};
