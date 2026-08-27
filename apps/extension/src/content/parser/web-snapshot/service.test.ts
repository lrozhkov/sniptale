// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPreparedSnapshotDocument: vi.fn(),
  buildWebSnapshotPackage: vi.fn(),
  captureWebSnapshotScreenshotWithWarnings: vi.fn(),
  collectWebSnapshotAssets: vi.fn(),
  serializePreparedSnapshotDocument: vi.fn(),
}));

vi.mock('../page-preparation/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-preparation/snapshot')>()),
  buildPreparedSnapshotDocument: mocks.buildPreparedSnapshotDocument,
  serializePreparedSnapshotDocument: mocks.serializePreparedSnapshotDocument,
}));

vi.mock('./assets', () => ({
  collectWebSnapshotAssets: mocks.collectWebSnapshotAssets,
}));

vi.mock('./capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture')>()),
  captureWebSnapshotScreenshotWithWarnings: mocks.captureWebSnapshotScreenshotWithWarnings,
}));

vi.mock('./package', () => ({
  buildWebSnapshotPackage: mocks.buildWebSnapshotPackage,
}));

import { buildCurrentPageWebSnapshot } from './service';

beforeEach(() => {
  vi.clearAllMocks();
  const snapshotDocument = document.implementation.createHTMLDocument('prepared');
  mocks.buildPreparedSnapshotDocument.mockResolvedValue({
    document: snapshotDocument,
    html: '<!doctype html><html></html>',
    warnings: [{ kind: 'iframe-unreadable', message: 'Iframe skipped' }],
  });
  mocks.collectWebSnapshotAssets.mockResolvedValue({
    assets: [
      {
        blob: new Blob(['asset']),
        localPath: 'assets/1.png',
        originalUrl: '/asset.png',
      },
    ],
    privacyWarnings: ['Authenticated same-site assets were enabled'],
    snapshotSessionId: 'snapshot-session-1',
    warnings: ['Asset skipped'],
  });
  mocks.captureWebSnapshotScreenshotWithWarnings.mockResolvedValue({
    blob: new Blob(['shot'], { type: 'image/png' }),
    warnings: [],
  });
  mocks.serializePreparedSnapshotDocument.mockReturnValue('<!doctype html><html>rewritten</html>');
  mocks.buildWebSnapshotPackage.mockResolvedValue({
    manifest: { assets: [], createdAt: 'now', title: 'prepared', version: 1 },
    packageBlob: new Blob(['package'], {
      type: 'application/x-sniptale-web-snapshot+zip',
    }),
    screenshotBlob: new Blob(['shot'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
  });
});

it('packages the canonical prepared snapshot document after asset rewriting', async () => {
  const onProgress = vi.fn();
  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web',
    onProgress,
  });
  const snapshotDocument = mocks.buildPreparedSnapshotDocument.mock.results[0]?.value;

  expect(mocks.buildPreparedSnapshotDocument).toHaveBeenCalledWith({
    contextLabel: 'web-snapshot',
    preserveAssetUrls: true,
  });
  expect(mocks.collectWebSnapshotAssets).toHaveBeenCalledWith(
    (await snapshotDocument).document as Document,
    {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
      sourceUrl: document.location.href,
    }
  );
  expect(mocks.serializePreparedSnapshotDocument).toHaveBeenCalledWith(
    (await snapshotDocument).document as Document
  );
  expect(mocks.buildWebSnapshotPackage).toHaveBeenCalledWith(
    expect.objectContaining({
      html: '<!doctype html><html>rewritten</html>',
      source: {
        title: document.title || null,
        url: document.location.href,
        viewport: {
          height: window.innerHeight,
          width: window.innerWidth,
        },
      },
      warningStats: {
        failedAssetCount: 1,
        networkWarningCount: 1,
        sanitizerWarningCount: 1,
        warningCount: 3,
      },
      warnings: ['Iframe skipped', 'Authenticated same-site assets were enabled', 'Asset skipped'],
    })
  );
  expect(result.warnings).toEqual([
    'Iframe skipped',
    'Authenticated same-site assets were enabled',
    'Asset skipped',
  ]);
  expect(result.snapshotSessionId).toBe('snapshot-session-1');
  expect(onProgress.mock.calls.map(([update]) => update)).toEqual([
    { activeStepKey: 'webSnapshotDom', current: 0, total: 4 },
    { activeStepKey: 'webSnapshotPreview', current: 1, total: 4 },
    { activeStepKey: 'webSnapshotStyles', current: 2, total: 4 },
    { activeStepKey: 'webSnapshotAssets', current: 3, total: 4 },
    { activeStepKey: 'webSnapshotAssets', current: 4, total: 4 },
  ]);
});

it('fails before packaging when the required full-page screenshot capture fails', async () => {
  mocks.captureWebSnapshotScreenshotWithWarnings.mockRejectedValueOnce(
    new Error('window is not defined')
  );

  await expect(
    buildCurrentPageWebSnapshot({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
    })
  ).rejects.toThrow('window is not defined');
  expect(mocks.collectWebSnapshotAssets).not.toHaveBeenCalled();
  expect(mocks.buildWebSnapshotPackage).not.toHaveBeenCalled();
  expect(mocks.serializePreparedSnapshotDocument).not.toHaveBeenCalled();
});
