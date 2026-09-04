// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_POPUP_EXPORT_TAB_TITLE_BYTES } from '@sniptale/runtime-contracts/export';
import { PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE } from '@sniptale/runtime-contracts/page-package';
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
import { handlePopupExportCancelRuntime } from './request-handler/cancel';

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

const extendedArtifacts = PAGE_PACKAGE_EXTENDED_DIAGNOSTIC_ENTRY_PROFILE.map((entry) => ({
  ...entry,
  content: entry.mimeType === 'text/plain' ? 'inert evidence' : '{}',
}));

async function flushTasks(): Promise<void> {
  await vi.waitFor(() => expect(mocks.build).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
}

function expectSafePopupExportFailure(sendResponse: ReturnType<typeof vi.fn>, raw: string[]): void {
  const responseText = JSON.stringify(sendResponse.mock.calls);
  expect(responseText).toContain(translate('content.runtime.exportPrepareFailed'));
  expect(responseText).toContain(translate('common.errors.unexpectedDetail'));
  raw.forEach((detail) => expect(responseText).not.toContain(detail));
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

it('keeps staging codes and raw causes out of the popup response', async () => {
  mocks.build.mockResolvedValue({
    entries: [],
    manifest: { id: 'page-1', source: { title: 'Page' }, stats: { totalBytes: 10 } },
    manifestBytes: new Uint8Array([1, 2]),
    manifestSha256: 'a'.repeat(64),
    manifestText: '{}',
    producerStats: { filesCount: 3, filesFailed: 0, rowsCount: 5, sectionsCount: 2 },
  });
  mocks.write.mockRejectedValueOnce(
    new Error('Archive failed for https://user:secret@example.test/?token=private')
  );
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      batchRequestId: 'job-staging-failure',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expectSafePopupExportFailure(sendResponse, [
    'ARCHIVE_STAGING',
    'Archive failed',
    'user:secret',
    'token=private',
  ]);
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

it('forwards mature structured-producer progress to the active popup job', async () => {
  const buildBlobPackage = vi.fn().mockResolvedValue({});
  const onProgress = vi.fn((callback) => {
    callback({
      activeStepKey: 'json',
      current: 1,
      errors: [],
      message: 'JSON',
      phase: 'scanning',
      total: 2,
    });
  });
  mocks.build.mockImplementationOnce(async ({ exportProducer, options }) => {
    await exportProducer.buildBlobPackage(options);
    throw new Error('stop after progress proof');
  });

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn(), onProgress },
    request: {
      batchRequestId: 'job-progress',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse: vi.fn(),
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await flushTasks();

  expect(mocks.progress).toHaveBeenCalledWith('job-progress', {
    activeStepKey: 'json',
    current: 1,
    total: 2,
  });
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

it('reports an explicitly cancelled package build as a user cancellation', async () => {
  mocks.buildSnapshot.mockImplementationOnce(
    ({ abortSignal }: { abortSignal: AbortSignal }) =>
      new Promise((_, reject) => {
        abortSignal.addEventListener('abort', () => reject(new Error('capture cancelled')), {
          once: true,
        });
      })
  );
  const sendResponse = vi.fn();
  const exportRunner = { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() };
  const state: {
    activeAbortController?: AbortController;
    activeExportRequestId: string | null;
    isExportRunning: boolean;
  } = { activeExportRequestId: null, isExportRunning: false };

  handlePopupExportBuildPackageRuntime({
    exportRunner,
    request: {
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: true,
      batchRequestId: 'job-cancelled',
      includeWebCopy: true,
      intent: 'save',
      ordinal: 0,
      options: { ...options, includeFullPageScreenshot: true, includeJson: false },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state,
  });
  await vi.waitFor(() => expect(mocks.buildSnapshot).toHaveBeenCalled());
  expect(state.activeAbortController).toBeInstanceOf(AbortController);
  handlePopupExportCancelRuntime({
    exportRunId: 'job-cancelled',
    exportRunner,
    sendResponse: vi.fn(),
    state,
  });
  expect(state.activeExportRequestId).toBe('job-cancelled');
  expect(state.isExportRunning).toBe(true);

  const overlappingResponse = vi.fn();
  handlePopupExportBuildPackageRuntime({
    exportRunner,
    request: {
      batchRequestId: 'job-overlapping',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse: overlappingResponse,
    state,
  });
  expect(overlappingResponse).toHaveBeenCalledWith({
    error: translate('content.runtime.exportAlreadyRunning'),
    success: false,
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(sendResponse).toHaveBeenCalledWith({
    error: translate('content.runtime.exportCancelled'),
    success: false,
  });
  expect(state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});

it('classifies a background full-page cancellation as cancellation before tab abort arrives', async () => {
  mocks.buildSnapshot.mockImplementationOnce(
    ({
      onProgress,
    }: {
      onProgress(update: { activeStepKey: string; current: number; total: number }): void;
    }) => {
      onProgress({ activeStepKey: 'webSnapshotPreview', current: 0, total: 4 });
      return Promise.reject(new Error('Full-page capture cancelled'));
    }
  );
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage: vi.fn(), buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: true,
      batchRequestId: 'job-background-cancelled',
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

  expect(sendResponse).toHaveBeenCalledWith({
    error: translate('content.runtime.exportCancelled'),
    success: false,
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

it('skips Export Manager when Web copy already supplies the only selected screenshot', async () => {
  const pagePackage = {
    entries: [],
    manifest: {
      components: [{ id: 'webCopy' }],
      id: 'snapshot-screenshot-only',
      source: { title: 'Screenshot-only page' },
      stats: { entryCount: 2, failedResourceCount: 0, totalBytes: 20 },
    },
    manifestBytes: new Uint8Array([1]),
    manifestSha256: 'd'.repeat(64),
    manifestText: '{}',
  };
  mocks.buildSnapshot.mockResolvedValueOnce({
    manifest: pagePackage.manifest,
    pagePackage,
    snapshotSessionId: 'ephemeral-screenshot-only-session',
  });
  mocks.combine.mockResolvedValueOnce(pagePackage);
  const buildBlobPackage = vi.fn();
  const sendResponse = vi.fn();

  handlePopupExportBuildPackageRuntime({
    exportRunner: { buildBlobPackage, buildPackage: vi.fn(), cancel: vi.fn() },
    request: {
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: true,
      batchRequestId: 'job-screenshot-only',
      includeWebCopy: true,
      intent: 'export',
      ordinal: 0,
      options: { ...options, includeFullPageScreenshot: true, includeJson: false },
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.buildSnapshot).toHaveBeenCalledOnce();
  expect(buildBlobPackage).not.toHaveBeenCalled();
  expect(mocks.combine).toHaveBeenCalledWith({
    artifact: null,
    diagnosticsLevel: 'none',
    intent: 'export',
    webCopy: pagePackage,
  });
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

it('acquires selected extended evidence before Web-copy transformation for Library Save', async () => {
  const order: string[] = [];
  const pagePackage = {
    entries: [
      {
        component: 'webCopy',
        mimeType: 'text/html',
        path: 'snapshot/index.html',
        sha256: 'a'.repeat(64),
        size: 35,
        source: new Blob(['<!doctype html><main>Published</main>'], { type: 'text/html' }),
      },
    ],
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
      diagnosticAssetLedger: { entries: [], omitted: 0, total: 0 },
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
      intent: 'save',
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
    extendedDiagnosticArtifacts: expect.arrayContaining([
      expect.objectContaining({
        content: '<!doctype html><main>Published</main>',
        path: 'diagnostics/extended/page/published-dom.html.txt',
      }),
      expect.objectContaining({
        path: 'diagnostics/extended/assets.json',
      }),
    ]),
    intent: 'save',
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
  expectSafePopupExportFailure(sendResponse, ['WEB_COPY_START', 'snapshot failed']);
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

  expectSafePopupExportFailure(sendResponse, ['SELECTED_DATA', 'build failed']);
  expect(state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});
