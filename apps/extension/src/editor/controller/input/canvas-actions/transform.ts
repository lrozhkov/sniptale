import { EditorCanvas } from '../../../document/canvas-surface/render-region';
import type { TPointerEvent } from 'fabric';
import { cancelEditorDrawingArrowBend } from '../../../drawing/object/controls/arrow';

export interface EditorTransformCanvas {
  readonly _currentTransform: unknown;
  endCurrentTransform(event?: TPointerEvent): void;
}

/** Cancels an interrupted editor transform and keeps native adapters out of the idle finalizer. */
export function endEditorCanvasTransform(
  canvas: EditorTransformCanvas | null,
  event?: TPointerEvent
): boolean {
  if (cancelEditorDrawingArrowBend(canvas)) return true;
  if (!canvas?._currentTransform) return false;
  if (canvas instanceof EditorCanvas) return canvas.cancelCurrentTransform();
  canvas.endCurrentTransform(event);
  return true;
}
