import type { Point } from 'fabric';
import { Rect } from 'fabric';
import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import type { CropSelection, DrawSession } from '../../core/types';
import { createRectDraftBounds, createRectangleDraftBounds } from './bounds';

function updateRectBackedDraft(
  drawSession: DrawSession,
  point: Point,
  shouldReturnSelection: boolean,
  rectangleStrokeWidth = 0
): CropSelection | null {
  const { start, object } = drawSession;
  if (!(object instanceof Rect)) {
    return null;
  }

  const nextBounds = shouldReturnSelection
    ? createRectDraftBounds(start, point)
    : createRectangleDraftBounds(start, point, rectangleStrokeWidth);
  object.set(nextBounds);
  return shouldReturnSelection ? nextBounds : null;
}

export function updateRectangleDraft(
  drawSession: DrawSession,
  point: Point,
  shapeSettings: EditorShapeSettings
): null {
  updateRectBackedDraft(drawSession, point, false, shapeSettings.strokeWidth);
  return null;
}

export function updateCropDraft(drawSession: DrawSession, point: Point): CropSelection | null {
  return updateRectBackedDraft(drawSession, point, true);
}
