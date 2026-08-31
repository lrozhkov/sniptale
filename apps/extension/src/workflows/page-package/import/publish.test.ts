import { beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { importWebSnapshotPackage } from './publish';

const mocks = vi.hoisted(() => ({
  createSink: vi.fn(),
  discard: vi.fn(),
  ensureHeadroom: vi.fn(),
  inspect: vi.fn(),
  readAsset: vi.fn(),
  rebuild: vi.fn(),
  save: vi.fn(),
  writeArchive: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  createPreparedAssetArchiveSink: mocks.createSink,
  discardPreparedAsset: mocks.discard,
  readAssetFile: mocks.readAsset,
}));
vi.mock('../../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
}));
vi.mock('../../media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/store')>()),
  saveWebSnapshotMediaAssetSafely: mocks.save,
}));
vi.mock('../archive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../archive')>()),
  writePagePackageArchive: mocks.writeArchive,
}));
vi.mock('./inspect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inspect')>()),
  inspectWebSnapshotImport: mocks.inspect,
}));
vi.mock('./rebuild', () => ({ rebuildWebSnapshotImport: mocks.rebuild }));

const manifest = createPagePackageManifestFixture({ id: 'local-id' });
const pagePackage = {
  entries: [],
  manifest,
  manifestBytes: new Uint8Array(),
  manifestSha256: '0'.repeat(64),
  manifestText: '{}',
};
const screenshotBlob = new Blob(['png'], { type: 'image/png' });
const inputFile = new File(['zip'], 'input.sniptale-page-package.zip');
const rebuiltFile = new File(['rebuilt'], 'Snapshot.sniptale-page-package.zip', {
  type: 'application/x-sniptale-page-package+zip',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSink.mockResolvedValue({
    preparedAsset: () => ({ ref: { assetId: 'stage-id' } }),
    sink: { abort: vi.fn(), close: vi.fn(), writable: new WritableStream() },
  });
  mocks.rebuild.mockResolvedValue({ localId: 'local-id', pagePackage, screenshotBlob });
  mocks.readAsset.mockResolvedValue(rebuiltFile);
  mocks.save.mockResolvedValue({ assetId: 'local-id' });
});

it('revalidates a rebuilt package, discards staging, and publishes through the atomic owner', async () => {
  await expect(importWebSnapshotPackage(inputFile)).resolves.toEqual({ assetId: 'local-id' });

  expect(mocks.writeArchive).toHaveBeenCalledOnce();
  expect(mocks.discard).toHaveBeenCalledWith('stage-id');
  expect(mocks.inspect).toHaveBeenCalledWith(rebuiltFile, undefined);
  expect(mocks.ensureHeadroom).toHaveBeenCalledWith(rebuiltFile.size + screenshotBlob.size);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'local-id',
      manifest,
      packageBlob: rebuiltFile,
      screenshotBlob,
    }),
    expect.any(Function)
  );
  expect(mocks.discard.mock.invocationCallOrder[0]!).toBeLessThan(
    mocks.save.mock.invocationCallOrder[0]!
  );
});

it('discards staged bytes when the rebuilt package cannot be read', async () => {
  mocks.readAsset.mockRejectedValue(new Error('read failed'));

  await expect(importWebSnapshotPackage(inputFile)).rejects.toThrow('read failed');
  expect(mocks.discard).toHaveBeenCalledWith('stage-id');
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not publish when rebuilt hostile validation fails', async () => {
  mocks.inspect.mockRejectedValue(new Error('rebuilt package invalid'));

  await expect(importWebSnapshotPackage(inputFile)).rejects.toThrow('rebuilt package invalid');
  expect(mocks.discard).toHaveBeenCalledWith('stage-id');
  expect(mocks.save).not.toHaveBeenCalled();
});
