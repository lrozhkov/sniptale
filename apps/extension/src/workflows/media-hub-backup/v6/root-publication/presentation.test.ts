import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readAssetFile: vi.fn() }));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readAssetFile,
}));

import { preparePortableAggregatePresentation } from './presentation';

beforeEach(() => {
  vi.clearAllMocks();
});

it('restores presentation blobs in the established thumbnail-then-preview order', async () => {
  const thumbnailBlob = new Blob(['thumbnail'], { type: 'image/png' });
  const previewBlob = new Blob(['preview'], { type: 'image/png' });
  mocks.readAssetFile.mockResolvedValueOnce(thumbnailBlob).mockResolvedValueOnce(previewBlob);
  const getObjectRef = vi.fn((objectId: string) => ({ assetId: objectId }));

  const restored = await preparePortableAggregatePresentation({
    getObjectRef: getObjectRef as never,
    invalidMessage: 'invalid presentation',
    metadata: {
      entry: {
        aggregateId: 'source-id',
        aggregateKind: 'scenario',
        presentationRevision: 2,
        updatedAt: 3,
      },
      previewObjectId: 'preview-object',
      thumbnailObjectId: 'thumbnail-object',
    },
    targetId: 'target-id',
  });
  expect(restored).toMatchObject({ aggregateId: 'target-id' });
  const thumbnailBytes = await thumbnailBlob.arrayBuffer();
  const previewBytes = await previewBlob.arrayBuffer();
  vi.spyOn(thumbnailBlob, 'arrayBuffer').mockRejectedValue(
    new DOMException('Staging file removed', 'NotFoundError')
  );
  vi.spyOn(previewBlob, 'arrayBuffer').mockRejectedValue(
    new DOMException('Staging file removed', 'NotFoundError')
  );
  expect(await restored!.thumbnailBlob.arrayBuffer()).toEqual(thumbnailBytes);
  expect(await restored!.previewBlob!.arrayBuffer()).toEqual(previewBytes);
  expect(restored!.thumbnailBlob.type).toBe(thumbnailBlob.type);
  expect(restored!.previewBlob!.type).toBe(previewBlob.type);
  expect(getObjectRef.mock.calls.map(([objectId]) => objectId)).toEqual([
    'thumbnail-object',
    'preview-object',
  ]);
  expect(mocks.readAssetFile).toHaveBeenNthCalledWith(
    1,
    { assetId: 'thumbnail-object' },
    'target-id-presentation-thumbnail'
  );
  expect(mocks.readAssetFile).toHaveBeenNthCalledWith(
    2,
    { assetId: 'preview-object' },
    'target-id-preview'
  );
});

it('preserves absent and invalid presentation outcomes', async () => {
  await expect(
    preparePortableAggregatePresentation({
      getObjectRef: vi.fn(),
      invalidMessage: 'invalid presentation',
      metadata: undefined,
      targetId: 'target-id',
    })
  ).resolves.toBeNull();

  mocks.readAssetFile.mockResolvedValue(new Blob(['thumbnail']));
  await expect(
    preparePortableAggregatePresentation({
      getObjectRef: vi.fn(() => ({ assetId: 'thumbnail-object' })) as never,
      invalidMessage: 'invalid presentation',
      metadata: {
        entry: {
          aggregateId: 'source-id',
          aggregateKind: 'invalid' as never,
          presentationRevision: 2,
          updatedAt: 3,
        },
        thumbnailObjectId: 'thumbnail-object',
      },
      targetId: 'target-id',
    })
  ).rejects.toThrow('invalid presentation');
});
