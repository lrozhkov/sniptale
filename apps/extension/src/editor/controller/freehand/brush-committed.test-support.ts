import type { TPointerEvent } from 'fabric';
import type { EditorFreehandBrush } from './brush/instance';

type BrushCanvas = ConstructorParameters<typeof EditorFreehandBrush>[0];
type BrushPointerEvent = Parameters<EditorFreehandBrush['onMouseDown']>[1];

export function createFreehandBrushCanvas(): BrushCanvas {
  return { getZoom: () => 1 } as unknown as BrushCanvas;
}

export function createFreehandBrushPointerEvent(timeStamp: number): BrushPointerEvent {
  return { e: { timeStamp } as TPointerEvent };
}
