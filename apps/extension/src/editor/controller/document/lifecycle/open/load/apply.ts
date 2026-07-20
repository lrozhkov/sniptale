import type { EditorDocument } from '../../../../../../features/editor/document/types';
import type { ApplyDocumentOptions } from '../../../../core/types';
import { syncLoadedDocumentState } from '../store';
import { traceLoadedEditorDocumentApplied } from './trace';

export async function applyLoadedEditorDocument(options: {
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  document: EditorDocument;
  scheduleZoomToFit: () => void;
}): Promise<void> {
  await options.applyDocument(options.document, {
    resetHistory: true,
    updateOriginal: true,
  });

  traceLoadedEditorDocumentApplied(options.document);
  options.scheduleZoomToFit();
  syncLoadedDocumentState(options.document.sourceImageData);
}
