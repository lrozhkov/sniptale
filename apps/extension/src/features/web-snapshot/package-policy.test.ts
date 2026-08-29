import { expect, it } from 'vitest';

import { resolveWebSnapshotEntryByteLimit, WEB_SNAPSHOT_PACKAGE_POLICY } from './package-policy';

const MEBIBYTE = 1024 * 1024;

it('keeps the Web Copy asset budget bounded by package admission limits', () => {
  expect(WEB_SNAPSHOT_PACKAGE_POLICY.maxWebCopyAssetBytes).toBe(10 * MEBIBYTE);
  expect(WEB_SNAPSHOT_PACKAGE_POLICY.maxWebCopyAssetsBytes).toBe(128 * MEBIBYTE);
  expect(WEB_SNAPSHOT_PACKAGE_POLICY.maxWebCopyAssetBytes).toBeLessThanOrEqual(
    WEB_SNAPSHOT_PACKAGE_POLICY.maxAssetEntryBytes
  );
  expect(WEB_SNAPSHOT_PACKAGE_POLICY.maxWebCopyAssetsBytes).toBeLessThan(
    WEB_SNAPSHOT_PACKAGE_POLICY.maxTotalInflatedBytes
  );
});

it('maps every package entry family to its canonical byte limit', () => {
  expect(resolveWebSnapshotEntryByteLimit('manifest.json')).toBe(
    WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes
  );
  for (const path of ['page-screenshot.png', 'page-viewport-preview.png']) {
    expect(resolveWebSnapshotEntryByteLimit(path)).toBe(
      WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes
    );
  }
  for (const [path, mimeType] of [
    ['snapshot/index.html', undefined],
    ['diagnostics/live-dom.html.txt', undefined],
    ['assets/site.css', 'text/css'],
  ] as const) {
    expect(resolveWebSnapshotEntryByteLimit(path, mimeType)).toBe(
      WEB_SNAPSHOT_PACKAGE_POLICY.maxTextEntryBytes
    );
  }
  expect(resolveWebSnapshotEntryByteLimit('assets/image.png', 'image/png')).toBe(
    WEB_SNAPSHOT_PACKAGE_POLICY.maxAssetEntryBytes
  );
});
