import type { Canvas, FabricObject } from 'fabric';
import { clamp } from '../../../document/model';
import { getLayerObjects } from '../layers';
import type { CanvasSize } from './types';
import {
  getEditorEditingSurfaceSize,
  getEditorWorkspaceMargin,
} from '../../viewport/editing-surface';

function getReachableVisibleSize(boundsSize: number, canvasSize: number) {
  return Math.min(
    Math.max(24, Math.round(boundsSize * 0.18)),
    Math.max(1, Math.round(boundsSize)),
    canvasSize
  );
}

function resolveReachableBounds(args: {
  boundsSize: number;
  canvasSize: number;
  visibleSize: number;
  origin: number;
}) {
  let min = args.origin + args.visibleSize - args.boundsSize;
  let max = args.origin + args.canvasSize - args.visibleSize;

  if (min > max) {
    const centered = args.origin + (args.canvasSize - args.boundsSize) / 2;
    min = centered;
    max = centered;
  }

  return { max, min };
}

export function ensureEditorObjectReachable(
  canvas: Canvas | null,
  canvasDocumentSize: CanvasSize,
  object: FabricObject
): boolean {
  if (!canvas || canvasDocumentSize.width <= 0 || canvasDocumentSize.height <= 0) {
    return false;
  }

  const bounds = object.getBoundingRect();
  const surfaceSize = getEditorEditingSurfaceSize(canvasDocumentSize);
  const margin = getEditorWorkspaceMargin(canvasDocumentSize);
  const visibleWidth = getReachableVisibleSize(bounds.width, surfaceSize.width);
  const visibleHeight = getReachableVisibleSize(bounds.height, surfaceSize.height);
  const horizontalBounds = resolveReachableBounds({
    boundsSize: bounds.width,
    canvasSize: surfaceSize.width,
    visibleSize: visibleWidth,
    origin: -margin,
  });
  const verticalBounds = resolveReachableBounds({
    boundsSize: bounds.height,
    canvasSize: surfaceSize.height,
    visibleSize: visibleHeight,
    origin: -margin,
  });

  const nextBoundsLeft = clamp(bounds.left, horizontalBounds.min, horizontalBounds.max);
  const nextBoundsTop = clamp(bounds.top, verticalBounds.min, verticalBounds.max);
  const deltaX = nextBoundsLeft - bounds.left;
  const deltaY = nextBoundsTop - bounds.top;
  if (deltaX === 0 && deltaY === 0) {
    return false;
  }

  object.set({
    left: (object.left ?? 0) + deltaX,
    top: (object.top ?? 0) + deltaY,
  });
  object.setCoords();
  return true;
}

export function ensureEditorObjectsReachable(
  canvas: Canvas | null,
  canvasDocumentSize: CanvasSize
): boolean {
  let moved = false;
  getLayerObjects(canvas).forEach((object) => {
    moved = ensureEditorObjectReachable(canvas, canvasDocumentSize, object) || moved;
  });
  return moved;
}
