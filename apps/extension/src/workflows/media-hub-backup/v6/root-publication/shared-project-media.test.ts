import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../../../../composition/persistence/projects/index.test-support';
import type { AssetRef } from '../../../../composition/persistence/assets';
const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => ({ get: mocks.get }),
}));
vi.mock('../../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.read,
}));
import {
  assertMatchingArchiveAsset,
  readSharedProjectAsset,
  restoredOriginMediaId,
} from './shared-project-media';
const staged: AssetRef = {
  assetId: 'staged',
  createdAt: 1,
  location: { kind: 'opfs', objectKey: 'objects/staged' },
  mimeType: 'audio/webm',
  size: 3,
  sha256: null,
};
const shared: AssetRef = {
  ...staged,
  assetId: 'stored',
  location: { kind: 'opfs', objectKey: 'objects/stored' },
};
const roots = { 'media:library-item:project-asset:old': 'project-asset:new' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockImplementation(async (store: string) =>
    store === 'media_library'
      ? createMediaLibraryEntry({
          id: 'project-asset:new',
          source: { kind: 'project-asset', projectAssetId: 'new' },
        })
      : store === 'project_assets'
        ? createProjectAssetEntry({
            id: 'new',
            assetId: 'stored',
            mimeType: shared.mimeType,
            size: shared.size,
          })
        : shared
  );
  mocks.read.mockResolvedValue(new File(['abc'], 'source', { type: staged.mimeType }));
});
it('reuses only the explicitly remapped published source with matching bytes', async () => {
  const result = await readSharedProjectAsset('project-asset:old', roots, staged);
  expect(result.entry.id).toBe('new');
  expect(result.ref.assetId).toBe('stored');
});
it.each(['missing-root', 'wrong-source', 'wrong-ref', 'different-bytes'] as const)(
  'rejects an invalid shared source before publication: %s',
  async (kind) => {
    if (kind === 'wrong-source')
      mocks.get.mockResolvedValue(
        createMediaLibraryEntry({ id: 'project-asset:new', source: { kind: 'screenshot' } })
      );
    if (kind === 'wrong-ref')
      mocks.get.mockImplementation(async (store: string) =>
        store === 'media_library'
          ? createMediaLibraryEntry({
              id: 'project-asset:new',
              source: { kind: 'project-asset', projectAssetId: 'new' },
            })
          : store === 'project_assets'
            ? createProjectAssetEntry({
                id: 'new',
                assetId: 'stored',
                mimeType: shared.mimeType,
                size: 3,
              })
            : { ...shared, assetId: 'foreign' }
      );
    if (kind === 'different-bytes')
      mocks.read.mockImplementation(
        async (ref: AssetRef) => new File([ref.assetId === 'staged' ? 'abc' : 'abd'], 'source')
      );
    await expect(
      readSharedProjectAsset('project-asset:old', kind === 'missing-root' ? {} : roots, staged)
    ).rejects.toThrow();
  }
);
it('rejects a size mismatch before loading files', async () => {
  await expect(assertMatchingArchiveAsset(staged, { ...shared, size: 4 })).rejects.toThrow();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('checks content across chunk boundaries', async () => {
  const left = new Uint8Array(1024 * 1024 + 1);
  const right = left.slice();
  right[right.length - 1] = 1;
  mocks.read.mockImplementation(
    async (ref: AssetRef) => new File([ref.assetId === 'staged' ? left : right], 'source')
  );
  await expect(
    assertMatchingArchiveAsset({ ...staged, size: left.length }, { ...shared, size: right.length })
  ).rejects.toThrow();
});
it('remaps private origins and rejects missing origin roots', () => {
  expect(restoredOriginMediaId('project-asset:old', roots)).toEqual({
    originMediaId: 'project-asset:new',
  });
  expect(() => restoredOriginMediaId('missing', roots)).toThrow();
});
