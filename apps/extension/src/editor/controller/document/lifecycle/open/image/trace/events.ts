import type { EditorDocument } from '../../../../../../../features/editor/document/types';
import { logEditorOpenTrace } from '../../../../../core/debug';

export function traceEditorImageDocumentCreated(document: EditorDocument): void {
  logEditorOpenTrace('document:created', {
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
    sourceWidth: document.sourceWidth,
    sourceHeight: document.sourceHeight,
  });
}

export function traceEditorImageDocumentApplied(document: EditorDocument): void {
  logEditorOpenTrace('document:applied', {
    canvasWidth: document.canvasWidth,
    canvasHeight: document.canvasHeight,
  });
}
