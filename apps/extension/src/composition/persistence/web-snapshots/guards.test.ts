import { expect, it } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { isWebSnapshotRecord } from './guards';

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 3 },
    warnings: [],
  };
}

it('accepts only persisted web snapshot records with valid manifests and blobs', () => {
  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-1',
      manifest: createManifest(),
      packageBlob: new Blob(['zip']),
      size: 3,
      updatedAt: 2,
    })
  ).toBe(true);

  expect(isWebSnapshotRecord(null)).toBe(false);
  expect(isWebSnapshotRecord({ id: 'snapshot-1' })).toBe(false);
  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-1',
      manifest: createManifest(),
      packageBlob: 'zip',
      size: 3,
      updatedAt: 2,
    })
  ).toBe(false);
});
