import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { promoteEditorImageToLibrary } from './promote-image-to-library';

const mocks = vi.hoisted(() => ({
  commit: vi.fn(async () => undefined),
  promote: vi.fn(async () => undefined),
  thumbnail: vi.fn(async () => new Blob(['thumbnail'])),
  toBlob: vi.fn(async () => new Blob(['preview'])),
}));

vi.mock('../../composition/persistence/image-aggregates', () => ({
  commitImagePresentation: mocks.commit,
  promoteImageAggregate: mocks.promote,
}));
vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.toBlob,
}));
vi.mock('../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: mocks.thumbnail,
}));

beforeEach(() => vi.clearAllMocks());

it('flushes, commits presentation, and promotes in durable revision order', async () => {
  const order: string[] = [];
  mocks.commit.mockImplementation(async () => void order.push('commit'));
  mocks.promote.mockImplementation(async () => void order.push('promote'));
  const serializeDocument = vi.fn(createEditorDocumentFixture);

  await promoteEditorImageToLibrary({
    aggregateId: 'image-1',
    port: {
      flushAutosave: async (serialize) => {
        order.push('flush');
        serialize();
      },
      getDurableRevision: () => 4,
      renderPresentation: async () => 'data:image/png;base64,YQ==',
      serializeDocument,
    },
  });

  expect(order).toEqual(['flush', 'commit', 'promote']);
  expect(serializeDocument).toHaveBeenCalledOnce();
  expect(mocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-1', expectedWorkspaceRevision: 4 })
  );
  expect(mocks.promote).toHaveBeenCalledWith('image-1', 4);
});

it('stops before presentation and promotion when no durable revision exists', async () => {
  await expect(
    promoteEditorImageToLibrary({
      aggregateId: 'image-1',
      port: {
        flushAutosave: vi.fn(async () => undefined),
        getDurableRevision: () => null,
        renderPresentation: vi.fn(async () => 'data:image/png;base64,YQ=='),
        serializeDocument: vi.fn(createEditorDocumentFixture),
      },
    })
  ).rejects.toThrow('revision');

  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.promote).not.toHaveBeenCalled();
});

it('does not promote when presentation commit fails', async () => {
  mocks.commit.mockRejectedValueOnce(new Error('commit failed'));

  await expect(
    promoteEditorImageToLibrary({
      aggregateId: 'image-1',
      port: {
        flushAutosave: vi.fn(async () => undefined),
        getDurableRevision: () => 4,
        renderPresentation: vi.fn(async () => 'data:image/png;base64,YQ=='),
        serializeDocument: vi.fn(createEditorDocumentFixture),
      },
    })
  ).rejects.toThrow('commit failed');

  expect(mocks.promote).not.toHaveBeenCalled();
});
