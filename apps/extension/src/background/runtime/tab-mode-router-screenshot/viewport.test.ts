import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  attachDebuggerMock,
  browserTabsGetMock,
  clearViewportMock,
  detachDebuggerMock,
  isDebuggerAttachedMock,
  loggerDebugMock,
  loggerErrorMock,
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
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resetZoomMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  setViewportMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
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

import { handleSetViewport } from './viewport';
import { createAckingViewerPortRegistration } from '../../capture/page-preparation/viewer-ports.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com/page' });
});

async function verifySwitchToNativeViewportWithoutDebuggerDetach() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  isDebuggerAttachedMock.mockResolvedValue(false);
  sendTabMessageMock.mockResolvedValue(undefined);

  await handleSetViewport(5, null, null, viewportState, viewportOwnerState);

  expect(viewportState.get(5)).toBeNull();
  expect(viewportOwnerState.has(5)).toBe(false);
  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: 'VIEWPORT_CHANGED',
    viewport: null,
  });
  expect(clearViewportMock).not.toHaveBeenCalled();
  expect(detachDebuggerMock).not.toHaveBeenCalled();
}

async function verifyNativeViewportCleanupWarnings() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);

  isDebuggerAttachedMock.mockResolvedValue(true);
  sendTabMessageMock.mockResolvedValue(undefined);
  clearViewportMock.mockRejectedValueOnce(new Error('clear failed'));
  detachDebuggerMock.mockRejectedValueOnce(new Error('detach failed'));

  await handleSetViewport(5, null, null, viewportState, viewportOwnerState);

  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to clear viewport before returning to native mode',
    expect.any(Error)
  );
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to detach debugger after switching to native viewport',
    expect.any(Error)
  );
}

async function verifyApplyCustomViewport() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  isDebuggerAttachedMock.mockResolvedValue(false);
  sendTabMessageMock.mockResolvedValue(undefined);

  await handleSetViewport(5, 1280, 720, viewportState, viewportOwnerState);

  expect(attachDebuggerMock).toHaveBeenCalledWith(
    5,
    'screenshot',
    expect.objectContaining({ token: expect.any(String) })
  );
  expect(setViewportMock).toHaveBeenCalledWith(5, 1280, 720);
  expect(resetZoomMock).toHaveBeenCalledWith(5);
  expect(viewportState.get(5)).toEqual({ width: 1280, height: 720 });
  expect(viewportOwnerState.get(5)).toBe('debugger');
  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: 'VIEWPORT_CHANGED',
    viewport: { width: 1280, height: 720 },
  });
}

async function verifyViewportChangeRollbackOnNotificationFailure() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'debugger']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1024, height: 768 }],
  ]);

  isDebuggerAttachedMock.mockResolvedValue(true);
  sendTabMessageMock.mockRejectedValueOnce(new Error('content unavailable'));

  await expect(handleSetViewport(5, 1280, 720, viewportState, viewportOwnerState)).rejects.toThrow(
    'content unavailable'
  );

  expect(setViewportMock).toHaveBeenNthCalledWith(1, 5, 1280, 720);
  expect(setViewportMock).toHaveBeenNthCalledWith(2, 5, 1024, 768);
  expect(resetZoomMock).toHaveBeenCalledTimes(2);
  expect(viewportState.get(5)).toEqual({ width: 1024, height: 768 });
  expect(viewportOwnerState.get(5)).toBe('debugger');
}

async function verifyViewportRollbackToNativeWhenNoPreviousViewportExists() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  isDebuggerAttachedMock.mockResolvedValue(false);
  sendTabMessageMock.mockRejectedValueOnce(new Error('content unavailable'));

  await expect(handleSetViewport(5, 1280, 720, viewportState, viewportOwnerState)).rejects.toThrow(
    'content unavailable'
  );

  expect(clearViewportMock).toHaveBeenCalledWith(5);
  expect(detachDebuggerMock).toHaveBeenCalledWith(5, 'screenshot');
  expect(viewportState.get(5)).toBeNull();
  expect(viewportOwnerState.has(5)).toBe(false);
}

async function verifyOwnedViewerViewportRoutesThroughPort() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();
  const registration = createAckingViewerPortRegistration();
  const ports = new Map([[5, registration]]);

  browserTabsGetMock.mockResolvedValueOnce({
    id: 5,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });

  await handleSetViewport(5, 390, 844, viewportState, viewportOwnerState, ports);

  expect(registration.port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      command: { type: 'SET_VIEWPORT', viewport: { width: 390, height: 844 } },
    })
  );
  expect(viewportState.get(5)).toEqual({ width: 390, height: 844 });
  expect(viewportOwnerState.get(5)).toBe('viewer');
  expect(attachDebuggerMock).not.toHaveBeenCalled();
  expect(setViewportMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
}

async function verifyOwnedViewerViewportRollbackOnMissingPort() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>([[5, 'viewer']]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1024, height: 768 }],
  ]);

  browserTabsGetMock.mockResolvedValueOnce({
    id: 5,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });

  await expect(
    handleSetViewport(5, 390, 844, viewportState, viewportOwnerState, new Map())
  ).rejects.toThrow('Web snapshot viewer is not ready');

  expect(viewportState.get(5)).toEqual({ width: 1024, height: 768 });
  expect(viewportOwnerState.get(5)).toBe('viewer');
  expect(attachDebuggerMock).not.toHaveBeenCalled();
  expect(setViewportMock).not.toHaveBeenCalled();
}

async function verifyRestrictedViewportPageRejectsWithoutDebugger() {
  const viewportOwnerState = new Map<number, 'debugger' | 'viewer'>();
  const viewportState = new Map<number, { width: number; height: number } | null>();

  browserTabsGetMock.mockResolvedValueOnce({ id: 5, url: 'chrome://settings' });

  await expect(
    handleSetViewport(5, 390, 844, viewportState, viewportOwnerState, new Map())
  ).rejects.toThrow('Viewport emulation is unavailable');

  expect(attachDebuggerMock).not.toHaveBeenCalled();
  expect(setViewportMock).not.toHaveBeenCalled();
  expect(viewportState.has(5)).toBe(false);
  expect(viewportOwnerState.has(5)).toBe(false);
}

describe('tab-mode-router-screenshot viewport handling', () => {
  it(
    'switches to native viewport without detaching when no debugger is attached',
    verifySwitchToNativeViewportWithoutDebuggerDetach
  );
  it(
    'warns when native viewport cleanup cannot clear or detach the debugger',
    verifyNativeViewportCleanupWarnings
  );
  it('applies a custom viewport and notifies the content script', verifyApplyCustomViewport);
  it(
    'restores the previous viewport when post-apply notification fails',
    verifyViewportChangeRollbackOnNotificationFailure
  );
  it(
    'rolls back to the native viewport when no previous viewport exists',
    verifyViewportRollbackToNativeWhenNoPreviousViewportExists
  );
  it(
    'routes owned snapshot viewer viewport changes through the viewer port',
    verifyOwnedViewerViewportRoutesThroughPort
  );
  it(
    'restores cached viewer viewport when the viewer port is missing',
    verifyOwnedViewerViewportRollbackOnMissingPort
  );
  it(
    'keeps generic restricted pages out of debugger viewport emulation',
    verifyRestrictedViewportPageRejectsWithoutDebugger
  );
});
