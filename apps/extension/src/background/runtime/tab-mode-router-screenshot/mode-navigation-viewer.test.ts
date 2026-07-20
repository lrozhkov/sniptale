import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearViewportMock, detachDebuggerMock, loggerWarnMock, sendTabMessageMock } = vi.hoisted(
  () => ({
    clearViewportMock: vi.fn(),
    detachDebuggerMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    sendTabMessageMock: vi.fn(),
  })
);

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

vi.mock('../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/workspace')>()),
  clearViewport: clearViewportMock,
}));

import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

function resetViewerNavigationCleanupMocks() {
  clearViewportMock.mockReset();
  detachDebuggerMock.mockReset();
  loggerWarnMock.mockReset();
  sendTabMessageMock.mockReset();
}

async function verifyViewerViewportCleanupSkipsDebugger() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'viewer']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 390, height: 844 }],
  ]);
  const webSnapshotViewerPorts = new Map([[5, createAckingViewerPortRegistration()]]);

  await cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState,
    webSnapshotViewerPorts
  );

  expect(webSnapshotViewerPorts.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(clearViewportMock).not.toHaveBeenCalled();
  expect(detachDebuggerMock).not.toHaveBeenCalled();
}

async function verifyViewerViewportCleanupSkipsDebuggerAfterPortDisappears() {
  const { cleanupScreenshotModeAfterNavigation } = await import('./navigation-cleanup');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'viewer']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 390, height: 844 }],
  ]);
  const webSnapshotViewerPorts = new Map([[5, createAckingViewerPortRegistration()]]);
  const cleanupPromise = cleanupScreenshotModeAfterNavigation(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState,
    webSnapshotViewerPorts
  );

  webSnapshotViewerPorts.clear();
  await cleanupPromise;

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to notify screenshot mode cleanup after navigation',
    expect.any(Error)
  );
  expect(clearViewportMock).not.toHaveBeenCalled();
  expect(detachDebuggerMock).not.toHaveBeenCalled();
}

describe('tab-mode-router-screenshot viewer navigation cleanup', () => {
  beforeEach(resetViewerNavigationCleanupMocks);

  it(
    'skips debugger cleanup for viewer-owned viewport state',
    verifyViewerViewportCleanupSkipsDebugger
  );
  it(
    'skips debugger cleanup for viewer-owned viewport after port disappears',
    verifyViewerViewportCleanupSkipsDebuggerAfterPortDisappears
  );
});
