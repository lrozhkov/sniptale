import type { EditorDocument } from '../../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { ApplyDocumentOptions } from '../../core/types';
import {
  readCurrentEditorSnapshot,
  redoEditorSnapshot,
  resetEditorSnapshotHistory,
  undoEditorSnapshot,
} from '../../history';
import { flushActiveFrameAnnotationDraft } from '../../../frame-annotation/draft-coordinator';
import { runEditorDocumentTransition } from '../../history/transition-queue';
import type { Canvas } from 'fabric';

type EditorDocumentApplyTarget = {
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  publishHistoryDocument: (
    document: EditorDocument,
    options?: { scheduleAutosave?: boolean }
  ) => void;
};

type EditorDocumentHistorySource = {
  history: SnapshotHistory<string> | null;
  canvas?: Canvas | null;
};

export type EditorDocumentHistoryController = EditorDocumentApplyTarget &
  EditorDocumentHistorySource;

export type EditorDocumentResetController = EditorDocumentHistoryController;

async function applyHistoryDocument(
  controller: EditorDocumentApplyTarget,
  document: EditorDocument | null,
  options: ApplyDocumentOptions
): Promise<void> {
  if (!document) {
    return;
  }

  await controller.applyDocument(document, options);
}

export async function undoEditorControllerSnapshot(
  controller: EditorDocumentHistoryController
): Promise<void> {
  return runEditorDocumentTransition(controller.canvas ?? controller.history, () =>
    undoEditorControllerSnapshotInTurn(controller)
  );
}

async function undoEditorControllerSnapshotInTurn(
  controller: EditorDocumentHistoryController
): Promise<void> {
  flushActiveFrameAnnotationDraft();
  const document = undoEditorSnapshot(controller.history);
  try {
    await applyHistoryDocument(controller, document, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
  } catch (error) {
    await restoreFailedHistoryStep(controller, error, 'redo');
    throw error;
  }
  if (document) controller.publishHistoryDocument(document);
}

export async function redoEditorControllerSnapshot(
  controller: EditorDocumentHistoryController
): Promise<void> {
  return runEditorDocumentTransition(controller.canvas ?? controller.history, () =>
    redoEditorControllerSnapshotInTurn(controller)
  );
}

async function redoEditorControllerSnapshotInTurn(
  controller: EditorDocumentHistoryController
): Promise<void> {
  flushActiveFrameAnnotationDraft();
  const document = redoEditorSnapshot(controller.history);
  try {
    await applyHistoryDocument(controller, document, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
  } catch (error) {
    await restoreFailedHistoryStep(controller, error, 'undo');
    throw error;
  }
  if (document) controller.publishHistoryDocument(document);
}

async function restoreFailedHistoryStep(
  controller: EditorDocumentHistoryController,
  error: unknown,
  reverse: 'undo' | 'redo'
): Promise<void> {
  const history = controller.history;
  if (!history) return;
  const returnToFailedStep = () => {
    if (reverse === 'redo') history.undo();
    else history.redo();
  };
  if (reverse === 'redo') history.redo();
  else history.undo();
  let restored = false;
  try {
    const previousDocument = readCurrentEditorSnapshot(history);
    restored = await restoreHistoryDocument(controller, previousDocument, error);
    if (restored && previousDocument) controller.publishHistoryDocument(previousDocument);
  } finally {
    if (!restored) returnToFailedStep();
  }
}

async function restoreHistoryDocument(
  controller: EditorDocumentApplyTarget,
  previousDocument: EditorDocument | null,
  originalError: unknown
): Promise<boolean> {
  if (!previousDocument) return false;
  try {
    await controller.applyDocument(previousDocument, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
    return true;
  } catch (recoveryError) {
    throw new AggregateError([originalError, recoveryError], 'Editor history restoration failed', {
      cause: recoveryError,
    });
  }
}

export async function resetEditorControllerToOriginal(
  controller: EditorDocumentResetController
): Promise<void> {
  return runEditorDocumentTransition(controller.canvas ?? controller.history, async () => {
    flushActiveFrameAnnotationDraft();
    const history = controller.history;
    const previousIndex = history?.getState().index ?? 0;
    if (!history || previousIndex === 0) return;
    const previousDocument = readCurrentEditorSnapshot(history);
    if (!previousDocument) return;
    for (let step = 0; step < previousIndex; step += 1) history.undo();
    const restoreCursor = () => {
      for (let step = 0; step < previousIndex; step += 1) history.redo();
    };
    const document = readCurrentEditorSnapshot(history);
    if (!document) {
      restoreCursor();
      return;
    }
    try {
      await controller.applyDocument(document, {
        resetHistory: false,
        updateOriginal: false,
        preserveViewport: true,
      });
    } catch (error) {
      try {
        await restoreHistoryDocument(controller, previousDocument, error);
      } finally {
        restoreCursor();
      }
      controller.publishHistoryDocument(previousDocument);
      throw error;
    }
    controller.publishHistoryDocument(document);
  });
}

/** Replaces the document with its immutable source and discards the entire edit history. */
export async function restoreEditorControllerOriginalDocument(
  controller: EditorDocumentResetController,
  original: EditorDocument,
  persist?: () => Promise<void>,
  isCurrent: () => boolean = () => true
): Promise<void> {
  return runEditorDocumentTransition(controller.canvas ?? controller.history, async () => {
    if (!isCurrent()) throw new Error('Editor document changed during restoration.');
    flushActiveFrameAnnotationDraft();
    const previousDocument = readCurrentEditorSnapshot(controller.history);
    try {
      await controller.applyDocument(original, {
        resetHistory: false,
        updateOriginal: false,
        preserveViewport: true,
      });
      await persist?.();
    } catch (error) {
      if (await restoreHistoryDocument(controller, previousDocument, error)) {
        controller.publishHistoryDocument(previousDocument!);
      }
      throw error;
    }
    if (controller.history) resetEditorSnapshotHistory(controller.history, original);
    if (persist) controller.publishHistoryDocument(original, { scheduleAutosave: false });
    else controller.publishHistoryDocument(original);
  });
}
