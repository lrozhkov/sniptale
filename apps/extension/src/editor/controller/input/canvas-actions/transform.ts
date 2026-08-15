import type { TPointerEvent } from 'fabric';

export interface EditorTransformCanvas {
  readonly _currentTransform: unknown;
  endCurrentTransform(event?: TPointerEvent): void;
}

/** Ends Fabric's current object transform without entering its unsafe idle finalizer. */
export function endEditorCanvasTransform(
  canvas: EditorTransformCanvas | null,
  event?: TPointerEvent
): boolean {
  if (!canvas?._currentTransform) return false;
  canvas.endCurrentTransform(event);
  return true;
}
