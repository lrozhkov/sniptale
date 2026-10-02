import { beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture as createWebSnapshotManifest } from '../../../features/web-snapshot/manifest.test-support';
import { rows, harness } from '../media-library/delete-cascade.test-support';
const mocks = vi.hoisted(() => ({
  journals: vi.fn(async () => []),
  recover: vi.fn(async () => 0),
}));
vi.mock('../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets/opfs-store')>()),
  listReadyJournals: mocks.journals,
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: harness.complete,
  listReadyJournals: mocks.journals,
}));
vi.mock('./publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publication')>()),
  recoverWebSnapshotPublications: mocks.recover,
}));
import { deleteWebSnapshotMediaAsset } from './cleanup';
beforeEach(() => {
  rows.get('video_projects')!.clear();
  rows.get('media_library')!.clear();
  rows.get('media_library')!.set('asset-1', createMediaEntry());
  rows.set('web_snapshots', new Map([['snapshot-1', createStoredSnapshot()]]));
  rows.get('asset_owners')!.clear();
  for (const [role, assetId] of [
    ['package', 'package-asset'],
    ['screenshot', 'screenshot-asset'],
  ]) {
    rows.get('asset_owners')!.set(JSON.stringify(['web-snapshot', 'snapshot-1', role]), {
      role,
      assetId,
      ownerKind: 'web-snapshot',
      ownerId: 'snapshot-1',
    });
  }
});
it('retains the physical deletion intent after byte deletion fails', async () => {
  harness.complete.mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(
    deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' })
  ).rejects.toThrow('disk unavailable');
  expect(rows.get('web_snapshots')!.has('snapshot-1')).toBe(false);
  expect(rows.get('media_library')!.has('asset-1')).toBe(false);
  expect([...rows.get('asset_operations')!.values()]).toContainEqual(
    expect.objectContaining({ assetIds: ['package-asset', 'screenshot-asset'] })
  );
});
it.each(['invalid-source', 'mismatched-root'])(
  'preserves the graph on source admission failure: %s',
  async (failure) => {
    if (failure === 'invalid-source')
      rows.get('web_snapshots')!.set('snapshot-1', { invalid: true });
    else
      rows
        .get('media_library')!
        .set('asset-1', { ...createMediaEntry(), source: { kind: 'screenshot' } });
    await expect(
      deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' })
    ).rejects.toMatchObject({ reason: 'source-unavailable' });
    expect(rows.get('media_library')!.has('asset-1')).toBe(true);
    expect(rows.get('web_snapshots')!.has('snapshot-1')).toBe(true);
    expect(harness.complete).not.toHaveBeenCalled();
  }
);
it('retains bytes owned by another document', async () => {
  for (const assetId of ['package-asset', 'screenshot-asset'])
    rows.get('asset_owners')!.set(JSON.stringify(['image-workspace', 'copy', assetId]), {
      assetId,
      ownerKind: 'image-workspace',
      ownerId: 'copy',
      role: assetId,
    });
  await deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' });
  expect(harness.complete).not.toHaveBeenCalled();
  expect(rows.get('asset_owners')!.size).toBe(2);
});

function createStoredSnapshot() {
  return {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com/' },
    }),
    packageAssetId: 'package-asset',
    screenshotAssetId: 'screenshot-asset',
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: 5,
    updatedAt: 2,
  };
}

function createMediaEntry() {
  return {
    createdAt: 1,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'asset-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-page-package+zip',
    originalFilename: 'snapshot.zip',
    size: 5,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: null,
  };
}
