import type { EditorDocument } from '../../../../../../features/editor/document/types';
import type { ApplyDocumentOptions, EditorDocumentOpenOptions } from '../../../../core/types';

export interface OpenLoadedEditorControllerDocumentOptions extends EditorDocumentOpenOptions {
  document: EditorDocument;
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  scheduleZoomToFit: () => void;
}
