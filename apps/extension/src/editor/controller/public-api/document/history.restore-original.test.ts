import { expect, it, vi } from 'vitest';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { restoreEditorControllerOriginalDocument } from './history';

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

it('restores the immutable original and clears every undo and redo step', async () => {
  const original = createEditorDocument('raw source');
  const history = new SnapshotHistory(JSON.stringify(createEditorDocument('oldest retained edit')));
  history.push(JSON.stringify(createEditorDocument('latest edit')));
  const applyDocument = vi.fn(async () => undefined);
  const publishHistoryDocument = vi.fn();

  await restoreEditorControllerOriginalDocument(
    { applyDocument, history, publishHistoryDocument },
    original
  );

  expect(applyDocument).toHaveBeenCalledWith(original, {
    resetHistory: false,
    updateOriginal: false,
    preserveViewport: true,
  });
  expect(history.getState()).toMatchObject({ index: 0, size: 1, canUndo: false, canRedo: false });
  expect(history.getState().current).toBe(JSON.stringify(original));
  expect(publishHistoryDocument).toHaveBeenCalledWith(original);
});

it('retains history and restores the visible document when applying the original fails', async () => {
  const original = createEditorDocument('raw source');
  const latest = createEditorDocument('latest edit');
  const history = new SnapshotHistory(JSON.stringify(createEditorDocument('oldest retained edit')));
  history.push(JSON.stringify(latest));
  let visible = latest.sourceName;
  const applyDocument = vi.fn(async (document: EditorDocument) => {
    visible = document.sourceName;
    if (document.sourceName === original.sourceName) throw new Error('apply failed');
  });

  await expect(
    restoreEditorControllerOriginalDocument(
      {
        applyDocument,
        history,
        publishHistoryDocument: vi.fn(),
      },
      original
    )
  ).rejects.toThrow('apply failed');

  expect(visible).toBe(latest.sourceName);
  expect(history.getState()).toMatchObject({ index: 1, size: 2, canUndo: true });
});

it('keeps the previous document and history when the restored original cannot be saved', async () => {
  const original = createEditorDocument('raw source');
  const latest = createEditorDocument('latest edit');
  const history = new SnapshotHistory(JSON.stringify(createEditorDocument('oldest retained edit')));
  history.push(JSON.stringify(latest));
  let visible = latest.sourceName;
  const applyDocument = vi.fn(async (document: EditorDocument) => {
    visible = document.sourceName;
  });
  const persist = vi.fn(async () => {
    throw new Error('storage full');
  });

  await expect(
    restoreEditorControllerOriginalDocument(
      {
        applyDocument,
        history,
        publishHistoryDocument: vi.fn(),
      },
      original,
      persist
    )
  ).rejects.toThrow('storage full');

  expect(persist).toHaveBeenCalledOnce();
  expect(visible).toBe(latest.sourceName);
  expect(history.getState()).toMatchObject({ index: 1, size: 2, canUndo: true });
});

it('rejects stale ownership before applying or clearing history', async () => {
  const latest = createEditorDocument('latest edit');
  const history = new SnapshotHistory(JSON.stringify(latest));
  const applyDocument = vi.fn(async () => undefined);

  await expect(
    restoreEditorControllerOriginalDocument(
      {
        applyDocument,
        history,
        publishHistoryDocument: vi.fn(),
      },
      createEditorDocument('raw source'),
      undefined,
      () => false
    )
  ).rejects.toThrow('Editor document changed during restoration.');

  expect(applyDocument).not.toHaveBeenCalled();
  expect(history.getState().current).toBe(JSON.stringify(latest));
});
