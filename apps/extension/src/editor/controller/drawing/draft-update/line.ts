import type { Point } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import { distanceSquared } from '../../../objects/line/geometry';
import { readLineSettings } from '../../../objects/line/settings/read';
import { isLineObject } from '../../../objects/line/state/identity';
import { readLinePoints } from '../../../objects/line/state/points';
import { updateLineObject } from '../../../objects/line/state/update';
import type { DrawSession } from '../../core/types';

export function updateLineDraft(
  drawSession: DrawSession,
  point: Point,
  lineSettings: EditorLineSettings | null
): null {
  const { object, start } = drawSession;
  if (!object || !isLineObject(object) || !lineSettings) {
    return null;
  }

  const points = readLinePoints(object);
  const firstPoint = points[0] ?? start;
  const fixedPoints = object.sniptaleLineClickMode ? points.slice(0, -1) : [firstPoint];
  const nextPoints = [...fixedPoints, { x: point.x, y: point.y }];
  object.sniptaleLinePointerMoved =
    object.sniptaleLinePointerMoved ||
    distanceSquared({ x: start.x, y: start.y }, { x: point.x, y: point.y }) > 9;
  updateLineObject(object, {
    settings: lineSettings,
    points: nextPoints,
    closed: object.sniptaleLineClosed,
  });
  return null;
}

export function resolveLineDraftSettings(
  drawSession: DrawSession,
  lineSettings?: EditorLineSettings
): EditorLineSettings | null {
  if (lineSettings) {
    return lineSettings;
  }
  return drawSession.object && isLineObject(drawSession.object)
    ? readLineSettings(drawSession.object)
    : null;
}
