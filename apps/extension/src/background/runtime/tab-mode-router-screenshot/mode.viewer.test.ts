import { beforeEach, expect, it, vi } from 'vitest';

import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

const mocks = vi.hoisted(() => ({
  attachDebugger: vi.fn(),
  browserTabsGet: vi.fn(),
  clearViewport: vi.fn(),
  detachDebugger: vi.fn(),
  isDebuggerAttached: vi.fn(),
  loadSettings: vi.fn(),
  resetZoom: vi.fn(),
  setViewport: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.browserTabsGet },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: vi.fn(),
}));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: mocks.loadSettings,
}));
vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger: mocks.attachDebugger,
}));
vi.mock('../../debugger/session/detach', () => ({
  detachDebugger: mocks.detachDebugger,
}));
vi.mock('../../debugger/session/status', () => ({
  isDebuggerAttached: mocks.isDebuggerAttached,
}));
vi.mock('../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/workspace')>()),
  clearViewport: mocks.clearViewport,
  resetZoom: mocks.resetZoom,
  setViewport: mocks.setViewport,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browserTabsGet.mockResolvedValue({
    id: 5,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });
  mocks.loadSettings.mockResolvedValue({
    defaultViewportId: 'wide',
    viewportPresets: [{ height: 900, id: 'wide', label: 'Wide', width: 1440 }],
  });
});

it('routes owned snapshot viewer enable and disable through the viewer port', async () => {
  const { disableScreenshotMode, enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();
  const registration = createAckingViewerPortRegistration();
  const ports = new Map([[5, registration]]);

  await enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState, ports);
  await disableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState, ports);

  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      command: { type: 'ENABLE_SCREENSHOT_MODE', viewport: null },
    })
  );
  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      command: { type: 'DISABLE_SCREENSHOT_MODE' },
    })
  );
  expect(mocks.attachDebugger).not.toHaveBeenCalled();
  expect(mocks.setViewport).not.toHaveBeenCalled();
  expect(mocks.clearViewport).not.toHaveBeenCalled();
  expect(mocks.detachDebugger).not.toHaveBeenCalled();
  expect(viewportState.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(screenshotModeState.has(5)).toBe(false);
});
