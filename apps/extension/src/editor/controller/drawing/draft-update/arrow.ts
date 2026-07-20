import type { Point } from 'fabric';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { readArrowPoints } from '../../../objects/arrow/controls';
import { isArrowObject, updateArrowObject } from '../../../objects/arrow';
import { distanceSquared } from '../../../objects/line/geometry';
import type { DrawSession } from '../../core/types';

export function updateArrowDraft(
  drawSession: DrawSession,
  point: Point,
  arrowSettings: EditorArrowSettings
): null {
  const { start, object } = drawSession;
  if (!object || !isArrowObject(object)) {
    return null;
  }

  const points = readArrowPoints(object);
  const draftPoints =
    object.sniptaleArrowClickMode && Array.isArray(object.sniptaleArrowDraftPoints)
      ? object.sniptaleArrowDraftPoints
      : points;
  const firstPoint = draftPoints[0] ?? start;
  const fixedPoints = object.sniptaleArrowClickMode ? draftPoints.slice(0, -1) : [firstPoint];
  const nextPoints = [...fixedPoints, { x: point.x, y: point.y }];
  object.sniptaleArrowDraftPoints = nextPoints;
  object.sniptaleArrowPointerMoved =
    object.sniptaleArrowPointerMoved ||
    distanceSquared({ x: start.x, y: start.y }, { x: point.x, y: point.y }) > 9;
  updateArrowObject(object, {
    settings: arrowSettings,
    points: nextPoints,
  });
  return null;
}
