import type { EditorDocument } from '../../../../../../features/editor/document/types';
import type { ApplyDocumentOptions, OpenImageOptions } from '../../../../core/types';

export interface OpenEditorControllerImageOptions {
  dataUrl: string;
  sourceName: string | null;
  openOptions: OpenImageOptions;
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  scheduleZoomToFit: () => void;
}
