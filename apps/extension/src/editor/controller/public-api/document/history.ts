import type { EditorDocument } from '../../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { ApplyDocumentOptions } from '../../core/types';
import { redoEditorSnapshot, undoEditorSnapshot } from '../../history';

type EditorDocumentApplyTarget = {
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
};

type EditorDocumentHistorySource = {
  history: SnapshotHistory<string> | null;
};

type EditorDocumentOriginalSource = {
  originalDocument: EditorDocument | null;
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
  await applyHistoryDocument(controller, undoEditorSnapshot(controller.history), {
    resetHistory: false,
    updateOriginal: false,
  });
}

export async function redoEditorControllerSnapshot(
  controller: EditorDocumentHistoryController
): Promise<void> {
  await applyHistoryDocument(controller, redoEditorSnapshot(controller.history), {
    resetHistory: false,
    updateOriginal: false,
  });
}

export async function resetEditorControllerToOriginal(
  controller: EditorDocumentResetController
): Promise<void> {
  await applyHistoryDocument(controller, controller.originalDocument, {
    resetHistory: true,
    updateOriginal: true,
  });
}
