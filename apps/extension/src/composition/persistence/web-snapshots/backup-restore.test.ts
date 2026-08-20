import { expect, it, vi } from 'vitest';
import { createCleanupWebSnapshotRecord } from '../../../workflows/media-hub/cleanup.test-support';
import { putWebSnapshotBackupRestore } from './backup-restore';

it('publishes both immutable web snapshot objects through caller stores', async () => {
  const owner = vi.fn();
  const refPut = vi.fn();
  const record = {
    ...createCleanupWebSnapshotRecord('snapshot'),
    packageAssetId: 'package',
    screenshotAssetId: 'shot',
  };
  const ref = (assetId: string) => ({
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'application/octet-stream',
    sha256: null,
    size: 1,
  });
  const snapshotPut = vi.fn();
  await putWebSnapshotBackupRestore({
    ownerStore: { put: owner },
    packageRef: ref('package'),
    record,
    refStore: { put: refPut },
    screenshotRef: ref('shot'),
    snapshotStore: { put: snapshotPut },
  });
  expect(refPut).toHaveBeenCalledTimes(2);
  expect(owner).toHaveBeenCalledTimes(2);
  expect(snapshotPut).toHaveBeenCalledWith(record);
});
