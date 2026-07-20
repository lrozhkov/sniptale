import type { FabricObject } from 'fabric';
import { EDITOR_CORNER_CONTROL_SIZE, EDITOR_SELECTION_BORDER_SCALE_FACTOR } from './constants';

export function applyEditorObjectControlDefaults(object: FabricObject): void {
  object.set({
    cornerSize: EDITOR_CORNER_CONTROL_SIZE,
    cornerStyle: 'circle',
    borderScaleFactor: EDITOR_SELECTION_BORDER_SCALE_FACTOR,
    snapAngle: 15,
    snapThreshold: 4,
  });
}

export function isActiveControl(object: FabricObject, controlKey: string): boolean {
  return object.__corner === controlKey;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
