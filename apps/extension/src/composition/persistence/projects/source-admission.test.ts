import { expect, it, vi } from 'vitest';
import { assertPreparedProjectAssetSources } from './source-admission';
import { createMediaLibraryEntry, createProjectAssetEntry } from './index.test-support';
const ref = {
  assetId: 'body',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/body' },
  mimeType: 'image/png',
  sha256: null,
  size: 3,
};
const entry = createProjectAssetEntry({
  id: 'shared',
  assetId: ref.assetId,
  size: ref.size,
  mimeType: ref.mimeType,
});
const fixture = () => ({
  assets: { get: vi.fn(async (): Promise<unknown> => entry) },
  media: {
    get: vi.fn(async (): Promise<unknown> =>
      createMediaLibraryEntry({
        id: 'project-asset:shared',
        source: { kind: 'project-asset', projectAssetId: entry.id },
      })
    ),
  },
  refs: { get: vi.fn(async (): Promise<unknown> => ref) },
});
it.each([
  'missing-media',
  'different-media',
  'different-kind',
  'different-source',
  'missing-row',
  'different-row-id',
  'different-bytes',
  'different-size',
  'different-mime',
  'missing-ref',
  'different-ref',
] as const)('rejects changed prepared sharing before writes: %s', async (state) => {
  const stores = fixture();
  if (state === 'missing-media') stores.media.get.mockResolvedValue(undefined);
  if (state === 'different-media')
    stores.media.get.mockResolvedValue(createMediaLibraryEntry({ id: 'different' }));
  if (state === 'different-kind')
    stores.media.get.mockResolvedValue(
      createMediaLibraryEntry({ id: 'project-asset:shared', source: { kind: 'screenshot' } })
    );
  if (state === 'different-source')
    stores.media.get.mockResolvedValue(
      createMediaLibraryEntry({
        id: 'project-asset:shared',
        source: { kind: 'project-asset', projectAssetId: 'different' },
      })
    );
  if (state === 'missing-row') stores.assets.get.mockResolvedValue(undefined);
  if (state === 'different-row-id')
    stores.assets.get.mockResolvedValue({ ...entry, id: 'different' });
  if (state === 'different-bytes')
    stores.assets.get.mockResolvedValue({ ...entry, assetId: 'replaced' });
  if (state === 'different-size') stores.assets.get.mockResolvedValue({ ...entry, size: 4 });
  if (state === 'different-mime')
    stores.assets.get.mockResolvedValue({ ...entry, mimeType: 'image/jpeg' });
  if (state === 'missing-ref') stores.refs.get.mockResolvedValue(undefined);
  if (state === 'different-ref')
    stores.refs.get.mockResolvedValue({
      ...ref,
      assetId: 'foreign',
      location: { kind: 'opfs', objectKey: 'objects/foreign' },
    });
  await expect(
    assertPreparedProjectAssetSources([{ entry, ref, reusePublished: true }], stores)
  ).rejects.toThrow('changed after preparation');
});
it('admits unchanged shared identity and bytes', async () => {
  await expect(
    assertPreparedProjectAssetSources([{ entry, ref, reusePublished: true }], fixture())
  ).resolves.toBeUndefined();
});
it.each(['missing', 'invalid', 'different'] as const)(
  'refuses a private origin changed after preparation: %s',
  async (state) => {
    const stores = fixture();
    stores.media.get.mockResolvedValue(
      state === 'missing'
        ? undefined
        : state === 'invalid'
          ? { id: 'origin' }
          : createMediaLibraryEntry({ id: 'different' })
    );
    await expect(
      assertPreparedProjectAssetSources(
        [{ entry: { ...entry, originMediaId: 'origin' }, ref, publishToLibrary: false }],
        stores
      )
    ).rejects.toThrow('Private project source changed');
  }
);
it('admits private origins restored atomically with their own root', async () => {
  const stores = fixture();
  stores.media.get.mockResolvedValue(undefined);
  await expect(
    assertPreparedProjectAssetSources(
      [{ entry: { ...entry, originMediaId: 'own-root' }, ref, publishToLibrary: false }],
      stores,
      'own-root'
    )
  ).resolves.toBeUndefined();
  expect(stores.media.get).not.toHaveBeenCalled();
});

it('refuses publishing a private acquisition as an independent card', async () => {
  await expect(
    assertPreparedProjectAssetSources(
      [{ entry: { ...entry, originMediaId: 'project-asset:shared' }, ref }],
      fixture()
    )
  ).rejects.toThrow('cannot publish');
});

it('admits private acquisition with a still-existing original identity', async () => {
  await expect(
    assertPreparedProjectAssetSources(
      [
        {
          entry: { ...entry, originMediaId: 'project-asset:shared' },
          ref,
          publishToLibrary: false,
        },
      ],
      fixture()
    )
  ).resolves.toBeUndefined();
});
it.each(['size', 'mimeType'] as const)(
  'refuses immutable ref metadata changed after preparation: %s',
  async (field) => {
    const stores = fixture();
    stores.refs.get.mockResolvedValue({ ...ref, [field]: field === 'size' ? 4 : 'image/jpeg' });
    await expect(
      assertPreparedProjectAssetSources([{ entry, ref, reusePublished: true }], stores)
    ).rejects.toThrow('bytes changed');
  }
);
it('refuses prepared source evidence associated with a different byte object', async () => {
  await expect(
    assertPreparedProjectAssetSources(
      [{ entry: { ...entry, assetId: 'different' }, ref, reusePublished: true }],
      fixture()
    )
  ).rejects.toThrow('source changed');
});
