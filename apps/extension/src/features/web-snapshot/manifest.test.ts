import { expect, it } from 'vitest';
import { createPagePackageManifestFixture } from './manifest.test-support';
import { isWebSnapshotManifest, WEB_SNAPSHOT_PACKAGE_PATHS } from './manifest';

it('delegates Web Snapshot manifest admission to the Page Package contract', () => {
  const manifest = createPagePackageManifestFixture();
  expect(manifest.kind).toBe('page-package');
  expect(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml).toBe('snapshot/index.html');
  expect(isWebSnapshotManifest(manifest)).toBe(true);
  expect(isWebSnapshotManifest({ ...manifest, kind: 'legacy-web-snapshot' })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, entries: [] })).toBe(false);
});
