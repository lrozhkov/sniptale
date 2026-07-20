import type { Canvas } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { readArrowPoints } from '../../objects/arrow/controls';
import { isArrowObject, updateArrowObject } from '../../objects/arrow';
import { completeDrawSessionFromBindings } from './draw-session-completion';
import { clearActiveAnnotationSelection, isTargetInCurrentSelection } from './drawing.helpers';
import { handleArrowMouseDown } from './drawing-tool-actions';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

type ArrowDrawingBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  EditorControllerEventObjectBindings &
  EditorControllerEventCommandBindings;

type MouseDownEvent = {
  alreadySelected?: boolean;
  e: import('fabric').TPointerEvent;
  target?: import('fabric').FabricObject;
};

const ARROW_CLICK_FINISH_THRESHOLD = 8;

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function handleArrowDrawingMouseDown(
  bindings: ArrowDrawingBindings,
  canvas: Canvas,
  event: MouseDownEvent
): void {
  const point = canvas.getScenePoint(event.e);
  const drawSession = bindings.getDrawSession();
  const arrow = drawSession?.tool === 'arrow' ? drawSession.object : null;
  if (drawSession?.tool === 'arrow') {
    drawSession.lastPoint = point;
  }

  if (!arrow || !isArrowObject(arrow)) {
    if (event.alreadySelected ?? isTargetInCurrentSelection(canvas, event.target)) {
      return;
    }
    clearActiveAnnotationSelection(canvas, () => bindings.syncRuntimeState());
    handleArrowMouseDown(bindings, point);
    return;
  }

  const points = Array.isArray(arrow.sniptaleArrowDraftPoints)
    ? arrow.sniptaleArrowDraftPoints
    : readArrowPoints(arrow);
  const fixedPoints = arrow.sniptaleArrowClickMode ? points.slice(0, -1) : points;
  const previous = fixedPoints.at(-1);
  if (previous && distanceSquared(previous, point) <= ARROW_CLICK_FINISH_THRESHOLD ** 2) {
    completeDrawSessionFromBindings(bindings);
    return;
  }

  const settings = useEditorStore.getState().toolSettings.arrow;
  const nextFixedPoints = [...fixedPoints, point];
  arrow.sniptaleArrowDraftPoints = [...nextFixedPoints, point];
  updateArrowObject(arrow, {
    settings,
    points: arrow.sniptaleArrowDraftPoints,
  });
  arrow.sniptaleArrowClickMode = true;
  arrow.sniptaleArrowPointerMoved = false;
  canvas.requestRenderAll();
}

export function shouldKeepArrowDrawSessionOpen(bindings: ArrowDrawingBindings): boolean {
  const drawSession = bindings.getDrawSession();
  const arrow = drawSession?.tool === 'arrow' ? drawSession.object : null;
  if (!arrow || !isArrowObject(arrow)) {
    return false;
  }
  if (!arrow.sniptaleArrowPointerMoved) {
    arrow.sniptaleArrowClickMode = true;
    return true;
  }
  return arrow.sniptaleArrowClickMode === true;
}
