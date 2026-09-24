import type { EditorDocument } from '../../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { ApplyDocumentOptions } from '../../core/types';
import { readCurrentEditorSnapshot, redoEditorSnapshot, undoEditorSnapshot } from '../../history';
import { flushActiveFrameAnnotationDraft } from '../../../frame-annotation/draft-coordinator';
import { runEditorDocumentTransition } from '../../history/transition-queue';
import type { Canvas } from 'fabric';

type EditorDocumentApplyTarget = {
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  publishHistoryDocument: (document: EditorDocument) => void;
};

type EditorDocumentHistorySource = {
  history: SnapshotHistory<string> | null;
  canvas?: Canvas | null;
};

type EditorDocumentOriginalSource = {
  originalDocument: EditorDocument | null;
  history?: SnapshotHistory<string> | null;
  canvas?: Canvas | null;
};

export type EditorDocumentHistoryController = EditorDocumentApplyTarget &
  EditorDocumentHistorySource;

export type EditorDocumentResetController = EditorDocumentApplyTarget &
  EditorDocumentOriginalSource;

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
  const previousDocument = readCurrentEditorSnapshot(controller.history);
  const document = undoEditorSnapshot(controller.history);
  try {
    await applyHistoryDocument(controller, document, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
  } catch (error) {
    if (await restoreHistoryDocument(controller, previousDocument, error)) {
      controller.history?.redo();
      if (previousDocument) controller.publishHistoryDocument(previousDocument);
    }
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
  const previousDocument = readCurrentEditorSnapshot(controller.history);
  const document = redoEditorSnapshot(controller.history);
  try {
    await applyHistoryDocument(controller, document, {
      resetHistory: false,
      updateOriginal: false,
      preserveViewport: true,
    });
  } catch (error) {
    if (await restoreHistoryDocument(controller, previousDocument, error)) {
      controller.history?.undo();
      if (previousDocument) controller.publishHistoryDocument(previousDocument);
    }
    throw error;
  }
  if (document) controller.publishHistoryDocument(document);
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
  return runEditorDocumentTransition(controller.canvas ?? controller.history ?? null, async () => {
    const document = controller.originalDocument;
    await applyHistoryDocument(controller, document, {
      resetHistory: true,
      updateOriginal: true,
    });
    if (document) controller.publishHistoryDocument(document);
  });
}
