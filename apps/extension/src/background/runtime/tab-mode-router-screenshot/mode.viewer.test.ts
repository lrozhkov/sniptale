import { beforeEach, expect, it, vi } from 'vitest';
import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

const mocks = vi.hoisted(() => ({ browserTabsGet: vi.fn(), loadSettings: vi.fn() }));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.browserTabsGet },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));

import { resetScreenshotSurfaceSessionsForTests } from '../../capture-surface/screenshot-session';
import { disableScreenshotMode, enableScreenshotMode } from './mode';

beforeEach(() => {
  vi.clearAllMocks();
  resetScreenshotSurfaceSessionsForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'viewer-session') });
  mocks.browserTabsGet.mockResolvedValue({
    id: 5,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });
  mocks.loadSettings.mockResolvedValue({
    defaultViewportPresetId: 'wide',
    viewportPresets: [
      {
        kind: 'user',
        id: 'wide',
        name: 'Wide',
        target: 'viewport',
        width: 1440,
        height: 900,
        enabled: true,
        order: 0,
      },
    ],
  });
});

it('routes an exact viewport preset through the viewer-local preparation surface', async () => {
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'capture-surface' | 'viewer'>();
  const viewportState = new Map<
    number,
    { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
  >();
  const registration = createAckingViewerPortRegistration();
  const ports = new Map([[5, registration]]);

  await enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState, ports);
  expect(viewportOwnerState.get(5)).toBe('viewer');
  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      command: {
        type: 'ENABLE_SCREENSHOT_MODE',
        surfaceCapabilityToken: expect.any(String),
        viewport: {
          presetId: 'wide',
          target: 'viewport',
          width: 1440,
          height: 900,
        },
      },
    })
  );

  await disableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState, ports);
  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ command: { type: 'DISABLE_SCREENSHOT_MODE' } })
  );
  expect(viewportState.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(screenshotModeState.has(5)).toBe(false);
});

it('keeps browser-window defaults disabled in the snapshot viewer', async () => {
  mocks.loadSettings.mockResolvedValue({
    defaultViewportPresetId: 'window-wide',
    viewportPresets: [
      {
        kind: 'user',
        id: 'window-wide',
        name: 'Wide window',
        target: 'window',
        width: 1440,
        height: 900,
        enabled: true,
        order: 0,
      },
    ],
  });
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'capture-surface' | 'viewer'>();
  const viewportState = new Map();
  const registration = createAckingViewerPortRegistration();

  await enableScreenshotMode(
    5,
    screenshotModeState,
    viewportState,
    viewportOwnerState,
    new Map([[5, registration]])
  );

  expect(registration.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        surfaceWarning: expect.any(String),
        viewport: null,
      }),
    })
  );
  expect(viewportState.get(5)).toBeNull();
  expect(viewportOwnerState.has(5)).toBe(false);
});
