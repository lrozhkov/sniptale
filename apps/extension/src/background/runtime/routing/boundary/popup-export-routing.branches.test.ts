import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  isOwnedSnapshotViewerPageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
  assertPopupTabRouteTargetDocumentMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
  assertPopupTabRouteTargetDocumentMock: vi.fn(),
}));

vi.mock('../capabilities/popup-tab/route-capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capabilities/popup-tab/route-capabilities')>()),
  assertPopupTabRouteTargetDocument: assertPopupTabRouteTargetDocumentMock,
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

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: isOwnedSnapshotViewerPageMock,
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

function createPopupExportOptions(includeFullPageScreenshot: boolean) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot,
    includePageDiagnostics: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assertPopupTabRouteTargetDocumentMock.mockResolvedValue(undefined);
  browserTabsGetMock.mockResolvedValue({ active: true, id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  sendTabMessageMock.mockResolvedValue({ success: true });
  sendViewerPopupExportMessageMock.mockResolvedValue({ success: true });
});

it('routes owned viewer popup export messages through the viewer port', async () => {
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
      tabRouteRequestId: 'req-preview',
      type: MessageType.EXPORT_POPUP_PREVIEW,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPopupExportMessageMock).toHaveBeenCalledWith(expect.any(Map), 62, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('omits full-page grants from content popup export package builds without screenshots', async () => {
  const sendResponse = vi.fn();

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      batchRequestId: 'req-build',
      options: createPopupExportOptions(false),
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-build',
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendTabMessageMock).toHaveBeenCalledWith(
    62,
    expect.not.objectContaining({ contentIntentGrant: expect.anything() })
  );
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('routes content popup export cancellation with its export identity', async () => {
  const sendResponse = vi.fn();

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      exportRunId: 'export-run-cancel',
      tabId: 62,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'req-cancel',
      type: MessageType.EXPORT_POPUP_CANCEL,
    },
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendTabMessageMock).toHaveBeenCalledWith(62, {
    exportRunId: 'export-run-cancel',
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});
