import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { registerFrameAnnotationDraftFlusher } from '../../../frame-annotation/draft-coordinator';
import {
  type EditorDocumentHistoryController,
  type EditorDocumentResetController,
  redoEditorControllerSnapshot,
  resetEditorControllerToOriginal,
  undoEditorControllerSnapshot,
} from './history';

const mocks = vi.hoisted(() => ({
  redoSnapshot: vi.fn<(history: SnapshotHistory<string> | null) => EditorDocument | null>(
    () => null
  ),
  undoSnapshot: vi.fn<(history: SnapshotHistory<string> | null) => EditorDocument | null>(
    () => null
  ),
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
    version: 2,
  };
}

function createHistoryController(
  applyDocument = vi.fn(async () => undefined),
  publishHistoryDocument = vi.fn()
): EditorDocumentHistoryController {
  return {
    applyDocument,
    history: new SnapshotHistory('history'),
    publishHistoryDocument,
  };
}

function createResetController(
  applyDocument = vi.fn(async () => undefined),
  publishHistoryDocument = vi.fn()
): EditorDocumentResetController {
  return {
    applyDocument,
    originalDocument: createEditorDocument('original'),
    publishHistoryDocument,
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
    preserveViewport: true,
  });
  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('redo'), {
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
  });
  expect(applyDocument).toHaveBeenCalledWith(createEditorDocument('original'), {
    resetHistory: true,
    updateOriginal: true,
  });
  expect(historyController.publishHistoryDocument).toHaveBeenCalledWith(
    createEditorDocument('undo')
  );
  expect(historyController.publishHistoryDocument).toHaveBeenCalledWith(
    createEditorDocument('redo')
  );
  expect(resetController.publishHistoryDocument).toHaveBeenCalledWith(
    createEditorDocument('original')
  );
});

it('ignores missing history documents', async () => {
  const applyDocument = vi.fn(async () => undefined);
  const historyController = createHistoryController(applyDocument);
  const resetController: EditorDocumentResetController = {
    applyDocument,
    originalDocument: null,
    publishHistoryDocument: vi.fn(),
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
    publishHistoryDocument: vi.fn(),
  };
  const resetController: EditorDocumentResetController = {
    applyDocument,
    originalDocument: createEditorDocument('original'),
    publishHistoryDocument: vi.fn(),
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

it('undoes a pending frame comment draft before restoring the document', async () => {
  const original = createEditorDocument('original');
  const edited = createEditorDocument('comment-edited');
  const history = new SnapshotHistory(JSON.stringify(original));
  const flush = vi.fn(() => history.push(JSON.stringify(edited)));
  const unregister = registerFrameAnnotationDraftFlusher(flush);
  const applyDocument = vi.fn(async () => undefined);
  mocks.undoSnapshot.mockImplementationOnce((source) => {
    const state = source?.undo();
    return state ? (JSON.parse(state.current) as EditorDocument) : null;
  });

  try {
    await undoEditorControllerSnapshot({ applyDocument, history, publishHistoryDocument: vi.fn() });
    expect(flush).toHaveBeenCalledOnce();
    expect(applyDocument).toHaveBeenCalledWith(original, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
    expect(history.getState().canRedo).toBe(true);
  } finally {
    unregister();
  }
});

it('restores a drawn scene from an in-memory hydrated workspace snapshot', async () => {
  const original = {
    ...createEditorDocument('hydrated'),
    sourceImageData: 'blob:hydrated-source',
  };
  const drawn = { ...original, canvasJson: '{"version":"7.2.0","objects":[{"type":"rect"}]}' };
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(drawn));
  const actualHistory = await vi.importActual<typeof import('../../history')>('../../history');
  mocks.undoSnapshot.mockImplementationOnce(actualHistory.undoEditorSnapshot);
  const applyDocument = vi.fn(async () => undefined);
  const publishHistoryDocument = vi.fn();

  await undoEditorControllerSnapshot({ applyDocument, history, publishHistoryDocument });

  expect(applyDocument).toHaveBeenCalledWith(original, {
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
  });
  expect(publishHistoryDocument).toHaveBeenCalledWith(original);
  expect(history.getState().canRedo).toBe(true);
});

it('restores the history cursor when document application fails', async () => {
  const original = createEditorDocument('original');
  const edited = createEditorDocument('edited');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(edited));
  mocks.undoSnapshot.mockImplementationOnce((source) => {
    const state = source?.undo();
    return state ? (JSON.parse(state.current) as EditorDocument) : null;
  });
  let visibleDocument = edited.sourceName;
  const applyDocument = vi.fn(async (document: EditorDocument) => {
    visibleDocument = document.sourceName;
    if (document.sourceName === original.sourceName && applyDocument.mock.calls.length === 1) {
      throw new Error('load failed after canvas replacement');
    }
  });
  const publishedIndexes: number[] = [];
  const publishHistoryDocument = vi.fn(() => publishedIndexes.push(history.getState().index));

  await expect(
    undoEditorControllerSnapshot({ applyDocument, history, publishHistoryDocument })
  ).rejects.toThrow('load failed after canvas replacement');
  expect(visibleDocument).toBe(edited.sourceName);
  expect(applyDocument).toHaveBeenCalledTimes(2);
  expect(history.getState().current).toBe(JSON.stringify(edited));
  expect(history.getState().canUndo).toBe(true);
  expect(publishedIndexes).toEqual([1]);
});

it('restores the redo cursor when document application fails', async () => {
  const original = createEditorDocument('original');
  const edited = createEditorDocument('edited');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(edited));
  history.undo();
  mocks.redoSnapshot.mockImplementationOnce((source) => {
    const state = source?.redo();
    return state ? (JSON.parse(state.current) as EditorDocument) : null;
  });
  let visibleDocument = original.sourceName;
  const applyDocument = vi.fn(async (document: EditorDocument) => {
    visibleDocument = document.sourceName;
    if (document.sourceName === edited.sourceName && applyDocument.mock.calls.length === 1) {
      throw new Error('load failed after canvas replacement');
    }
  });
  const publishedIndexes: number[] = [];
  const publishHistoryDocument = vi.fn(() => publishedIndexes.push(history.getState().index));

  await expect(
    redoEditorControllerSnapshot({ applyDocument, history, publishHistoryDocument })
  ).rejects.toThrow('load failed after canvas replacement');
  expect(visibleDocument).toBe(original.sourceName);
  expect(applyDocument).toHaveBeenCalledTimes(2);
  expect(history.getState().current).toBe(JSON.stringify(original));
  expect(history.getState().canRedo).toBe(true);
  expect(publishedIndexes).toEqual([0]);
});
