import type { FabricObject, TPointerEvent, Textbox } from 'fabric';
import { resolveTextCalloutPointerZone } from '../../../objects/annotation/text/zones';
import { isTargetInCurrentSelection } from '../../selection/target';
import { isTextTarget } from '../text-target';

type HoverableTextCallout = Textbox & {
  hoverCursor?: string | null;
};

function resolveCanvasTextCalloutPointerZone(
  canvas: import('fabric').Canvas,
  event: { e: TPointerEvent; target?: FabricObject },
  target: Textbox
) {
  return resolveTextCalloutPointerZone({
    scenePoint: canvas.getScenePoint(event.e),
    textbox: target,
    viewportPoint: canvas.getViewportPoint(event.e),
  });
}

export function updateTextCalloutHoverCursor(
  canvas: import('fabric').Canvas,
  event: { e: TPointerEvent; target?: FabricObject }
): void {
  if (!isTextTarget(event.target)) {
    return;
  }

  const target = event.target as HoverableTextCallout;
  if (!isTargetInCurrentSelection(canvas, target)) {
    target.hoverCursor = null;
    return;
  }

  const zone = resolveCanvasTextCalloutPointerZone(canvas, event, target);
  target.hoverCursor = zone === 'content' ? 'text' : null;
}
