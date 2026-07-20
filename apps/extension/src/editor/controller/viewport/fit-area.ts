import { resolveEditorViewportScaleCompensation } from './scale';

const EDITOR_FIT_AREA_EDGE_GAP = 24;
const EDITOR_FIT_AREA_SURFACE_GAP = 16;
const FIT_AREA_TOP_SURFACES = [
  'editor.floating.document-bar',
  'editor.floating.view-controls',
] as const;
const FIT_AREA_LEFT_SURFACES = ['editor.floating.tool-rail.stack'] as const;

interface EditorViewportFitArea {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
}

function getViewportClientRect(viewportElement: HTMLElement): DOMRect {
  const rect = viewportElement.getBoundingClientRect();

  if (rect.width > 0 && rect.height > 0) {
    return rect;
  }

  return {
    bottom: viewportElement.clientHeight,
    height: viewportElement.clientHeight,
    left: 0,
    right: viewportElement.clientWidth,
    top: 0,
    width: viewportElement.clientWidth,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function getVisibleSurfaceRect(dataUi: string): DOMRect | null {
  const element = document.querySelector<HTMLElement>(`[data-ui="${dataUi}"]`);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function intersectsViewportHorizontally(surface: DOMRect, viewport: DOMRect): boolean {
  return surface.right > viewport.left && surface.left < viewport.right;
}

function intersectsViewportVertically(surface: DOMRect, viewport: DOMRect): boolean {
  return surface.bottom > viewport.top && surface.top < viewport.bottom;
}

export function getEditorViewportFitArea(
  viewportElement: HTMLElement,
  devicePixelRatioBaseline?: number
): EditorViewportFitArea {
  const domScaleCompensation = resolveEditorViewportScaleCompensation(devicePixelRatioBaseline);
  const viewportRect = getViewportClientRect(viewportElement);
  let left = EDITOR_FIT_AREA_EDGE_GAP;
  let top = EDITOR_FIT_AREA_EDGE_GAP;
  let right = viewportRect.width - EDITOR_FIT_AREA_EDGE_GAP;
  let bottom = viewportRect.height - EDITOR_FIT_AREA_EDGE_GAP;

  for (const dataUi of FIT_AREA_TOP_SURFACES) {
    const rect = getVisibleSurfaceRect(dataUi);

    if (rect && intersectsViewportHorizontally(rect, viewportRect)) {
      top = Math.max(top, rect.bottom - viewportRect.top + EDITOR_FIT_AREA_SURFACE_GAP);
    }
  }

  for (const dataUi of FIT_AREA_LEFT_SURFACES) {
    const rect = getVisibleSurfaceRect(dataUi);

    if (rect && intersectsViewportVertically(rect, viewportRect)) {
      left = Math.max(left, rect.right - viewportRect.left + EDITOR_FIT_AREA_SURFACE_GAP);
    }
  }

  left /= domScaleCompensation;
  top /= domScaleCompensation;
  right /= domScaleCompensation;
  bottom /= domScaleCompensation;

  if (right <= left) {
    right = left + 1;
  }

  if (bottom <= top) {
    bottom = top + 1;
  }

  return {
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    height: bottom - top,
    width: right - left,
  };
}
