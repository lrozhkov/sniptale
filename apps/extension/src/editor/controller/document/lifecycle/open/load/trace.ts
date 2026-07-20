import type { EditorDocument } from '../../../../../../features/editor/document/types';
import { logEditorOpenTrace } from '../../../../core/debug';

export function traceLoadedEditorDocumentStart(document: EditorDocument): void {
  logEditorOpenTrace('document:load:start', {
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
    sourceWidth: document.sourceWidth,
    sourceHeight: document.sourceHeight,
  });
}

export function traceLoadedEditorDocumentApplied(document: EditorDocument): void {
  logEditorOpenTrace('document:load:applied', {
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
  });
}
