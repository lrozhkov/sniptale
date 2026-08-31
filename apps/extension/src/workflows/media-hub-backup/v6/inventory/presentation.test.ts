import { expect, it, vi } from 'vitest';
import { buildPortableAggregatePresentation } from './presentation';

it('encodes aggregate presentation blobs through one inventory owner', async () => {
  const previewBlob = new Blob(['preview'], { type: 'image/png' });
  const thumbnailBlob = new Blob(['thumbnail'], { type: 'image/png' });
  const addObject = vi
    .fn()
    .mockReturnValueOnce('preview-object')
    .mockReturnValueOnce('thumbnail-object');
  const db = {
    get: vi.fn(async () => ({
      aggregateId: 'project-1',
      aggregateKind: 'scenario',
      presentationRevision: 3,
      previewBlob,
      thumbnailBlob,
      updatedAt: 42,
    })),
  };

  await expect(
    buildPortableAggregatePresentation({
      addObject,
      aggregateId: 'project-1',
      aggregateKind: 'scenario',
      db,
    })
  ).resolves.toEqual({
    entry: {
      aggregateId: 'project-1',
      aggregateKind: 'scenario',
      presentationRevision: 3,
      updatedAt: 42,
    },
    previewObjectId: 'preview-object',
    thumbnailObjectId: 'thumbnail-object',
  });
  expect(addObject).toHaveBeenNthCalledWith(1, previewBlob, 'project-1-preview', 'image/png');
  expect(addObject).toHaveBeenNthCalledWith(
    2,
    thumbnailBlob,
    'project-1-presentation-thumbnail',
    'image/png'
  );
});

it('does not publish invalid presentation rows', async () => {
  await expect(
    buildPortableAggregatePresentation({
      addObject: vi.fn(),
      aggregateId: 'project-1',
      aggregateKind: 'video-project',
      db: { get: vi.fn(async () => ({ aggregateId: 'project-1' })) },
    })
  ).resolves.toBeUndefined();
});
