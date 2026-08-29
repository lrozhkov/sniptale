import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeWebSnapshotCaptureRequestMock,
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  loadSettingsMock,
  isOwnedSnapshotViewerPageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
  cancelWebSnapshotCaptureRequestMock,
  deleteMediaLibraryAssetsBatchSafelyMock,
  assertPopupTabRouteTargetDocumentMock,
  issueContentGrantMock,
} = vi.hoisted(() => ({
  authorizeWebSnapshotCaptureRequestMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
  cancelWebSnapshotCaptureRequestMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  assertPopupTabRouteTargetDocumentMock: vi.fn(),
  issueContentGrantMock: vi.fn(),
}));

vi.mock('../../../routing-contracts/capabilities/content-action/route', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/capabilities/content-action/route')
  >()),
  issueContentPrivilegedActionAutoStartGrant: issueContentGrantMock,
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
  cancelWebSnapshotCaptureRequest: cancelWebSnapshotCaptureRequestMock,
}));

vi.mock('../../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/media-hub/store')>()),
  deleteMediaLibraryAssetsBatchSafely: deleteMediaLibraryAssetsBatchSafelyMock,
}));

vi.mock('../../../capture/page-preparation/viewer-ports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/page-preparation/viewer-ports')>()),
  sendViewerPopupExportMessage: sendViewerPopupExportMessageMock,
}));

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import {
  cancelPopupExportPagePackage,
  requestPopupExportPagePackage,
  routePopupExportMessage,
} from './popup-export-routing';

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  assertPopupTabRouteTargetDocumentMock.mockResolvedValue(undefined);
  loadSettingsMock.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
    externalSnapshotAssetRedirectsEnabled: true,
  });
  sendTabMessageMock.mockResolvedValue({
    error: 'stale listener answered',
    success: false,
    warnings: [],
  });
  sendViewerPopupExportMessageMock.mockResolvedValue({ success: true });
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  cancelWebSnapshotCaptureRequestMock.mockReturnValue({
    committedAssetIds: [],
    stagingCleanup: Promise.resolve(),
  });
  deleteMediaLibraryAssetsBatchSafelyMock.mockResolvedValue(undefined);
  issueContentGrantMock.mockReturnValue({ grantToken: 'grant-full-page' });
});

it('attaches the canonical full-page capability to staged Page Package production', async () => {
  sendTabMessageMock.mockResolvedValue({ success: true });

  await requestPopupExportPagePackage({
    batchRequestId: 'job-1',
    includeWebCopy: false,
    intent: 'export',
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: true,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includePageDiagnostics: false,
    },
    ordinal: 0,
    tabId: 62,
  });

  expect(issueContentGrantMock).toHaveBeenCalledWith({
    actionTypes: [MessageType.EXPORT_CAPTURE_FULL_PAGE],
    tabId: 62,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    62,
    expect.objectContaining({
      batchRequestId: 'job-1',
      intent: 'export',
      contentIntentGrant: { grantToken: 'grant-full-page' },
      fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      options: expect.objectContaining({ includeFullPageScreenshot: true }),
      ordinal: 0,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  );
});

it('grants data-only visible capture alongside full-page capture', async () => {
  sendTabMessageMock.mockResolvedValue({ success: true });

  await requestPopupExportPagePackage({
    batchRequestId: 'job-both-screenshots',
    includeWebCopy: false,
    intent: 'export',
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: true,
      includeViewportScreenshot: true,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includePageDiagnostics: false,
    },
    ordinal: 0,
    tabId: 62,
  });

  expect(issueContentGrantMock).toHaveBeenCalledWith({
    actionTypes: [
      MessageType.EXPORT_CAPTURE_FULL_PAGE,
      CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    ],
    tabId: 62,
  });
});

it('terminates an unresponsive Page Package producer and forwards canonical cleanup', async () => {
  vi.useFakeTimers();
  try {
    sendTabMessageMock
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ success: true });

    const request = requestPopupExportPagePackage({
      batchRequestId: 'job-timeout',
      includeWebCopy: false,
      intent: 'export',
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: true,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      ordinal: 0,
      tabId: 62,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sendTabMessageMock).toHaveBeenCalledTimes(1);

    const rejection = expect(request).rejects.toThrow('Page Package preparation timed out.');
    await vi.advanceTimersByTimeAsync(180_000);
    await rejection;

    expect(sendTabMessageMock).toHaveBeenLastCalledWith(62, {
      exportRunId: 'job-timeout',
      type: MessageType.EXPORT_POPUP_CANCEL,
    });
    expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-timeout');
  } finally {
    vi.useRealTimers();
  }
});

it('applies Web Snapshot consent, resource policy, and capture authority to combined Export', async () => {
  loadSettingsMock.mockResolvedValueOnce({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    externalSnapshotAssetRedirectsEnabled: true,
  });
  sendTabMessageMock.mockResolvedValue({
    stagedPagePackage: {
      jobId: 'job-combined',
      manifestSha256: 'a'.repeat(64),
      manifestSize: 10,
      ordinal: 0,
      pageId: 'page-combined',
      producerStats: { filesCount: 4, filesFailed: 0, rowsCount: 2, sectionsCount: 2 },
      stagedBlobId: 'stage-combined',
      title: 'Page',
      totalBytes: 20,
    },
    success: true,
  });

  await requestPopupExportPagePackage({
    batchRequestId: 'job-combined',
    includeWebCopy: true,
    intent: 'export',
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
      includePageDiagnostics: false,
    },
    ordinal: 0,
    tabId: 62,
  });

  expect(loadSettingsMock).toHaveBeenCalledTimes(1);
  expect(authorizeWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-combined', {
    allowAnonymousCrossOriginAssets: true,
    allowExternalAssetRedirects: true,
  });
  expect(issueContentGrantMock).toHaveBeenCalledWith({
    actionTypes: [MessageType.EXPORT_CAPTURE_FULL_PAGE],
    tabId: 62,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    62,
    expect.objectContaining({
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      includeWebCopy: true,
      intent: 'export',
    })
  );
  expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-combined');
});

it('cleans Web-copy authority when combined production returns no staged package', async () => {
  sendTabMessageMock.mockResolvedValueOnce({ success: false, error: 'capture failed' });

  await expect(
    requestPopupExportPagePackage({
      batchRequestId: 'job-failed-copy',
      includeWebCopy: true,
      intent: 'export',
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: false,
        includeImages: false,
        includeJson: true,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      ordinal: 0,
      tabId: 62,
    })
  ).rejects.toThrow('capture failed');

  expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-failed-copy');
});

it('rejects and cleans an Export response carrying Save session authority', async () => {
  sendTabMessageMock.mockResolvedValueOnce({
    stagedPagePackage: {
      jobId: 'job-hostile-session',
      manifestSha256: 'a'.repeat(64),
      manifestSize: 10,
      ordinal: 0,
      pageId: 'page-hostile-session',
      producerStats: { filesCount: 3, filesFailed: 0, rowsCount: 0, sectionsCount: 1 },
      snapshotSessionId: 'unexpected-save-session',
      stagedBlobId: 'stage-hostile-session',
      title: 'Page',
      totalBytes: 20,
    },
    success: true,
  });

  await expect(
    requestPopupExportPagePackage({
      batchRequestId: 'job-hostile-session',
      includeWebCopy: true,
      intent: 'export',
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: false,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      ordinal: 0,
      tabId: 62,
    })
  ).rejects.toThrow('does not match requested Web-copy authority');

  expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-hostile-session');
});

it('carries stored Web Snapshot policy through the common Save package request', async () => {
  sendTabMessageMock.mockResolvedValue({
    stagedPagePackage: {
      jobId: 'job-save',
      manifestSha256: 'a'.repeat(64),
      manifestSize: 10,
      ordinal: 0,
      pageId: 'page-1',
      producerStats: { filesCount: 3, filesFailed: 0, rowsCount: 0, sectionsCount: 2 },
      snapshotSessionId: 'session-1',
      stagedBlobId: 'stage-1',
      title: 'Page',
      totalBytes: 20,
    },
    success: true,
  });

  await requestPopupExportPagePackage({
    batchRequestId: 'job-save',
    includeWebCopy: true,
    intent: 'save',
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: true,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includePageDiagnostics: false,
    },
    ordinal: 0,
    tabId: 62,
  });

  expect(authorizeWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-save', {
    allowAnonymousCrossOriginAssets: false,
    allowExternalAssetRedirects: false,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    62,
    expect.objectContaining({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      intent: 'save',
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  );
  expect(cancelWebSnapshotCaptureRequestMock).not.toHaveBeenCalled();
});

it('revokes Save capture authority when package routing fails', async () => {
  sendTabMessageMock.mockRejectedValueOnce(new Error('content unavailable'));

  await expect(
    requestPopupExportPagePackage({
      batchRequestId: 'job-save-failed',
      includeWebCopy: true,
      intent: 'save',
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      ordinal: 0,
      tabId: 62,
    })
  ).rejects.toThrow('content unavailable');

  expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-save-failed');
});

it('canonical job cancellation revokes capture authority and deletes committed snapshots', async () => {
  cancelWebSnapshotCaptureRequestMock.mockReturnValueOnce({
    committedAssetIds: ['asset-cancelled'],
    stagingCleanup: Promise.resolve(),
  });
  sendTabMessageMock.mockResolvedValueOnce({ success: true });

  await cancelPopupExportPagePackage({ exportRunId: 'job-save', tabId: 62 });

  expect(cancelWebSnapshotCaptureRequestMock).toHaveBeenCalledWith(62, 'job-save');
  expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(['asset-cancelled']);
  expect(sendTabMessageMock).toHaveBeenCalledWith(62, {
    exportRunId: 'job-save',
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
});

it('still forwards cancellation when capture compensation fails', async () => {
  cancelWebSnapshotCaptureRequestMock.mockReturnValueOnce({
    committedAssetIds: ['asset-retained'],
    stagingCleanup: Promise.resolve(),
  });
  deleteMediaLibraryAssetsBatchSafelyMock.mockRejectedValueOnce(new Error('delete unavailable'));
  sendTabMessageMock.mockResolvedValueOnce({ success: true });

  await expect(
    cancelPopupExportPagePackage({ exportRunId: 'job-save', tabId: 62 })
  ).rejects.toThrow('delete unavailable');

  expect(sendTabMessageMock).toHaveBeenCalledWith(62, {
    exportRunId: 'job-save',
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
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
