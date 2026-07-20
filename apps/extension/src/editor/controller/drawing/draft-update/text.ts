import type { Point, Textbox } from 'fabric';
import { resizeTextCallout } from '../../../objects/annotation/text/callout/resize';
import type { DrawSession } from '../../core/types';

export function updateTextDraft(drawSession: DrawSession, point: Point): null {
  const { object, start } = drawSession;
  if (!object || object.type !== 'textbox') {
    return null;
  }

  object.set({
    left: Math.min(start.x, point.x),
    top: start.y,
  });
  resizeTextCallout(object as Textbox, Math.abs(point.x - start.x), 1);
  return null;
}
