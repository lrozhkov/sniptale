import type { FabricObject, TPointerEvent, Textbox } from 'fabric';
import type { EditorTool } from '../../../../features/editor/document/types';
import { resolveTextCalloutPointerZone } from '../../../objects/annotation/text/zones';
import { isTargetInCurrentSelection } from '../../selection/target';
import { isTextTarget } from '../text-target';

interface MouseTargetEvent {
  alreadySelected?: boolean;
  e: TPointerEvent;
  target?: FabricObject;
}

function wasTargetSelectedBeforeMouseDown(
  canvas: import('fabric').Canvas,
  event: MouseTargetEvent
): boolean {
  if (typeof event.alreadySelected === 'boolean') {
    return event.alreadySelected;
  }

  return isTargetInCurrentSelection(canvas, event.target);
}

function resolveCanvasTextCalloutPointerZone(
  canvas: import('fabric').Canvas,
  event: MouseTargetEvent,
  target: Textbox
) {
  return resolveTextCalloutPointerZone({
    scenePoint: canvas.getScenePoint(event.e),
    textbox: target,
    viewportPoint: canvas.getViewportPoint(event.e),
  });
}

export function handleSelectedTextTargetMouseDown(options: {
  activeTool: EditorTool;
  canvas: import('fabric').Canvas;
  event: MouseTargetEvent;
  syncRuntimeState?: () => void;
}): boolean {
  const { activeTool, canvas, event } = options;
  if (!isTextTarget(event.target) || !wasTargetSelectedBeforeMouseDown(canvas, event)) {
    return false;
  }

  const zone = resolveCanvasTextCalloutPointerZone(canvas, event, event.target as Textbox);
  if (zone === 'outside') {
    return false;
  }

  return activeTool === 'text';
}
