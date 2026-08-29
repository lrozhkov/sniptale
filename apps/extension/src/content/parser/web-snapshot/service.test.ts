// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MAX_POPUP_EXPORT_TAB_TITLE_BYTES } from '@sniptale/runtime-contracts/export';

const mocks = vi.hoisted(() => ({
  buildPreparedSnapshotDocument: vi.fn(),
  buildWebSnapshotPackage: vi.fn(),
  captureWebSnapshotScreenshotWithWarnings: vi.fn(),
  collectWebSnapshotAssets: vi.fn(),
  materializeUnreadableIframeRasters: vi.fn(),
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

vi.mock('./iframe-raster', () => ({
  materializeUnreadableIframeRasters: mocks.materializeUnreadableIframeRasters,
}));

import { buildCurrentPageWebSnapshot } from './service';

const captureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 768,
  extentWidth: 1024,
  outputHeight: 768,
  outputWidth: 1024,
  rootKind: 'viewport' as const,
  rootViewport: { height: 768, width: 1024, x: 0, y: 0 },
  viewportHeight: 768,
  viewportWidth: 1024,
};

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Prepared web snapshot';
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
    captureGeometry,
    coverage: 'full-page',
    warnings: [],
  });
  mocks.materializeUnreadableIframeRasters.mockResolvedValue({
    assets: [],
    rasterizedTargets: [],
  });
  mocks.serializePreparedSnapshotDocument.mockReturnValue('<!doctype html><html>rewritten</html>');
  mocks.buildWebSnapshotPackage.mockResolvedValue({
    manifest: { assets: [], createdAt: 'now', title: 'prepared', version: 1 },
    packageBlob: new Blob(['package'], {
      type: 'application/x-sniptale-page-package+zip',
    }),
    screenshotBlob: new Blob(['shot'], { type: 'image/png' }),
    screenshotCoverage: 'full-page',
    screenshotMimeType: 'image/png',
  });
});

it('normalizes the live document title before handing it to package composition', async () => {
  document.title = 'e\u0301'.repeat(MAX_POPUP_EXPORT_TAB_TITLE_BYTES);

  await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-title',
  });

  const title = mocks.buildWebSnapshotPackage.mock.calls[0]?.[0]?.source?.title;
  expect(typeof title).toBe('string');
  expect(title).toBe(title.normalize('NFC'));
  expect(new TextEncoder().encode(title).byteLength).toBeLessThanOrEqual(
    MAX_POPUP_EXPORT_TAB_TITLE_BYTES
  );
});

it('reports a successfully preserved unreadable iframe as a static image', async () => {
  mocks.buildPreparedSnapshotDocument.mockResolvedValueOnce({
    document: document.implementation.createHTMLDocument('prepared'),
    html: '<!doctype html><html></html>',
    warnings: [
      {
        kind: 'iframe-unreadable',
        message: 'Iframe content was not readable and was saved as a static placeholder: #demo',
        target: '#demo',
      },
    ],
  });
  mocks.materializeUnreadableIframeRasters.mockResolvedValueOnce({
    assets: [
      {
        blob: new Blob(['png'], { type: 'image/png' }),
        localPath: 'assets/sniptale-iframe-raster-1.png',
        originalUrl: 'sniptale-iframe-raster:1',
      },
    ],
    rasterizedTargets: ['#demo'],
  });

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web',
  });

  expect(result.warnings).toContain('Iframe content was preserved as a static image: #demo');
  expect(result.warnings).not.toContain(
    'Iframe content was not readable and was saved as a static placeholder: #demo'
  );
  expect(mocks.buildWebSnapshotPackage).toHaveBeenCalledWith(
    expect.objectContaining({
      assets: expect.arrayContaining([
        expect.objectContaining({
          localPath: 'assets/sniptale-iframe-raster-1.png',
        }),
      ]),
    })
  );
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
    serializeHtml: false,
  });
  expect(mocks.captureWebSnapshotScreenshotWithWarnings.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.buildPreparedSnapshotDocument.mock.invocationCallOrder[0] ?? 0
  );
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
    (await snapshotDocument).document as Document,
    { preferParseStableHtml: true }
  );
  expect(mocks.materializeUnreadableIframeRasters).toHaveBeenCalledWith(
    (await snapshotDocument).document as Document,
    expect.any(Blob),
    captureGeometry
  );
  expect(mocks.buildWebSnapshotPackage).toHaveBeenCalledWith(
    expect.objectContaining({
      html: '<!doctype html><html>rewritten</html>',
      source: {
        title: document.title || null,
        url: document.location.href,
        viewport: {
          deviceScaleFactor: window.devicePixelRatio,
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
    { activeStepKey: 'webSnapshotPreview', current: 0, total: 4 },
    { activeStepKey: 'webSnapshotDom', current: 1, total: 4 },
    { activeStepKey: 'webSnapshotStyles', current: 2, total: 4 },
    { activeStepKey: 'webSnapshotAssets', current: 2, total: 4 },
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
  expect(mocks.buildPreparedSnapshotDocument).not.toHaveBeenCalled();
  expect(mocks.collectWebSnapshotAssets).not.toHaveBeenCalled();
  expect(mocks.buildWebSnapshotPackage).not.toHaveBeenCalled();
  expect(mocks.serializePreparedSnapshotDocument).not.toHaveBeenCalled();
});

it('packages a visible-area fallback as partial and does not project offscreen iframe rasters from it', async () => {
  mocks.captureWebSnapshotScreenshotWithWarnings.mockResolvedValueOnce({
    blob: new Blob(['partial'], { type: 'image/png' }),
    captureGeometry,
    coverage: 'viewport',
    warnings: ['Only the visible area was retained'],
  });

  await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-partial',
  });

  expect(mocks.materializeUnreadableIframeRasters).not.toHaveBeenCalled();
  expect(mocks.buildWebSnapshotPackage).toHaveBeenCalledWith(
    expect.objectContaining({
      screenshotCoverage: 'viewport',
      warnings: expect.arrayContaining(['Only the visible area was retained']),
    })
  );
});
