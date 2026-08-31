import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createRuntime() {
  return {
    exportRunner: {
      buildBlobPackage: vi.fn().mockResolvedValue({}),
      buildPackage: vi.fn().mockResolvedValue({}),
      cancel: vi.fn(),
    },
    parseTree: vi.fn(),
    state: {
      activeExportRequestId: null,
      isExportRunning: false,
    },
  };
}

it('does not load content-only web snapshot capture code for package routes', async () => {
  vi.doMock('../web-snapshot-runtime', () => {
    throw new Error('content-only snapshot branch loaded');
  });
  vi.doMock('../../../web-snapshot/service', () => {
    throw new Error('web snapshot producer loaded');
  });
  vi.doMock('../../../../page-package', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../../page-package')>()),
    buildExportPagePackage: vi.fn().mockResolvedValue({
      entries: [],
      manifest: { id: 'page-1', source: { title: 'Page' }, stats: { totalBytes: 0 } },
      manifestBytes: new Uint8Array(),
      manifestSha256: 'a'.repeat(64),
    }),
  }));
  vi.doMock('../../../../page-package/staged-transfer', () => ({
    createPagePackageJobStagedSink: () => ({ sink: {}, stagedBlobId: 'stage-1' }),
  }));
  vi.doMock('../../../../../workflows/page-package/archive', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../../../workflows/page-package/archive')>()),
    writePagePackageArchive: vi.fn().mockResolvedValue(undefined),
  }));

  const { dispatchPopupExportRequest } = await import('./dispatch');
  const runtime = createRuntime();
  const sendResponse = vi.fn();

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        options: createExportOptions(),
        batchRequestId: 'req-1',
        includeWebCopy: false,
        intent: 'export',
        ordinal: 0,
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      },
      sendResponse,
    })
  ).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(runtime.exportRunner.buildPackage).not.toHaveBeenCalled();
});
