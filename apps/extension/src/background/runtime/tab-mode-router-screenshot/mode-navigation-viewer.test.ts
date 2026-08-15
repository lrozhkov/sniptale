import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarnMock, sendTabMessageMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
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

import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';
import { cleanupScreenshotModeAfterNavigation } from './navigation-cleanup';

function resetViewerNavigationCleanupMocks() {
  loggerWarnMock.mockReset();
  sendTabMessageMock.mockReset();
}

async function verifyViewerViewportCleanup() {
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'capture-surface' | 'viewer'>([[5, 'viewer']]);
  const viewportState = new Map<
    number,
    { presetId: string; target: 'window'; width: number; height: number } | null
  >([[5, { presetId: 'test:window', target: 'window' as const, width: 390, height: 844 }]]);
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
}

async function verifyViewerViewportCleanupAfterPortDisappears() {
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'capture-surface' | 'viewer'>([[5, 'viewer']]);
  const viewportState = new Map<
    number,
    { presetId: string; target: 'window'; width: number; height: number } | null
  >([[5, { presetId: 'test:window', target: 'window' as const, width: 390, height: 844 }]]);
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
    'Failed to disable preparation after navigation',
    expect.any(Error)
  );
}

describe('tab-mode-router-screenshot viewer navigation cleanup', () => {
  beforeEach(resetViewerNavigationCleanupMocks);

  it('cleans viewer-owned viewport state', verifyViewerViewportCleanup);
  it(
    'cleans viewer-owned viewport after its port disappears',
    verifyViewerViewportCleanupAfterPortDisappears
  );
});
