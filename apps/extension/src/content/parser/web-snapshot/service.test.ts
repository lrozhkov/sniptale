// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPreparedSnapshotDocument: vi.fn(),
  buildWebSnapshotPackage: vi.fn(),
  captureWebSnapshotScreenshot: vi.fn(),
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

vi.mock('./capture', () => ({
  captureWebSnapshotScreenshot: mocks.captureWebSnapshotScreenshot,
}));

vi.mock('./package', () => ({
  buildWebSnapshotPackage: mocks.buildWebSnapshotPackage,
}));

import { buildCurrentPageWebSnapshot } from './service';

const CHROMIUM_DECODABLE_FALLBACK_SCREENSHOT_DATA_URL =
  'data:image/png;base64,' +
  [
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//',
    'XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==',
  ].join('');

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob.'));
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const snapshotDocument = document.implementation.createHTMLDocument('prepared');
  mocks.buildPreparedSnapshotDocument.mockResolvedValue({
    document: snapshotDocument,
    html: '<!doctype html><html></html>',
    warnings: [{ kind: 'iframe-unreadable', message: 'Iframe skipped' }],
  });
  mocks.collectWebSnapshotAssets.mockResolvedValue({
    assets: [{ blob: new Blob(['asset']), localPath: 'assets/1.png', originalUrl: '/asset.png' }],
    privacyWarnings: ['Authenticated same-site assets were enabled'],
    snapshotSessionId: 'snapshot-session-1',
    warnings: ['Asset skipped'],
  });
  mocks.captureWebSnapshotScreenshot.mockResolvedValue(new Blob(['shot'], { type: 'image/png' }));
  mocks.serializePreparedSnapshotDocument.mockReturnValue('<!doctype html><html>rewritten</html>');
  mocks.buildWebSnapshotPackage.mockResolvedValue({
    manifest: { assets: [], createdAt: 'now', title: 'prepared', version: 1 },
    packageBlob: new Blob(['package'], { type: 'application/x-sniptale-web-snapshot+zip' }),
    screenshotBlob: new Blob(['shot'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
  });
});

it('packages the canonical prepared snapshot document after asset rewriting', async () => {
  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web',
  });
  const snapshotDocument = mocks.buildPreparedSnapshotDocument.mock.results[0]?.value;

  expect(mocks.buildPreparedSnapshotDocument).toHaveBeenCalledWith({
    contextLabel: 'web-snapshot',
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
});

it('keeps web snapshot export usable when full-page screenshot capture fails', async () => {
  mocks.captureWebSnapshotScreenshot.mockRejectedValueOnce(new Error('window is not defined'));

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web',
  });

  expect(mocks.buildWebSnapshotPackage).toHaveBeenCalledWith(
    expect.objectContaining({
      screenshotBlob: expect.objectContaining({ type: 'image/png' }),
      warningStats: expect.objectContaining({
        failedAssetCount: 1,
        networkWarningCount: 1,
        sanitizerWarningCount: 1,
        warningCount: 4,
      }),
      warnings: expect.arrayContaining([
        'Full-page web snapshot screenshot failed: window is not defined',
      ]),
    })
  );
  expect(result.warnings).toEqual(
    expect.arrayContaining(['Full-page web snapshot screenshot failed: window is not defined'])
  );
  const fallbackScreenshot = mocks.buildWebSnapshotPackage.mock.calls[0]?.[0]?.screenshotBlob;
  expect(fallbackScreenshot).toBeInstanceOf(Blob);
  if (!fallbackScreenshot) {
    throw new Error('Fallback screenshot blob was not passed to the package builder.');
  }
  await expect(blobToDataUrl(fallbackScreenshot)).resolves.toBe(
    CHROMIUM_DECODABLE_FALLBACK_SCREENSHOT_DATA_URL
  );
});
