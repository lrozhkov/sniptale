import type { EditorDocument } from '../../../../../../features/editor/document/types';
import { syncOpenedDocumentState } from '../store';
import { traceEditorImageDocumentApplied } from './trace/events';

export function completeOpenedEditorDocument(options: {
  browserFrameUrl: string;
  dataUrl: string;
  document: EditorDocument;
  faviconDataUrl?: string | null;
  pageTitle: string;
  scheduleZoomToFit: () => void;
}): void {
  traceEditorImageDocumentApplied(options.document);
  options.scheduleZoomToFit();
  syncOpenedDocumentState({
    browserFrameUrl: options.browserFrameUrl,
    dataUrl: options.dataUrl,
    faviconDataUrl: options.faviconDataUrl ?? null,
    pageTitle: options.pageTitle,
  });
}
