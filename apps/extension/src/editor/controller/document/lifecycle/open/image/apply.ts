import type { EditorDocument } from '../../../../../../features/editor/document/types';
import type { ApplyDocumentOptions } from '../../../../core/types';
import { completeOpenedEditorDocument } from './complete';

export async function applyOpenedEditorDocument(options: {
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  browserFrameUrl: string;
  dataUrl: string;
  document: EditorDocument;
  faviconDataUrl?: string | null;
  pageTitle: string;
  scheduleZoomToFit: () => void;
}): Promise<void> {
  await options.applyDocument(options.document, {
    resetHistory: true,
    updateOriginal: true,
  });

  completeOpenedEditorDocument(options);
}
