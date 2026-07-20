import { useEditorStore } from '../../state/useEditorStore';
import { readArrowPoints } from '../../objects/arrow/controls';
import { isArrowObject, updateArrowObject } from '../../objects/arrow';
import { getLinePoints, isLineObject, updateLineObject } from '../../objects/line';
import { completeDrawWorkflowFromBindings, type DrawCompletionBindings } from './draw-completion';
import type { DrawSession } from '../core/types';
import type { PointLike } from '../../objects/arrow/types';

function clonePoint(point: { x: number; y: number }): PointLike {
  return { x: point.x, y: point.y };
}

function resolveFixedDrawPoints(options: {
  clickMode: boolean;
  points: PointLike[];
  start: PointLike;
}): PointLike[] {
  if (options.clickMode) {
    const fixedPoints = options.points.slice(0, -1);
    return fixedPoints.length > 0 ? fixedPoints.map(clonePoint) : [clonePoint(options.start)];
  }

  const firstPoint = options.points[0] ?? options.start;
  return [clonePoint(firstPoint)];
}

function settleLineDrawSessionAtPoint(drawSession: DrawSession, point: PointLike): void {
  const line = drawSession.object;
  if (!line || !isLineObject(line) || line.sniptaleLineClosed) {
    return;
  }

  const fixedPoints = resolveFixedDrawPoints({
    clickMode: line.sniptaleLineClickMode === true,
    points: getLinePoints(line),
    start: drawSession.start,
  });
  updateLineObject(line, {
    settings: useEditorStore.getState().toolSettings.line,
    points: [...fixedPoints, clonePoint(point)],
    closed: line.sniptaleLineClosed,
  });
}

function settleArrowDrawSessionAtPoint(drawSession: DrawSession, point: PointLike): void {
  const arrow = drawSession.object;
  if (!arrow || !isArrowObject(arrow)) {
    return;
  }

  const points = Array.isArray(arrow.sniptaleArrowDraftPoints)
    ? arrow.sniptaleArrowDraftPoints
    : readArrowPoints(arrow);
  const fixedPoints = resolveFixedDrawPoints({
    clickMode: arrow.sniptaleArrowClickMode === true,
    points,
    start: drawSession.start,
  });
  const nextPoints = [...fixedPoints, clonePoint(point)];
  arrow.sniptaleArrowDraftPoints = nextPoints;
  updateArrowObject(arrow, {
    settings: useEditorStore.getState().toolSettings.arrow,
    points: nextPoints,
  });
}

function settleDrawSessionAtLastPoint(drawSession: DrawSession | null): void {
  if (!drawSession?.lastPoint) {
    return;
  }

  const point = clonePoint(drawSession.lastPoint);
  if (drawSession.tool === 'line') {
    settleLineDrawSessionAtPoint(drawSession, point);
    return;
  }

  if (drawSession.tool === 'arrow') {
    settleArrowDrawSessionAtPoint(drawSession, point);
  }
}

export function completeDrawSessionFromBindings(bindings: DrawCompletionBindings): boolean {
  return completeDrawWorkflowFromBindings(bindings);
}

export function completeDrawSessionOnEnterFromBindings(bindings: DrawCompletionBindings): boolean {
  settleDrawSessionAtLastPoint(bindings.getDrawSession());
  return completeDrawSessionFromBindings(bindings);
}
