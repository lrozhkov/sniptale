import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeWebSnapshotCaptureRequestMock,
  browserScriptingExecuteScriptMock,
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  isOwnedSnapshotViewerPageMock,
  loadSettingsMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
  assertPopupTabRouteTargetDocumentMock,
} = vi.hoisted(() => ({
  authorizeWebSnapshotCaptureRequestMock: vi.fn(),
  browserScriptingExecuteScriptMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
  assertPopupTabRouteTargetDocumentMock: vi.fn(),
}));

vi.mock('../capabilities/popup-tab/route-capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capabilities/popup-tab/route-capabilities')>()),
  assertPopupTabRouteTargetDocument: assertPopupTabRouteTargetDocumentMock,
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: isOwnedSnapshotViewerPageMock,
}));

vi.mock('../../../capture/routing/web-snapshot/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/routing/web-snapshot/session')>()),
  authorizeWebSnapshotCaptureRequest: authorizeWebSnapshotCaptureRequestMock,
}));

vi.mock('../../../capture/page-preparation/viewer-ports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/page-preparation/viewer-ports')>()),
  sendViewerPopupExportMessage: sendViewerPopupExportMessageMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { routePopupExportMessage } from './popup-export-routing';

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  assertPopupTabRouteTargetDocumentMock.mockResolvedValue(undefined);
  sendViewerPopupExportMessageMock.mockResolvedValue({ success: true });
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  loadSettingsMock.mockResolvedValue({ webSnapshotEnabled: true });
});

it('routes viewer-owned popup export messages without content asset authorization', async () => {
  const ports = new Map();
  const sendResponse = vi.fn();
  isOwnedSnapshotViewerPageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({
    id: 62,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html',
  });

  routePopupExportMessage({
    deps: { ...createBackgroundRuntimeState(), webSnapshotViewerPorts: ports },
    message: {
      requestId: 'req-web',
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-web',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(loadSettingsMock).toHaveBeenCalledTimes(1);
  expect(authorizeWebSnapshotCaptureRequestMock).not.toHaveBeenCalled();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPopupExportMessageMock).toHaveBeenCalledWith(ports, 62, {
    requestId: 'req-web',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('denies viewer-owned web snapshot saves while the global feature is disabled', async () => {
  const sendResponse = vi.fn();
  isOwnedSnapshotViewerPageMock.mockReturnValue(true);
  loadSettingsMock.mockResolvedValue({ webSnapshotEnabled: false });
  browserTabsGetMock.mockResolvedValue({
    id: 62,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html',
  });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      requestId: 'req-disabled',
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-disabled',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: expect.stringContaining('Web Snapshots are disabled in settings.'),
    success: false,
  });
});

it('fails closed when viewer-owned web snapshot settings cannot be loaded', async () => {
  const sendResponse = vi.fn();
  isOwnedSnapshotViewerPageMock.mockReturnValue(true);
  loadSettingsMock.mockRejectedValue(new Error('storage unavailable'));
  browserTabsGetMock.mockResolvedValue({
    id: 62,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html',
  });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      requestId: 'req-load-error',
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-load-error',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: expect.stringContaining('storage unavailable'),
    success: false,
  });
});

it('routes non-save popup export messages directly to the viewer port', async () => {
  const sendResponse = vi.fn();
  isOwnedSnapshotViewerPageMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({
    id: 62,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-web',
      type: MessageType.EXPORT_POPUP_PREVIEW,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(browserTabsGetMock).toHaveBeenCalledWith(62);
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(browserScriptingExecuteScriptMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPopupExportMessageMock).toHaveBeenCalledWith(expect.any(Map), 62, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
});
