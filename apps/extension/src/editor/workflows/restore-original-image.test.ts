import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { beginEditorDocumentOpenOperation } from '../document/file-actions/operation';
import { useEditorStore } from '../state/useEditorStore';

const persistence = vi.hoisted(() => ({
  commitPresentation: vi.fn(async () => undefined),
  getBlob: vi.fn(async (_aggregateId: string) => new Blob(['original'], { type: 'image/png' })),
  readOriginal: vi.fn(),
  thumbnail: vi.fn(async () => new Blob(['thumb'], { type: 'image/png' })),
}));
vi.mock('../../composition/persistence/image-aggregates', () => ({
  commitImagePresentation: persistence.commitPresentation,
  readImageAggregateOriginalDocument: persistence.readOriginal,
}));
vi.mock('../../composition/persistence/image-workspaces/read', () => ({
  readImageOriginalSource: async (aggregateId: string) => ({
    blob: await persistence.getBlob(aggregateId),
  }),
}));
vi.mock('../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: persistence.thumbnail,
}));

const readOriginal = persistence.readOriginal;

import { restoreOriginalEditorImage } from './restore-original-image';

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.getState().setSessionId(null);
});

it('uses immutable asset bytes after reopening a persisted draft', async () => {
  useEditorStore.getState().setSessionId('image-1');
  const original = createEditorDocumentFixture();
  const edited = { ...original, sourceName: 'edited' };
  readOriginal.mockResolvedValue(original);
  const controller = {
    originalDocument: edited,
    autosaveService: { getDurableRevision: () => 7, getSourceGeneration: () => null },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  await restoreOriginalEditorImage(controller, 'image-1');

  expect(readOriginal).toHaveBeenCalledWith('image-1');
  expect(controller.restoreOriginalDocument).toHaveBeenCalledWith(original, expect.any(Function));
});

it('publishes the original preview at the committed workspace revision before completing restore', async () => {
  useEditorStore.getState().setSessionId('image-1');
  const original = createEditorDocumentFixture();
  readOriginal.mockResolvedValue(original);
  let revision = 7;
  const controller = {
    originalDocument: original,
    autosaveService: {
      getDurableRevision: vi.fn(() => revision),
      getSourceGeneration: () => 'opened-generation',
    },
    restoreOriginalDocument: vi.fn(async () => {
      revision = 8;
    }),
  };

  await restoreOriginalEditorImage(controller, 'image-1');

  expect(persistence.commitPresentation).toHaveBeenCalledWith({
    aggregateId: 'image-1',
    expectedWorkspaceRevision: 8,
    expectedGeneration: 'opened-generation',
    previewBlob: expect.any(Blob),
    thumbnailBlob: expect.any(Blob),
  });
});

it('keeps the restored document when advisory preview generation fails', async () => {
  useEditorStore.getState().setSessionId('image-1');
  readOriginal.mockResolvedValue(createEditorDocumentFixture());
  persistence.commitPresentation.mockRejectedValueOnce(new Error('preview unavailable'));
  const controller = {
    originalDocument: createEditorDocumentFixture(),
    autosaveService: { getDurableRevision: () => 2, getSourceGeneration: () => null },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  await expect(restoreOriginalEditorImage(controller, 'image-1')).resolves.toBeUndefined();
  expect(controller.restoreOriginalDocument).toHaveBeenCalledOnce();
});

it('keeps the committed lifetime while original preview bytes are being read', async () => {
  useEditorStore.getState().setSessionId('image-1');
  const original = createEditorDocumentFixture();
  readOriginal.mockResolvedValue(original);
  let generation = 'opened';
  const entered = Promise.withResolvers<void>();
  const bytes = Promise.withResolvers<Blob>();
  persistence.getBlob.mockImplementationOnce(() => {
    entered.resolve();
    return bytes.promise;
  });
  const operation = restoreOriginalEditorImage(
    {
      originalDocument: original,
      autosaveService: { getDurableRevision: () => 8, getSourceGeneration: () => generation },
      restoreOriginalDocument: async () => undefined,
    },
    'image-1'
  );
  await entered.promise;
  generation = 'replacement';
  bytes.resolve(new Blob(['original'], { type: 'image/png' }));
  await operation;
  expect(persistence.commitPresentation).toHaveBeenCalledWith(
    expect.objectContaining({ expectedGeneration: 'opened' })
  );
});

it('uses the opening document before the first save and refuses a missing persisted original', async () => {
  useEditorStore.getState().setSessionId('new-draft');
  const original = createEditorDocumentFixture();
  readOriginal.mockResolvedValue(null);
  const controller = {
    originalDocument: original,
    autosaveService: { getDurableRevision: vi.fn(() => 0), getSourceGeneration: () => null },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  await restoreOriginalEditorImage(controller, 'new-draft');
  expect(controller.restoreOriginalDocument).toHaveBeenCalledWith(original, expect.any(Function));

  controller.autosaveService.getDurableRevision.mockReturnValue(4);
  await expect(restoreOriginalEditorImage(controller, 'missing-asset')).rejects.toThrow(
    'Original image is unavailable.'
  );
  expect(controller.restoreOriginalDocument).toHaveBeenCalledOnce();
});

it('rejects a restore when a different image starts opening while source bytes are read', async () => {
  useEditorStore.getState().setSessionId('image-A');
  let finishRead: (document: ReturnType<typeof createEditorDocumentFixture>) => void = () =>
    undefined;
  readOriginal.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      })
  );
  const openingDocument = createEditorDocumentFixture();
  const controller = {
    originalDocument: openingDocument,
    autosaveService: { getDurableRevision: () => 2, getSourceGeneration: () => null },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  const pending = restoreOriginalEditorImage(controller, 'image-A');
  beginEditorDocumentOpenOperation(controller);
  finishRead(openingDocument);

  await expect(pending).rejects.toThrow('Editor document changed during restoration.');
  expect(controller.restoreOriginalDocument).not.toHaveBeenCalled();
});
