import { expect, it } from 'vitest';
import { WebSnapshotCaptureMode } from '@sniptale/runtime-contracts/web-snapshot';
import {
  assertSafeWebSnapshotPackagePath,
  createWebSnapshotManifest,
  isAllowedWebSnapshotPackagePath,
  isWebSnapshotManifest,
} from './manifest';

it('creates and validates read-only no-scripts manifests', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    packageSize: 42,
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    stats: { assetCount: 2, failedAssetCount: 1 },
    warnings: ['missing image'],
  });

  expect(manifest.captureMode).toBe(WebSnapshotCaptureMode.ReadOnlyNoScripts);
  expect(manifest.stats.packageSize).toBe(42);
  expect(manifest.paths.snapshotHtml).toBe('snapshot/index.html');
  expect(isWebSnapshotManifest(manifest)).toBe(true);
  expect(isWebSnapshotManifest({ ...manifest, captureMode: 'liveScripts' })).toBe(false);
});

it('validates optional asset metadata when present', () => {
  const asset = {
    mimeType: 'image/png',
    path: 'assets/image.png',
    sha256: 'a'.repeat(64),
    size: 3,
  };
  const manifest = createWebSnapshotManifest({
    assets: [asset],
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
  });

  expect(isWebSnapshotManifest(manifest)).toBe(true);
  expect(
    isWebSnapshotManifest({
      ...manifest,
      assets: [{ ...asset, sha256: 'not-a-sha' }],
    })
  ).toBe(false);
  expect(
    isWebSnapshotManifest({
      ...manifest,
      assets: [{ ...asset, mimeType: 'bad mime' }],
    })
  ).toBe(false);
});

it('creates and validates optional capture viewport metadata', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    viewport: { height: 720, width: 1280 },
  });

  expect(manifest.viewport).toEqual({ height: 720, width: 1280 });
  expect(isWebSnapshotManifest(manifest)).toBe(true);
  expect(isWebSnapshotManifest({ ...manifest, viewport: { height: 720, width: '1280' } })).toBe(
    false
  );
});

it('omits invalid capture viewport metadata from created manifests', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    viewport: { height: 0, width: Number.NaN },
  });

  expect(manifest.viewport).toBeUndefined();
  expect(isWebSnapshotManifest(manifest)).toBe(true);
});

it('returns false instead of throwing for malformed nested manifest fields', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
  });

  expect(isWebSnapshotManifest({ ...manifest, source: 1 })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, paths: 'bad-paths' })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, stats: true })).toBe(false);
});

it('validates package paths for persisted web snapshot entries', () => {
  expect(isAllowedWebSnapshotPackagePath('manifest.json')).toBe(true);
  expect(isAllowedWebSnapshotPackagePath('assets/image.png')).toBe(true);
  expect(isAllowedWebSnapshotPackagePath('logs/css/stylesheets/page.css')).toBe(true);
  expect(isAllowedWebSnapshotPackagePath('assets/nested/image.png')).toBe(false);
  expect(isAllowedWebSnapshotPackagePath('logs/css/stylesheets/page.txt')).toBe(false);
  expect(() => assertSafeWebSnapshotPackagePath('assets/image.png')).not.toThrow();
  expect(() => assertSafeWebSnapshotPackagePath('/manifest.json')).toThrow(
    'Web snapshot package contains an unsafe path.'
  );
  expect(() => assertSafeWebSnapshotPackagePath('unexpected.json')).toThrow(
    'Web snapshot package contains an unexpected path.'
  );
});

it.each(['assets/image\\nested.png', 'assets/.', 'assets/..'])(
  'rejects unsafe package path %s before the permissive flat asset allow-list',
  (path) => {
    expect(isAllowedWebSnapshotPackagePath(path)).toBe(true);
    expect(() => assertSafeWebSnapshotPackagePath(path)).toThrow(
      'Web snapshot package contains an unsafe path.'
    );
  }
);

it('returns false for malformed top-level manifest fields', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
  });

  expect(isWebSnapshotManifest({ ...manifest, schemaVersion: 2 })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, id: 1 })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, capturedAt: null })).toBe(false);
  expect(isWebSnapshotManifest({ ...manifest, warnings: [1] })).toBe(false);
});

it('normalizes source and favicon URLs before manifest persistence', () => {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: {
      faviconUrl: 'https://example.com/favicon.ico?token=secret#hash',
      title: 'Page',
      url: 'https://example.com/path?session=secret#hash',
    },
  });

  expect(manifest.source).toEqual({
    faviconUrl: 'https://example.com/favicon.ico',
    title: 'Page',
    url: 'https://example.com/path',
  });
  expect(
    createWebSnapshotManifest({
      id: 'snapshot-2',
      source: { faviconUrl: 'javascript:alert(1)', title: 'Page', url: 'blob:unsafe' },
    }).source
  ).toEqual({ faviconUrl: null, title: 'Page', url: null });
});
