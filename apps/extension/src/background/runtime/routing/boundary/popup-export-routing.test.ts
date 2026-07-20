import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeWebSnapshotCaptureRequestMock,
  browserScriptingExecuteScriptMock,
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  loadSettingsMock,
  isOwnedSnapshotViewerPageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
} = vi.hoisted(() => ({
  authorizeWebSnapshotCaptureRequestMock: vi.fn(),
  browserScriptingExecuteScriptMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
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

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
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
import type { PopupExportViewerMessage } from '../message-guards/guards/shared';

function createSaveMessage(): Extract<
  PopupExportViewerMessage,
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
> {
  return {
    requestId: 'req-web',
    tabId: 62,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'req-web',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  };
}

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
  });
  browserScriptingExecuteScriptMock.mockResolvedValue([
    { frameId: 0, result: { assetId: 'snapshot-1', success: true, warnings: [] } },
  ]);
  sendTabMessageMock.mockResolvedValue({
    error: 'stale listener answered',
    success: false,
    warnings: [],
  });
  sendViewerPopupExportMessageMock.mockResolvedValue({ success: true });
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
});

it('routes normal popup export preview messages to the content tab', async () => {
  const sendResponse = vi.fn();
  sendTabMessageMock.mockResolvedValue({
    preview: {
      context: 'example.test',
      jsonPreview: '{}',
      markdownPreview: '# Example',
      rowsCount: 0,
      sectionsCount: 0,
      title: 'Example',
    },
    success: true,
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

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(
    62,
    'Page access is required for export.'
  );
  expect(sendTabMessageMock).toHaveBeenCalledWith(62, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('rechecks page access before normal popup export side effects', async () => {
  const sendResponse = vi.fn();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(
    new Error('Page access is required for export.')
  );

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

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPopupExportMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required for export.',
    success: false,
  });
});

it('runs content-tab web snapshot saves through the injected runner result', async () => {
  const sendResponse = vi.fn();
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: createSaveMessage(),
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(authorizeWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'req-web', {
    allowAnonymousCrossOriginAssets: false,
  });
  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      args: [
        expect.objectContaining({
          request: expect.objectContaining({
            allowAnonymousCrossOriginAssets: false,
            allowAuthenticatedSameOriginAssets: false,
            contentIntentGrant: { grantToken: expect.any(String) },
            requestId: 'req-web',
          }),
        }),
      ],
      target: { frameIds: [0], tabId: 62 },
    })
  );
  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith({
    files: ['assets/webSnapshotInjectedRunner.js'],
    target: { frameIds: [0], tabId: 62 },
  });
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'snapshot-1',
    success: true,
    warnings: [],
  });
});

it('honors existing authenticated same-origin asset opt-ins from stored settings', async () => {
  const sendResponse = vi.fn();
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  loadSettingsMock.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: true,
  });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: createSaveMessage(),
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      args: [
        expect.objectContaining({
          request: expect.objectContaining({ allowAuthenticatedSameOriginAssets: true }),
        }),
      ],
    })
  );
  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('surfaces injected content export failures with the route stage', async () => {
  const sendResponse = vi.fn();
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  browserScriptingExecuteScriptMock.mockResolvedValue([
    {
      frameId: 0,
      result: {
        error: 'window is not defined',
        success: false,
        warnings: [],
      },
    },
  ]);

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: createSaveMessage(),
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'route web snapshot content export: window is not defined',
    success: false,
  });
});
