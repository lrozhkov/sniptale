// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { Canvas, FabricImage } from 'fabric';
import { createRasterTargetAdapter } from '../../../raster-editing/adapters';
import { createEditorRasterMetadata } from '../../../raster-editing/image-state';
import { mountEditorRasterRuntime } from '../../../raster-editing/runtime';
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
  seekEditorControllerSnapshot,
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
  const history = new SnapshotHistory(JSON.stringify(createEditorDocument('original')));
  history.push(JSON.stringify(createEditorDocument('edited')));
  return {
    applyDocument,
    history,
    publishHistoryDocument,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.undoSnapshot.mockReturnValue(createEditorDocument('undo'));
  mocks.redoSnapshot.mockReturnValue(createEditorDocument('redo'));
});

it('jumps across several actions with one apply and publication, preserving Redo', async () => {
  const controller = createResetController();
  controller.history!.push(JSON.stringify(createEditorDocument('third')));
  controller.history!.push(JSON.stringify(createEditorDocument('fourth')));
  await seekEditorControllerSnapshot(controller, 0);
  expect(controller.applyDocument).toHaveBeenCalledTimes(1);
  expect(controller.publishHistoryDocument).toHaveBeenCalledTimes(1);
  expect(controller.publishHistoryDocument).toHaveBeenCalledWith(createEditorDocument('original'));
  expect(controller.history!.getState()).toMatchObject({ index: 0, canRedo: true, size: 4 });
  await seekEditorControllerSnapshot(controller, 3);
  expect(controller.publishHistoryDocument).toHaveBeenLastCalledWith(
    createEditorDocument('fourth')
  );
});

it('restores the previous document and cursor when a history jump fails, allowing retry', async () => {
  const apply = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('load refused'));
  const controller = createResetController(apply);
  await expect(seekEditorControllerSnapshot(controller, 0)).rejects.toThrow('load refused');
  expect(apply).toHaveBeenLastCalledWith(
    createEditorDocument('edited'),
    expect.objectContaining({ resetHistory: false })
  );
  expect(controller.history!.getState().index).toBe(1);
  expect(controller.publishHistoryDocument).toHaveBeenCalledWith(createEditorDocument('edited'));
  await seekEditorControllerSnapshot(controller, 0);
  expect(controller.history!.getState().index).toBe(0);
});

it('does not apply or publish when a jump selects the current or an invalid position', async () => {
  const controller = createResetController();
  for (const index of [1, -1, 2, Number.NaN]) await seekEditorControllerSnapshot(controller, index);
  expect(controller.applyDocument).not.toHaveBeenCalled();
  expect(controller.publishHistoryDocument).not.toHaveBeenCalled();
});

it('applies available undo, redo, and first-history documents with expected options', async () => {
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
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
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
    history: null,
    publishHistoryDocument: vi.fn(),
  };
  mocks.undoSnapshot.mockReturnValueOnce(null);
  mocks.redoSnapshot.mockReturnValueOnce(null);

  await undoEditorControllerSnapshot(historyController);
  await redoEditorControllerSnapshot(historyController);
  await resetEditorControllerToOriginal(resetController);

  expect(applyDocument).not.toHaveBeenCalled();
});

it('keeps history actions on narrow history slices', async () => {
  const applyDocument = vi.fn(async () => undefined);
  const historyController: EditorDocumentHistoryController = {
    applyDocument,
    history: null,
    publishHistoryDocument: vi.fn(),
  };
  const resetController: EditorDocumentResetController = {
    applyDocument,
    history: null,
    publishHistoryDocument: vi.fn(),
  };

  await undoEditorControllerSnapshot(historyController);
  await redoEditorControllerSnapshot(historyController);
  await resetEditorControllerToOriginal(resetController);

  expect(mocks.undoSnapshot).toHaveBeenCalledWith(null);
  expect(mocks.redoSnapshot).toHaveBeenCalledWith(null);
  expect(applyDocument).toHaveBeenCalledTimes(2);
});

it('returns to the first snapshot without creating an action and redoes edits in order', async () => {
  const original = createEditorDocument('original');
  const firstEdit = createEditorDocument('first edit');
  const secondEdit = createEditorDocument('second edit');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(firstEdit));
  history.push(JSON.stringify(secondEdit));
  const applyDocument = vi.fn(async () => undefined);
  const publishHistoryDocument = vi.fn();
  const controller = { applyDocument, history, originalDocument: original, publishHistoryDocument };
  const actualHistory = await vi.importActual<typeof import('../../history')>('../../history');
  mocks.redoSnapshot.mockImplementation(actualHistory.redoEditorSnapshot);

  await resetEditorControllerToOriginal(controller);
  expect(history.getState()).toMatchObject({ canRedo: true, canUndo: false, index: 0, size: 3 });
  expect(history.getState().current).toBe(JSON.stringify(original));
  expect(applyDocument).toHaveBeenCalledTimes(1);

  await redoEditorControllerSnapshot(controller);
  expect(history.getState()).toMatchObject({ canRedo: true, canUndo: true, index: 1, size: 3 });
  expect(applyDocument).toHaveBeenLastCalledWith(firstEdit, {
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
  });

  await redoEditorControllerSnapshot(controller);
  expect(history.getState()).toMatchObject({ canRedo: false, canUndo: true, index: 2, size: 3 });
  expect(applyDocument).toHaveBeenLastCalledWith(secondEdit, {
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
  });
  expect(publishHistoryDocument).toHaveBeenCalledTimes(3);
});

it('keeps future edits after returning from a partially undone state', async () => {
  const original = createEditorDocument('original');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(createEditorDocument('first edit')));
  history.push(JSON.stringify(createEditorDocument('second edit')));
  history.undo();
  const applyDocument = vi.fn(async () => undefined);

  await resetEditorControllerToOriginal({
    applyDocument,
    history,
    publishHistoryDocument: vi.fn(),
  });

  expect(history.getState()).toMatchObject({ index: 0, size: 3, canRedo: true });
  expect(applyDocument).toHaveBeenCalledOnce();
  history.redo();
  expect(history.getState().current).toBe(JSON.stringify(createEditorDocument('first edit')));
});

it('leaves the preceding snapshot available when reset application fails', async () => {
  const original = createEditorDocument('original');
  const edited = createEditorDocument('edited');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(edited));
  const latest = createEditorDocument('latest');
  history.push(JSON.stringify(latest));
  let visibleDocument = latest.sourceName;
  const applyDocument = vi.fn(async (document: EditorDocument) => {
    visibleDocument = document.sourceName;
    if (document.sourceName === original.sourceName) throw new Error('reset failed');
  });
  const publishHistoryDocument = vi.fn();

  await expect(
    resetEditorControllerToOriginal({
      applyDocument,
      history,
      publishHistoryDocument,
    })
  ).rejects.toThrow('reset failed');
  expect(visibleDocument).toBe(latest.sourceName);
  expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false, index: 2, size: 3 });
  expect(publishHistoryDocument).toHaveBeenCalledWith(latest);
});

it('does not move history when its earliest snapshot is invalid', async () => {
  const history = new SnapshotHistory('not-json');
  history.push(JSON.stringify(createEditorDocument('edited')));
  const applyDocument = vi.fn(async () => undefined);
  const publishHistoryDocument = vi.fn();

  await resetEditorControllerToOriginal({ applyDocument, history, publishHistoryDocument });

  expect(history.getState()).toMatchObject({ index: 1, size: 2, canRedo: false });
  expect(applyDocument).not.toHaveBeenCalled();
  expect(publishHistoryDocument).not.toHaveBeenCalled();
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

it('does not decode the current snapshot on a successful undo or redo', async () => {
  const original = createEditorDocument('original');
  const edited = createEditorDocument('edited');
  const history = new SnapshotHistory(JSON.stringify(original));
  history.push(JSON.stringify(edited));
  const actualHistory = await vi.importActual<typeof import('../../history')>('../../history');
  mocks.undoSnapshot.mockImplementationOnce(actualHistory.undoEditorSnapshot);
  mocks.redoSnapshot.mockImplementationOnce(actualHistory.redoEditorSnapshot);
  const controller = {
    applyDocument: vi.fn(async () => undefined),
    history,
    publishHistoryDocument: vi.fn(),
  };
  const parse = vi.spyOn(JSON, 'parse');
  try {
    await undoEditorControllerSnapshot(controller);
    expect(parse.mock.calls.filter(([value]) => value === JSON.stringify(original))).toHaveLength(
      1
    );
    expect(parse.mock.calls.some(([value]) => value === JSON.stringify(edited))).toBe(false);
    parse.mockClear();
    await redoEditorControllerSnapshot(controller);
    expect(parse.mock.calls.filter(([value]) => value === JSON.stringify(edited))).toHaveLength(1);
    expect(parse.mock.calls.some(([value]) => value === JSON.stringify(original))).toBe(false);
  } finally {
    parse.mockRestore();
  }
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

it.each(['undo', 'redo'] as const)(
  'keeps the attempted %s cursor when recovery also fails',
  async (direction) => {
    const original = createEditorDocument('original');
    const edited = createEditorDocument('edited');
    const history = new SnapshotHistory(JSON.stringify(original));
    history.push(JSON.stringify(edited));
    if (direction === 'redo') history.undo();
    const actualHistory = await vi.importActual<typeof import('../../history')>('../../history');
    if (direction === 'undo') {
      mocks.undoSnapshot.mockImplementationOnce(actualHistory.undoEditorSnapshot);
    } else {
      mocks.redoSnapshot.mockImplementationOnce(actualHistory.redoEditorSnapshot);
    }
    const controller = {
      applyDocument: vi.fn(async () => {
        throw new Error('canvas load failed');
      }),
      history,
      publishHistoryDocument: vi.fn(),
    };

    await expect(
      direction === 'undo'
        ? undoEditorControllerSnapshot(controller)
        : redoEditorControllerSnapshot(controller)
    ).rejects.toThrow('Editor history restoration failed');
    expect(history.getState().index).toBe(direction === 'undo' ? 0 : 1);
    expect(controller.publishHistoryDocument).not.toHaveBeenCalled();
  }
);

it('propagates an undo application failure without an available history', async () => {
  const controller = {
    applyDocument: vi.fn(async () => {
      throw new Error('canvas load failed');
    }),
    history: null,
    publishHistoryDocument: vi.fn(),
  };

  await expect(undoEditorControllerSnapshot(controller)).rejects.toThrow('canvas load failed');
  expect(controller.applyDocument).toHaveBeenCalledOnce();
});

it.each(['undo', 'redo'] as const)(
  'suspends pixel gestures during %s and restores editing on the replacement target',
  async (direction) => {
    const bitmap = document.createElement('canvas');
    bitmap.width = bitmap.height = 4;
    const metadata = createEditorRasterMetadata(bitmap.toDataURL(), 4, 4);
    const makeImage = () => {
      const image = new FabricImage(bitmap);
      Object.assign(image, metadata, { sniptaleId: 'image', sniptaleType: 'image' });
      return image;
    };
    const canvas = new Canvas(undefined, { width: 20, height: 20, renderOnAddRemove: false });
    canvas.add(makeImage());
    canvas.setActiveObject(canvas.getObjects()[0]!);
    const adapter = createRasterTargetAdapter({
      canvas: () => canvas,
      frame: () => DEFAULT_EDITOR_FRAME_SETTINGS,
      documentBounds: () => ({ x: 0, y: 0, width: 20, height: 20 }),
      prepareObject: () => {},
      commitNative: () => {},
      publishBackground: async () => false,
      flipObject: async () => {},
    });
    const runtime = mountEditorRasterRuntime({
      canvas,
      adapter,
      createCompute: () => ({ run: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }),
    });
    const original = createEditorDocument('original');
    const edited = createEditorDocument('edited');
    const history = new SnapshotHistory(JSON.stringify(original));
    history.push(JSON.stringify(edited));
    if (direction === 'redo') history.undo();
    const actualHistory = await vi.importActual<typeof import('../../history')>('../../history');
    mocks.undoSnapshot.mockImplementationOnce(actualHistory.undoEditorSnapshot);
    mocks.redoSnapshot.mockImplementationOnce(actualHistory.redoEditorSnapshot);
    const replacement = makeImage();
    const applyDocument = vi.fn(async () => {
      expect(runtime.getSnapshot()).toMatchObject({ editing: true, tool: 'erase', busy: true });
      expect(runtime.beginGesture({ x: 1, y: 1 })).toBe(false);
      canvas.discardActiveObject();
      canvas.remove(...canvas.getObjects());
      canvas.add(replacement);
      runtime.refresh();
      expect(runtime.getSnapshot()).toMatchObject({ editing: true, busy: true });
    });
    const publishHistoryDocument = vi.fn();
    try {
      runtime.enterEditing();
      runtime.selectTool('erase');
      await (direction === 'undo' ? undoEditorControllerSnapshot : redoEditorControllerSnapshot)({
        canvas,
        history,
        applyDocument,
        publishHistoryDocument,
      });
      expect(applyDocument).toHaveBeenCalledOnce();
      expect(publishHistoryDocument).toHaveBeenCalledExactlyOnceWith(
        direction === 'undo' ? original : edited
      );
      expect(history.getState()).toMatchObject({ index: direction === 'undo' ? 0 : 1, size: 2 });
      expect(canvas.getActiveObject()).toBe(replacement);
      expect(runtime.getSnapshot()).toMatchObject({ editing: true, tool: 'erase', busy: false });
    } finally {
      runtime.dispose();
      await canvas.dispose();
    }
  }
);
