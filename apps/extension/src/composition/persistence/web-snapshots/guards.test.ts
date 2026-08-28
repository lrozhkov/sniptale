import { expect, it } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { isWebSnapshotRecord } from './guards';

function createManifest(): WebSnapshotManifest {
  return createPagePackageManifestFixture();
}

it('accepts only persisted web snapshot records with valid manifests and asset refs', () => {
  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-1',
      manifest: createManifest(),
      packageAssetId: 'package-asset',
      screenshotAssetId: 'screenshot-asset',
      screenshotMimeType: 'image/png',
      screenshotSize: 3,
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
      packageAssetId: '',
      screenshotAssetId: 'screenshot-asset',
      screenshotMimeType: 'image/png',
      screenshotSize: 3,
      size: 3,
      updatedAt: 2,
    })
  ).toBe(false);

  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-without-diagnostics',
      manifest: createPagePackageManifestFixture({ diagnosticsLevel: 'none' }),
      packageAssetId: 'package-asset',
      screenshotAssetId: 'screenshot-asset',
      screenshotMimeType: 'image/png',
      screenshotSize: 3,
      size: 3,
      updatedAt: 2,
    })
  ).toBe(true);

  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-1',
      manifest: createManifest(),
      packageAssetId: 'package-asset',
      screenshotAssetId: 'screenshot-asset',
      screenshotMimeType: 'image/webp',
      screenshotSize: 3,
      size: 3,
      updatedAt: 2,
    })
  ).toBe(false);

  expect(
    isWebSnapshotRecord({
      createdAt: 1,
      id: 'snapshot-1',
      manifest: createPagePackageManifestFixture({ intent: 'export' }),
      packageAssetId: 'package-asset',
      screenshotAssetId: 'screenshot-asset',
      screenshotMimeType: 'image/png',
      screenshotSize: 3,
      size: 3,
      updatedAt: 2,
    })
  ).toBe(false);
});
