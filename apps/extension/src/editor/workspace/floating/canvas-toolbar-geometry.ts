import { useEffect, useState } from 'react';
import { useEditorController } from '../../application/controller-context';
import type { EditorControllerInstance } from '../../controller/instance/types';
import type { ToolbarGeometry, ToolbarGeometryState } from './canvas-toolbar-geometry-types';
import { attachCanvasToolbarVisibilityRuntime } from './canvas-toolbar-visibility-runtime';

const TOOLBAR_EDGE_GAP = 12;
const ROTATION_HANDLE_BOUNDARY_GAP = 32;
const TOOLBAR_SELECTION_GAP = ROTATION_HANDLE_BOUNDARY_GAP * 2;
const TOOLBAR_TOP_GUARD = 64;
const TOOLBAR_BOTTOM_GUARD = 72;
const TOOLBAR_WIDTH_ESTIMATE = 440;
const TOOLBAR_HEIGHT_ESTIMATE = 60;

interface ObjectViewportRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface ObjectCanvasBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface CanvasToolbarElement {
  height: number;
  getBoundingClientRect: () => Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
  width: number;
}

interface CanvasToolbarObject {
  getCoords: () => Array<{ x: number; y: number }>;
}

export interface CanvasToolbarGeometryController {
  canvas: {
    getActiveObject: () => CanvasToolbarObject | null | undefined;
    getElement: () => CanvasToolbarElement;
    getZoom: () => number;
    viewportTransform?: readonly number[] | null | undefined;
  } | null;
}

function resolveCanvasCssScale(
  canvasElement: CanvasToolbarElement,
  canvasRect: ReturnType<CanvasToolbarElement['getBoundingClientRect']>
) {
  return {
    x: canvasElement.width > 0 && canvasRect.width > 0 ? canvasRect.width / canvasElement.width : 1,
    y:
      canvasElement.height > 0 && canvasRect.height > 0
        ? canvasRect.height / canvasElement.height
        : 1,
  };
}

function transformCanvasPointToViewport(
  point: { x: number; y: number },
  viewportTransform: readonly number[]
) {
  const [scaleX = 1, skewY = 0, skewX = 0, scaleY = 1, translateX = 0, translateY = 0] =
    viewportTransform;

  return {
    x: scaleX * point.x + skewX * point.y + translateX,
    y: skewY * point.x + scaleY * point.y + translateY,
  };
}

function resolveObjectCanvasBounds(
  objectCoords: Array<{ x: number; y: number }>,
  viewportTransform: readonly number[]
): ObjectCanvasBounds | null {
  const viewportCoords = objectCoords.map((point) =>
    transformCanvasPointToViewport(point, viewportTransform)
  );
  const xCoords = viewportCoords.map((point) => point.x);
  const yCoords = viewportCoords.map((point) => point.y);

  return xCoords.length > 0 && yCoords.length > 0
    ? {
        bottom: Math.max(...yCoords),
        left: Math.min(...xCoords),
        right: Math.max(...xCoords),
        top: Math.min(...yCoords),
      }
    : null;
}

export function resolveObjectViewportRect(controller: CanvasToolbarGeometryController) {
  const canvas = controller.canvas;
  const object = canvas?.getActiveObject();

  if (!canvas || !object) {
    return null;
  }

  const canvasElement = canvas.getElement();
  const canvasRect = canvasElement.getBoundingClientRect();
  const cssScale = resolveCanvasCssScale(canvasElement, canvasRect);
  const zoom = canvas.getZoom();
  const objectCoords = object.getCoords();
  const viewportTransform = canvas.viewportTransform ?? [zoom, 0, 0, zoom, 0, 0];
  const objectRect = resolveObjectCanvasBounds(objectCoords, viewportTransform);
  if (!objectRect) {
    return null;
  }
  const left = objectRect.left * cssScale.x;
  const top = objectRect.top * cssScale.y;
  const right = objectRect.right * cssScale.x;
  const bottom = objectRect.bottom * cssScale.y;

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }

  return {
    bottom: canvasRect.top + bottom,
    height: bottom - top,
    left: canvasRect.left + left,
    right: canvasRect.left + right,
    top: canvasRect.top + top,
    width: right - left,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveCenteredLeft(rect: ObjectViewportRect) {
  const viewportWidth = window.innerWidth;
  const center = rect.left + rect.width / 2;

  return clamp(
    center,
    TOOLBAR_WIDTH_ESTIMATE / 2 + TOOLBAR_EDGE_GAP,
    Math.max(
      TOOLBAR_WIDTH_ESTIMATE / 2 + TOOLBAR_EDGE_GAP,
      viewportWidth - TOOLBAR_WIDTH_ESTIMATE / 2 - TOOLBAR_EDGE_GAP
    )
  );
}

function isRectInVisibleArea(rect: ObjectViewportRect): boolean {
  return (
    rect.right > TOOLBAR_EDGE_GAP &&
    rect.left < window.innerWidth - TOOLBAR_EDGE_GAP &&
    rect.bottom > TOOLBAR_TOP_GUARD &&
    rect.top < window.innerHeight - TOOLBAR_BOTTOM_GUARD
  );
}

function resolveToolbarVerticalGeometry(rect: ObjectViewportRect): ToolbarGeometry | null {
  const viewportHeight = window.innerHeight;
  const aboveTop = rect.top - TOOLBAR_HEIGHT_ESTIMATE - TOOLBAR_SELECTION_GAP;
  const belowTop = rect.bottom + TOOLBAR_SELECTION_GAP;

  if (aboveTop >= TOOLBAR_TOP_GUARD) {
    return { left: resolveCenteredLeft(rect), placement: 'above-selection', top: aboveTop };
  }

  if (belowTop + TOOLBAR_HEIGHT_ESTIMATE <= viewportHeight - TOOLBAR_BOTTOM_GUARD) {
    return { left: resolveCenteredLeft(rect), placement: 'below-selection', top: belowTop };
  }

  return null;
}

function resolveToolbarGeometry(
  controller: CanvasToolbarGeometryController
): ToolbarGeometry | null {
  const canvas = controller.canvas;

  if (!canvas) {
    return null;
  }

  const rect = resolveObjectViewportRect(controller);

  if (!rect) {
    return null;
  }

  if (!isRectInVisibleArea(rect)) {
    return null;
  }

  return resolveToolbarVerticalGeometry(rect);
}

function resolveGeometryState(controller: EditorControllerInstance, visibilityRevision: number) {
  return {
    geometry: resolveToolbarGeometry(controller),
    visibilityRevision,
  };
}

export function useCanvasSelectionToolbarGeometry(enabled: boolean) {
  const controller = useEditorController();
  const [state, setState] = useState<ToolbarGeometryState>(() =>
    enabled ? resolveGeometryState(controller, 0) : { geometry: null, visibilityRevision: 0 }
  );

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({
        geometry: null,
        visibilityRevision: current.visibilityRevision + 1,
      }));
      return;
    }

    return attachCanvasToolbarVisibilityRuntime({
      controller,
      resolveState: (visibilityRevision) => resolveGeometryState(controller, visibilityRevision),
      setState,
    });
  }, [controller, enabled]);

  return state;
}
