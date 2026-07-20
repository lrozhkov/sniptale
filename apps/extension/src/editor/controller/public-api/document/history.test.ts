import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import {
  type EditorDocumentHistoryController,
  type EditorDocumentResetController,
  redoEditorControllerSnapshot,
  resetEditorControllerToOriginal,
  undoEditorControllerSnapshot,
} from './history';

const mocks = vi.hoisted(() => ({
  redoSnapshot: vi.fn<() => EditorDocument | null>(() => null),
  undoSnapshot: vi.fn<() => EditorDocument | null>(() => null),
}));

vi.mock('../../history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../history')>()),
  redoEditorSnapshot: mocks.redoSnapshot,
  undoEditorSnapshot: mocks.undoSnapshot,
}));

function createEditorDocument(sourceName: string): EditorDocument {
  return {
    canvasHeight: 180,
    canvasJson: '{}',
    canvasWidth: 320,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceDisplayHeight: 180,
    sourceDisplayWidth: 320,
    sourceHeight: 180,
    sourceImageData: 'data:image/png;base64,abc',
    sourceLeft: 0,
    sourceName,
    sourceTop: 0,
    sourceWidth: 320,
    version: 1,
  };
}

function createHistoryController(
  applyDocument = vi.fn(async () => undefined)
): EditorDocumentHistoryController {
  return {
    applyDocument,
    history: new SnapshotHistory('history'),
  };
}

function createResetController(
  applyDocument = vi.fn(async () => undefined)
): EditorDocumentResetController {
  return {
    applyDocument,
    originalDocument: createEditorDocument('original'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.undoSnapshot.mockReturnValue(createEditorDocument('undo'));
  mocks.redoSnapshot.mockReturnValue(createEditorDocument('redo'));
});

it('applies available undo, redo, and original documents with expected history options', async () => {
  const applyDocument = vi.fn(async () => undefined);
  const historyController = createHistoryController(applyDocument);
  const resetController = createResetController(applyDocument);

  await undoEditorControllerSnapshot(historyController);
  await redoEditorControllerSnapshot(historyController);
  await resetEditorControllerToOriginal(resetController);

  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('undo'), {
    resetHistory: false,
    updateOriginal: false,
  });
  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('redo'), {
    resetHistory: false,
    updateOriginal: false,
  });
  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('original'), {
    resetHistory: true,
    updateOriginal: true,
  });
});

it('ignores missing history documents', async () => {
  const applyDocument = vi.fn(async () => undefined);
  const historyController = createHistoryController(applyDocument);
  const resetController: EditorDocumentResetController = {
    applyDocument,
    originalDocument: null,
  };
  mocks.undoSnapshot.mockReturnValueOnce(null);
  mocks.redoSnapshot.mockReturnValueOnce(null);

  await undoEditorControllerSnapshot(historyController);
  await redoEditorControllerSnapshot(historyController);
  await resetEditorControllerToOriginal(resetController);

  expect(applyDocument).not.toHaveBeenCalled();
});

it('keeps history actions on narrow history and original document slices', async () => {
  const applyDocument = vi.fn(async () => undefined);
  const historyController: EditorDocumentHistoryController = {
    applyDocument,
    history: null,
  };
  const resetController: EditorDocumentResetController = {
    applyDocument,
    originalDocument: createEditorDocument('original'),
  };

  await undoEditorControllerSnapshot(historyController);
  await redoEditorControllerSnapshot(historyController);
  await resetEditorControllerToOriginal(resetController);

  expect(mocks.undoSnapshot).toHaveBeenCalledWith(null);
  expect(mocks.redoSnapshot).toHaveBeenCalledWith(null);
  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('original'), {
    resetHistory: true,
    updateOriginal: true,
  });
});
