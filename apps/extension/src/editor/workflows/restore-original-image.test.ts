import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { beginEditorDocumentOpenOperation } from '../document/file-actions/operation';
import { useEditorStore } from '../state/useEditorStore';

const readOriginal = vi.hoisted(() => vi.fn());
vi.mock('../../composition/persistence/image-aggregates', () => ({
  readImageAggregateOriginalDocument: readOriginal,
}));

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
    autosaveService: { getDurableRevision: () => 7 },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  await restoreOriginalEditorImage(controller, 'image-1');

  expect(readOriginal).toHaveBeenCalledWith('image-1');
  expect(controller.restoreOriginalDocument).toHaveBeenCalledWith(original, expect.any(Function));
});

it('uses the opening document before the first save and refuses a missing persisted original', async () => {
  useEditorStore.getState().setSessionId('new-draft');
  const original = createEditorDocumentFixture();
  readOriginal.mockResolvedValue(null);
  const controller = {
    originalDocument: original,
    autosaveService: { getDurableRevision: vi.fn(() => 0) },
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
    autosaveService: { getDurableRevision: () => 2 },
    restoreOriginalDocument: vi.fn(async () => undefined),
  };

  const pending = restoreOriginalEditorImage(controller, 'image-A');
  beginEditorDocumentOpenOperation(controller);
  finishRead(openingDocument);

  await expect(pending).rejects.toThrow('Editor document changed during restoration.');
  expect(controller.restoreOriginalDocument).not.toHaveBeenCalled();
});
