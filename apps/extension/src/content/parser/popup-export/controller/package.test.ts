// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_POPUP_EXPORT_TAB_TITLE_BYTES } from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  buildSnapshot: vi.fn(),
  combine: vi.fn(),
  extended: vi.fn(),
  progress: vi.fn(),
  stage: vi.fn(),
  write: vi.fn(),
}));

vi.mock('../../../page-package', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-package')>()),
  buildExportPagePackage: mocks.build,
  composeCombinedPagePackage: mocks.combine,
}));
vi.mock('../../../page-package/staged-transfer', () => ({
  createPagePackageJobStagedSink: mocks.stage,
}));
vi.mock('../../web-snapshot/service', () => ({
  buildCurrentPageWebSnapshot: mocks.buildSnapshot,
}));
vi.mock('../../web-snapshot/progress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../web-snapshot/progress')>()),
  publishWebSnapshotSaveProgress: mocks.progress,
}));
vi.mock('../../export-manager/diagnostics/extended-evidence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../export-manager/diagnostics/extended-evidence')>()),
  buildExtendedDiagnosticArtifacts: mocks.extended,
}));
vi.mock('../../../../workflows/page-package/archive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/page-package/archive')>()),
  writePagePackageArchive: mocks.write,
}));

import { handlePopupExportBuildPackageRuntime } from './package';

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: false,
  includeFullPageScreenshot: false,
  includePageDiagnostics: false,
  includeImages: false,
  includeJson: true,
  includeMarkdown: false,
};

const extendedArtifacts = [
  {
    content: '<html></html>',
    mimeType: 'text/plain',
    path: 'diagnostics/extended/live-dom.html.txt',
  },
  {
    content: '{}',
    mimeType: 'application/json',
    path: 'diagnostics/extended/document-metadata.json',
  },
  { content: '{}', mimeType: 'application/json', path: 'diagnostics/extended/scripts.json' },
  { content: '{}', mimeType: 'application/json', path: 'diagnostics/extended/stylesheets.json' },
  { content: '{}', mimeType: 'application/json', path: 'diagnostics/extended/frames.json' },
  { content: '{}', mimeType: 'application/json', path: 'diagnostics/extended/redactions.json' },
] as const;

async function flushTasks(): Promise<void> {
  await vi.waitFor(() => expect(mocks.build).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extended.mockResolvedValue(extendedArtifacts);
  mocks.stage.mockReturnValue({ sink: {}, stagedBlobId: 'stage-1' });
  mocks.write.mockResolvedValue(undefined);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  document.title = 'Page';
});

it('rejects package builds while another export is already running', () => {
  const sendResponse = vi.fn();
  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-1',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: true },
  });

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Экспорт уже выполняется',
  });
});

it('returns only the staged descriptor after streaming the composed archive', async () => {
  const buildBlobPackage = vi.fn();
  const pagePackage = {
    entries: [],
    manifest: { id: 'page-1', source: { title: 'Page' }, stats: { totalBytes: 10 } },
    manifestBytes: new Uint8Array([1, 2]),
    manifestSha256: 'a'.repeat(64),
    manifestText: '{}',
    producerStats: { filesCount: 3, filesFailed: 0, rowsCount: 5, sectionsCount: 2 },
  };
  mocks.build.mockResolvedValue(pagePackage);
  const sendResponse = vi.fn();
  const state = { activeExportRequestId: null, isExportRunning: false };

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-1',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 2,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state,
  });
  await flushTasks();
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ package: pagePackage }));
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    stagedPagePackage: {
      jobId: 'job-1',
      manifestSha256: 'a'.repeat(64),
      manifestSize: 2,
      ordinal: 2,
      pageId: 'page-1',
      producerStats: pagePackage.producerStats,
      stagedBlobId: 'stage-1',
      title: 'Page',
      totalBytes: 12,
    },
  });
  expect(state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});

it('normalizes the live document title before composing the package', async () => {
  document.title = 'e\u0301'.repeat(MAX_POPUP_EXPORT_TAB_TITLE_BYTES);
  mocks.build.mockRejectedValue(new Error('stop after input inspection'));
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-title',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await flushTasks();

  const source = mocks.build.mock.calls[0]?.[0]?.source;
  expect(source?.title).toBe(source?.title.normalize('NFC'));
  expect(new TextEncoder().encode(source?.title).byteLength).toBeLessThanOrEqual(
    MAX_POPUP_EXPORT_TAB_TITLE_BYTES
  );
});

it('passes the background full-page capability into the mature export producer', async () => {
  const buildBlobPackage = vi.fn().mockResolvedValue({});
  mocks.build.mockImplementationOnce(async ({ exportProducer, options }) => {
    await exportProducer.buildBlobPackage(options);
    throw new Error('stop after producer context');
  });

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-capability',
      includeWebCopy: false,
      intent: 'export',
      contentIntentGrant: { grantToken: 'grant-1' },
      fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      ordinal: 0,
      options: {
        ...options,
        includeFiles: false,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
      },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse: vi.fn(),
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await flushTasks();

  expect(buildBlobPackage).toHaveBeenCalledWith(
    expect.objectContaining({ includeFullPageScreenshot: true }),
    {
      contentIntentSource: expect.any(Object),
      fullPageCaptureIdentity: {
        action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        exportRunId: 'job-capability',
      },
    }
  );
});

it('uses the mature Web Snapshot producer for Save-intent packages', async () => {
  const manifest = {
    components: [{ id: 'webCopy' }, { id: 'diagnostics' }],
    id: 'snapshot-1',
    source: { title: 'Saved page' },
    stats: { entryCount: 5, failedResourceCount: 1, totalBytes: 20 },
  };
  const pagePackage = {
    entries: [],
    manifest,
    manifestBytes: new Uint8Array([1, 2, 3]),
    manifestSha256: 'b'.repeat(64),
    manifestText: '{}',
  };
  mocks.buildSnapshot.mockImplementationOnce(async (args) => {
    args.onProgress({ current: 1, message: 'capturing', phase: 'capturing', total: 2 });
    return {
      manifest,
      pagePackage,
      snapshotSessionId: 'snapshot-session-1',
    };
  });
  mocks.combine.mockResolvedValueOnce(pagePackage);
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      batchRequestId: 'job-save',
      contentIntentGrant: { grantToken: 'grant-save' },
      fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      includeWebCopy: true,
      intent: 'save',
      ordinal: 0,
      options: { ...options, includeFullPageScreenshot: true, includeJson: false },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.buildSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      contentIntentSource: expect.any(Object),
      fullPageCaptureIdentity: {
        action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        exportRunId: 'job-save',
      },
      requestId: 'job-save',
    })
  );
  expect(mocks.progress).toHaveBeenCalledWith(
    'job-save',
    expect.objectContaining({ phase: 'capturing' })
  );
  expect(mocks.build).not.toHaveBeenCalled();
  expect(mocks.combine).toHaveBeenCalledWith({
    artifact: null,
    diagnosticsLevel: 'none',
    intent: 'save',
    webCopy: pagePackage,
  });
  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      package: expect.objectContaining({
        producerStats: {
          filesCount: 5,
          filesFailed: 1,
          rowsCount: 0,
          sectionsCount: 2,
        },
      }),
    })
  );
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    stagedPagePackage: expect.objectContaining({
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: 'stage-1',
    }),
  });
});

it('combines one mature Web Snapshot result with one Export Manager result', async () => {
  const webCopyPackage = {
    entries: [],
    manifest: {
      components: [{ id: 'webCopy' }],
      id: 'snapshot-combined',
      source: { title: 'Combined page' },
      stats: { entryCount: 3, failedResourceCount: 0, totalBytes: 20 },
    },
    manifestBytes: new Uint8Array([1]),
    manifestSha256: 'b'.repeat(64),
    manifestText: '{}',
  };
  const artifact = {
    entries: [],
    errors: [],
    stats: { filesCount: 2, filesFailed: 0, rowsCount: 4, sectionsCount: 1 },
  };
  const combined = {
    ...webCopyPackage,
    manifest: { ...webCopyPackage.manifest, stats: { ...webCopyPackage.manifest.stats } },
    manifestBytes: new Uint8Array([1, 2]),
    manifestSha256: 'c'.repeat(64),
  };
  mocks.buildSnapshot.mockResolvedValueOnce({
    manifest: webCopyPackage.manifest,
    pagePackage: webCopyPackage,
    snapshotSessionId: 'snapshot-session-combined',
  });
  mocks.combine.mockResolvedValueOnce(combined);
  const buildBlobPackage = vi.fn().mockResolvedValueOnce(artifact);
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: true,
      batchRequestId: 'job-combined',
      includeWebCopy: true,
      intent: 'save',
      ordinal: 0,
      options: { ...options, includeFullPageScreenshot: true, includeJson: true },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  expect(buildBlobPackage).toHaveBeenCalledWith(
    expect.objectContaining({ includeFullPageScreenshot: false, includeJson: true }),
    {}
  );
  expect(mocks.combine).toHaveBeenCalledWith({
    artifact,
    diagnosticsLevel: 'none',
    intent: 'save',
    webCopy: webCopyPackage,
  });
  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      package: expect.objectContaining({
        producerStats: {
          filesCount: 5,
          filesFailed: 0,
          rowsCount: 4,
          sectionsCount: 2,
        },
        snapshotSessionId: 'snapshot-session-combined',
      }),
    })
  );
});

it('does not expose Library session authority from a Web-copy Export package', async () => {
  const pagePackage = {
    entries: [],
    manifest: {
      components: [{ id: 'webCopy' }],
      id: 'snapshot-export',
      source: { title: 'Exported page' },
      stats: { entryCount: 3, failedResourceCount: 0, totalBytes: 20 },
    },
    manifestBytes: new Uint8Array([1, 2]),
    manifestSha256: 'd'.repeat(64),
    manifestText: '{}',
  };
  mocks.buildSnapshot.mockResolvedValueOnce({
    manifest: pagePackage.manifest,
    pagePackage,
    snapshotSessionId: 'ephemeral-export-session',
  });
  mocks.combine.mockResolvedValueOnce(pagePackage);
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      batchRequestId: 'job-web-copy-export',
      includeWebCopy: true,
      intent: 'export',
      ordinal: 0,
      options: { ...options, includeJson: false },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.buildSnapshot).toHaveBeenCalledOnce();
  expect(mocks.combine).toHaveBeenCalledWith({
    artifact: null,
    diagnosticsLevel: 'none',
    intent: 'export',
    webCopy: pagePackage,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    stagedPagePackage: expect.not.objectContaining({ snapshotSessionId: expect.anything() }),
  });
});

it('acquires disclosed extended evidence before Web-copy transformation for direct Export', async () => {
  const order: string[] = [];
  const pagePackage = {
    entries: [],
    manifest: {
      components: [{ id: 'webCopy' }],
      id: 'snapshot-extended',
      source: { title: 'Extended page' },
      stats: { entryCount: 3, failedResourceCount: 0, totalBytes: 20 },
    },
    manifestBytes: new Uint8Array([1]),
    manifestSha256: 'e'.repeat(64),
    manifestText: '{}',
  };
  mocks.extended.mockImplementationOnce(async () => {
    order.push('extended');
    return extendedArtifacts;
  });
  mocks.buildSnapshot.mockImplementationOnce(async () => {
    order.push('web-copy');
    return {
      manifest: pagePackage.manifest,
      pagePackage,
      snapshotSessionId: 'ephemeral-extended-session',
    };
  });
  mocks.combine.mockResolvedValueOnce(pagePackage);
  const artifact = {
    entries: [],
    errors: [],
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
  };
  const buildBlobPackage = vi.fn().mockResolvedValueOnce(artifact);
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      batchRequestId: 'job-extended',
      includeWebCopy: true,
      intent: 'export',
      ordinal: 0,
      options: { ...options, includeJson: false, includePageDiagnostics: true },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(order).toEqual(['extended', 'web-copy']);
  expect(mocks.combine).toHaveBeenCalledWith({
    artifact,
    diagnosticsLevel: 'extended',
    extendedDiagnosticArtifacts: extendedArtifacts,
    intent: 'export',
    webCopy: pagePackage,
  });
});

it('does not invoke Export Manager or staging after the retained Web Snapshot producer fails', async () => {
  mocks.buildSnapshot.mockRejectedValueOnce(new Error('snapshot failed'));
  const buildBlobPackage = vi.fn();
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      batchRequestId: 'job-snapshot-failure',
      includeWebCopy: true,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(buildBlobPackage).not.toHaveBeenCalled();
  expect(mocks.stage).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: translate('content.runtime.exportPrepareFailed'),
  });
});

it('reports producer failure and clears cancellation authority', async () => {
  mocks.build.mockRejectedValue(new Error('build failed'));
  const sendResponse = vi.fn();
  const state = { activeExportRequestId: null, isExportRunning: false };
  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-1',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state,
  });
  await flushTasks();
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: translate('content.runtime.exportPrepareFailed'),
  });
  expect(JSON.stringify(sendResponse.mock.calls)).not.toContain('build failed');
  expect(state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});
