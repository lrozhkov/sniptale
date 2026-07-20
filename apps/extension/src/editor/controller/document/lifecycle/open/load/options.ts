import type { EditorDocument } from '../../../../../../features/editor/document/types';
import type { ApplyDocumentOptions } from '../../../../core/types';

export interface OpenLoadedEditorControllerDocumentOptions {
  document: EditorDocument;
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  scheduleZoomToFit: () => void;
}
