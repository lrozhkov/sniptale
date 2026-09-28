import {
  commitImagePresentation,
  readImageAggregateOriginalDocument,
} from '../../composition/persistence/image-aggregates';
import { getMediaAssetBlob } from '../../composition/persistence/media-library/index.library';
import type { EditorDocument } from '../../features/editor/document/types';
import { createImageThumbnailBlob } from '../../platform/media-utils/image-thumbnail';
import { createLogger } from '@sniptale/platform/observability/logger';
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

const logger = createLogger({ namespace: 'EditorOriginalRestore' });

async function refreshOriginalPresentation(aggregateId: string, revision: number): Promise<void> {
  try {
    const previewBlob = await getMediaAssetBlob(aggregateId);
    if (!previewBlob) return;
    const thumbnailBlob = await createImageThumbnailBlob(previewBlob);
    await commitImagePresentation({
      aggregateId,
      expectedWorkspaceRevision: revision,
      previewBlob,
      thumbnailBlob,
    });
  } catch (error) {
    logger.warn('Failed to refresh restored original presentation', error);
  }
}

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
  const revision = controller.autosaveService?.getDurableRevision();
  if (aggregateId && revision !== null && revision !== undefined && isCurrent()) {
    await refreshOriginalPresentation(aggregateId, revision);
  }
}
