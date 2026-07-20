import type { Canvas } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { getLinePoints, isLineObject, updateLineObject } from '../../objects/line';
import { distanceSquared, shouldCloseLine } from '../../objects/line/geometry';
import { clearActiveAnnotationSelection, isTargetInCurrentSelection } from './drawing.helpers';
import { handleLineMouseDown } from './drawing-tool-actions';
import { completeDrawWorkflowFromBindings } from './draw-completion';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

type LineDrawingBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  EditorControllerEventObjectBindings &
  EditorControllerEventCommandBindings;

type MouseDownEvent = {
  alreadySelected?: boolean;
  e: import('fabric').TPointerEvent;
  target?: import('fabric').FabricObject;
};

export function handleLineDrawingMouseDown(
  bindings: LineDrawingBindings,
  canvas: Canvas,
  event: MouseDownEvent
): void {
  const point = canvas.getScenePoint(event.e);
  const drawSession = bindings.getDrawSession();
  const line = drawSession?.tool === 'line' ? drawSession.object : null;
  if (drawSession?.tool === 'line') {
    drawSession.lastPoint = point;
  }

  if (!line || !isLineObject(line)) {
    if (event.alreadySelected ?? isTargetInCurrentSelection(canvas, event.target)) {
      return;
    }
    clearActiveAnnotationSelection(canvas, () => bindings.syncRuntimeState());
    handleLineMouseDown(bindings, point);
    return;
  }

  const points = getLinePoints(line);
  const fixedPoints = line.sniptaleLineClickMode ? points.slice(0, -1) : points;
  const previous = fixedPoints.at(-1);
  if (previous && distanceSquared(previous, point) <= 9) {
    completeLineDrawSession(bindings);
    return;
  }

  const closed = shouldCloseLine(fixedPoints, point);
  const nextFixedPoints = closed ? fixedPoints : [...fixedPoints, point];
  updateLineObject(line, {
    settings: useEditorStore.getState().toolSettings.line,
    points: closed ? fixedPoints : [...nextFixedPoints, point],
    closed,
  });
  line.sniptaleLineClickMode = !closed;
  line.sniptaleLinePointerMoved = false;
  canvas.requestRenderAll();

  if (closed) {
    completeLineDrawSession(bindings);
  }
}

export function shouldKeepLineDrawSessionOpen(bindings: LineDrawingBindings): boolean {
  const drawSession = bindings.getDrawSession();
  const line = drawSession?.tool === 'line' ? drawSession.object : null;
  if (!line || !isLineObject(line)) {
    return false;
  }
  if (!line.sniptaleLinePointerMoved) {
    line.sniptaleLineClickMode = true;
    return true;
  }
  return line.sniptaleLineClickMode === true;
}

function completeLineDrawSession(bindings: LineDrawingBindings): void {
  completeDrawWorkflowFromBindings(bindings);
}
