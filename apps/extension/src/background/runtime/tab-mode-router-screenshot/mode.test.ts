import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const {
  attachDebuggerMock,
  browserTabsGetMock,
  clearViewportMock,
  detachDebuggerMock,
  isDebuggerAttachedMock,
  loadSettingsMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerLogMock,
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
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerLogMock: vi.fn(),
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
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: loggerLogMock,
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../debugger/session/attach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session/attach')>()),
  attachDebugger: attachDebuggerMock,
}));

vi.mock('../../debugger/session/detach', () => ({
  detachDebugger: detachDebuggerMock,
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

function resetScreenshotModeMocks() {
  attachDebuggerMock.mockReset();
  browserTabsGetMock.mockReset();
  detachDebuggerMock.mockReset();
  clearViewportMock.mockReset();
  isDebuggerAttachedMock.mockReset();
  loadSettingsMock.mockReset();
  loggerDebugMock.mockReset();
  loggerErrorMock.mockReset();
  loggerWarnMock.mockReset();
  loggerLogMock.mockReset();
  resetZoomMock.mockReset();
  sendTabMessageMock.mockReset();
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  setViewportMock.mockReset();
  isDebuggerAttachedMock.mockResolvedValue(false);
  clearViewportMock.mockResolvedValue(undefined);
}

async function verifyEnableScreenshotModeWithDefaultPreset() {
  const { enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  loadSettingsMock.mockResolvedValue({
    defaultViewportId: 'wide',
    viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
  });
  sendTabMessageMock.mockResolvedValue(undefined);

  await enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState);

  expect(isDebuggerAttachedMock).toHaveBeenCalledWith(5);
  expect(attachDebuggerMock).toHaveBeenCalledWith(
    5,
    'screenshot',
    expect.objectContaining({ token: expect.any(String) })
  );
  expect(setViewportMock).toHaveBeenCalledWith(5, 1440, 900);
  expect(resetZoomMock).toHaveBeenCalledWith(5);
  expect(viewportState.get(5)).toEqual({ width: 1440, height: 900 });
  expect(viewportOwnerState.get(5)).toBe('debugger');
  expect(screenshotModeState.get(5)).toBe(true);
  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: 'ENABLE_SCREENSHOT_MODE',
    viewport: { width: 1440, height: 900 },
  });
}

async function verifyEnableScreenshotModeWithNativeViewport() {
  const { enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  loadSettingsMock.mockResolvedValue({
    defaultViewportId: 'native',
    viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
  });
  sendTabMessageMock.mockResolvedValue(undefined);

  await enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState);

  expect(attachDebuggerMock).not.toHaveBeenCalled();
  expect(setViewportMock).not.toHaveBeenCalled();
  expect(resetZoomMock).not.toHaveBeenCalled();
  expect(viewportState.get(5)).toBeNull();
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: 'ENABLE_SCREENSHOT_MODE',
    viewport: null,
  });
  expect(screenshotModeState.get(5)).toBe(true);
}

async function verifyEnableScreenshotModeRollsBackViewportWhenContentNotificationFails() {
  const { enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  loadSettingsMock.mockResolvedValue({
    defaultViewportId: 'wide',
    viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
  });
  sendTabMessageMock.mockRejectedValueOnce(new Error('content unavailable'));
  isDebuggerAttachedMock.mockResolvedValue(false);

  await expect(
    enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState)
  ).rejects.toThrow('content unavailable');

  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(viewportState.get(5)).toBeNull();
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(screenshotModeState.has(5)).toBe(false);
}

async function verifyEnableScreenshotModeRejectsRestrictedPages() {
  const { enableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>();
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'chrome://extensions' });
  loadSettingsMock.mockResolvedValue({
    defaultViewportId: 'wide',
    viewportPresets: [{ id: 'wide', label: 'Wide', width: 1440, height: 900 }],
  });

  await expect(
    enableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState)
  ).rejects.toThrow();

  expect(attachDebuggerMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(screenshotModeState.has(5)).toBe(false);
}

async function verifyDisableScreenshotMode() {
  const { disableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  sendTabMessageMock.mockResolvedValue(undefined);
  detachDebuggerMock.mockResolvedValue(undefined);

  await disableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState);

  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: 'DISABLE_SCREENSHOT_MODE',
  });
  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(clearViewportMock.mock.invocationCallOrder[0]!).toBeLessThan(
    detachDebuggerMock.mock.invocationCallOrder[0]!
  );
  expect(screenshotModeState.has(5)).toBe(false);
  expect(viewportState.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
}

async function verifyDisableScreenshotModeStillDetachesWhenViewportClearFails() {
  const { disableScreenshotMode } = await import('./mode');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  sendTabMessageMock.mockResolvedValue(undefined);
  clearViewportMock.mockRejectedValueOnce(new Error('clear failed'));
  detachDebuggerMock.mockResolvedValue(undefined);

  await disableScreenshotMode(5, screenshotModeState, viewportState, viewportOwnerState);

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to clear viewport before disabling screenshot mode',
    expect.any(Error)
  );
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(screenshotModeState.has(5)).toBe(false);
}

describe('tab-mode-router-screenshot', () => {
  beforeEach(resetScreenshotModeMocks);

  it(
    'enables screenshot mode with the resolved default preset',
    verifyEnableScreenshotModeWithDefaultPreset
  );
  it(
    'rolls back debugger viewport changes when enabling screenshot mode cannot notify content',
    verifyEnableScreenshotModeRollsBackViewportWhenContentNotificationFails
  );
  it(
    'enables screenshot mode without debugger setup for native defaults',
    verifyEnableScreenshotModeWithNativeViewport
  );
  it(
    'rejects screenshot mode on restricted browser pages',
    verifyEnableScreenshotModeRejectsRestrictedPages
  );
  it('disables screenshot mode and removes active state', verifyDisableScreenshotMode);
  it(
    'detaches on screenshot-mode disable even when viewport clear fails',
    verifyDisableScreenshotModeStillDetachesWhenViewportClearFails
  );
});
