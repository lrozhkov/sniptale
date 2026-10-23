import type { TPointerEvent } from 'fabric';
import { cancelEditorDrawingArrowBend } from '../../../drawing/object/controls/arrow';

export interface EditorTransformCanvas {
  readonly _currentTransform: unknown;
  endCurrentTransform(event?: TPointerEvent): void;
}

/** Ends Fabric's current object transform without entering its unsafe idle finalizer. */
export function endEditorCanvasTransform(
  canvas: EditorTransformCanvas | null,
  event?: TPointerEvent
): boolean {
  if (cancelEditorDrawingArrowBend(canvas)) return true;
  if (!canvas?._currentTransform) return false;
  canvas.endCurrentTransform(event);
  return true;
}
