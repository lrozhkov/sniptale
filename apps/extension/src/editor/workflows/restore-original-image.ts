import { readImageAggregateOriginalDocument } from '../../composition/persistence/image-aggregates';
import type { EditorDocument } from '../../features/editor/document/types';
import { useEditorStore } from '../state/useEditorStore';
import {
  captureEditorDocumentOpenOperation,
  isCurrentEditorDocumentOpenOperation,
} from '../document/file-actions/operation';

type OriginalImageController = {
  originalDocument: EditorDocument | null;
  autosaveService: { getDurableRevision: () => number | null } | null;
  restoreOriginalDocument: (document: EditorDocument, isCurrent: () => boolean) => Promise<void>;
};

/** Resolves the immutable asset, including after a persisted draft has been reopened. */
export async function restoreOriginalEditorImage(
  controller: OriginalImageController,
  aggregateId: string | null
): Promise<void> {
  const openToken = captureEditorDocumentOpenOperation(controller);
  const openingDocument = controller.originalDocument;
  const isCurrent = () =>
    isCurrentEditorDocumentOpenOperation(openToken) &&
    controller.originalDocument === openingDocument &&
    useEditorStore.getState().sessionId === aggregateId;
  let original = aggregateId ? await readImageAggregateOriginalDocument(aggregateId) : null;
  if (!original && (controller.autosaveService?.getDurableRevision() ?? 0) === 0) {
    original = controller.originalDocument;
  }
  if (!original) throw new Error('Original image is unavailable.');
  if (!isCurrent()) throw new Error('Editor document changed during restoration.');
  await controller.restoreOriginalDocument(original, isCurrent);
}
