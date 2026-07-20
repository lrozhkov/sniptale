import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const {
  attachDebuggerMock,
  browserTabsGetMock,
  clearViewportMock,
  detachDebuggerMock,
  isDebuggerAttachedMock,
  loadSettingsMock,
  loggerWarnMock,
  resetZoomMock,
  sendTabMessageMock,
  setViewportMock,
} = vi.hoisted(() => ({
  attachDebuggerMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  clearViewportMock: vi.fn(),
  detachDebuggerMock: vi.fn(),
  isDebuggerAttachedMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resetZoomMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  setViewportMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: loadSettingsMock,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
}));

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger: attachDebuggerMock,
}));

vi.mock('../../debugger/session/status', () => ({
  isDebuggerAttached: isDebuggerAttachedMock,
}));

vi.mock('../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/workspace')>()),
  clearViewport: clearViewportMock,
  resetZoom: resetZoomMock,
  setViewport: setViewportMock,
}));

import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

function resetNavigationCleanupMocks() {
  attachDebuggerMock.mockReset();
  browserTabsGetMock.mockReset();
  clearViewportMock.mockReset();
  detachDebuggerMock.mockReset();
  isDebuggerAttachedMock.mockReset();
  loadSettingsMock.mockReset();
  loggerWarnMock.mockReset();
  resetZoomMock.mockReset();
  sendTabMessageMock.mockReset();
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  setViewportMock.mockReset();
  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  clearViewportMock.mockResolvedValue(undefined);
  detachDebuggerMock.mockResolvedValue(undefined);
  isDebuggerAttachedMock.mockResolvedValue(false);
  loadSettingsMock.mockResolvedValue({
    defaultViewportId: 'wide',
    viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
  });
  resetZoomMock.mockResolvedValue(undefined);
  sendTabMessageMock.mockResolvedValue(undefined);
  setViewportMock.mockResolvedValue(undefined);
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function waitForQueuedOperation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function verifyNavigationCleanupClearsPresetSideEffects() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  await cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState
  );

  expect(screenshotModeState.has(5)).toBe(false);
  expect(viewportState.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(sendTabMessageMock).toHaveBeenCalledWith(5, { type: 'DISABLE_SCREENSHOT_MODE' });
  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
}

async function verifyNavigationCleanupKeepsCompensatingAfterNotifyFailure() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  sendTabMessageMock.mockRejectedValueOnce(new Error('navigation detached content'));

  await cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState
  );

  expect(screenshotModeState.has(5)).toBe(false);
  expect(viewportState.has(5)).toBe(false);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to notify screenshot mode cleanup after navigation',
    expect.any(Error)
  );
  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
}

async function verifyNavigationCleanupClearsViewerPort() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>([[5, null]]);
  const webSnapshotViewerPorts = new Map([[5, createAckingViewerPortRegistration()]]);

  await cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState,
    webSnapshotViewerPorts
  );

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(webSnapshotViewerPorts.has(5)).toBe(false);
  expect(screenshotModeState.has(5)).toBe(false);
  expect(viewportState.has(5)).toBe(false);
}

async function verifyNavigationCleanupClearsInactiveViewerPort() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const webSnapshotViewerPorts = new Map([[5, createAckingViewerPortRegistration()]]);

  await cleanupScreenshotModeAfterNavigation(
    5,
    new Map(),
    new Map(),
    new Map(),
    webSnapshotViewerPorts
  );

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(webSnapshotViewerPorts.has(5)).toBe(false);
}

async function verifyNewPresetEnableWaitsForNavigationCleanup() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const { enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1280, height: 720 }],
  ]);
  const viewportClear = createDeferred<void>();

  clearViewportMock.mockReturnValueOnce(viewportClear.promise);

  const cleanupPromise = cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState
  );
  await waitForQueuedOperation();
  expect(clearViewportMock).toHaveBeenCalledWith(5);

  const enablePromise = enableScreenshotMode(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState
  );
  await waitForQueuedOperation();

  expect(browserTabsGetMock).not.toHaveBeenCalled();

  viewportClear.resolve(undefined);
  await cleanupPromise;
  await enablePromise;

  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(detachDebuggerMock.mock.invocationCallOrder[0]!).toBeLessThan(
    browserTabsGetMock.mock.invocationCallOrder[0]!
  );
  expect(setViewportMock).toHaveBeenCalledWith(5, 1440, 900);
  expect(clearViewportMock.mock.invocationCallOrder[0]!).toBeLessThan(
    setViewportMock.mock.invocationCallOrder[0]!
  );
  expect(screenshotModeState.get(5)).toBe(true);
  expect(viewportState.get(5)).toEqual({ width: 1440, height: 900 });
  expect(viewportOwnerState.get(5)).toBe('debugger');
}

describe('tab-mode-router-screenshot navigation cleanup', () => {
  beforeEach(resetNavigationCleanupMocks);

  it(
    'cleans preset screenshot mode side effects after top-level navigation',
    verifyNavigationCleanupClearsPresetSideEffects
  );
  it(
    'keeps cleaning viewport side effects when navigation notify fails',
    verifyNavigationCleanupKeepsCompensatingAfterNotifyFailure
  );
  it('clears owned viewer ports after navigation cleanup', verifyNavigationCleanupClearsViewerPort);
  it(
    'clears inactive owned viewer ports after navigation cleanup',
    verifyNavigationCleanupClearsInactiveViewerPort
  );
  it(
    'queues a newer preset enable behind delayed navigation cleanup',
    verifyNewPresetEnableWaitsForNavigationCleanup
  );
});
