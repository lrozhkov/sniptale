const VIEWPORT_MARGIN = 8;
const ELEMENT_GAP = 12;
const DEFAULT_TOOLBAR_WIDTH = 420;
const DEFAULT_TOOLBAR_HEIGHT = 44;

export interface FrameAnnotationToolbarBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function resolveFrameAnnotationToolbarPlacement(input: {
  calloutBounds?: FrameAnnotationToolbarBounds | null;
  frameBounds: FrameAnnotationToolbarBounds;
  toolbarSize?: { height: number; width: number };
  viewport: { height: number; width: number };
}) {
  const selection = unionBounds(input.frameBounds, input.calloutBounds);
  const toolbar = {
    height: input.toolbarSize?.height || DEFAULT_TOOLBAR_HEIGHT,
    width: input.toolbarSize?.width || DEFAULT_TOOLBAR_WIDTH,
  };
  const above = selection.top - ELEMENT_GAP - toolbar.height;
  const below = selection.bottom + ELEMENT_GAP;
  const maximumTop = Math.max(
    VIEWPORT_MARGIN,
    input.viewport.height - toolbar.height - VIEWPORT_MARGIN
  );
  const top =
    above >= VIEWPORT_MARGIN
      ? above
      : below + toolbar.height <= input.viewport.height - VIEWPORT_MARGIN
        ? below
        : clamp(selection.top - toolbar.height - ELEMENT_GAP, VIEWPORT_MARGIN, maximumTop);
  const centeredLeft = (selection.left + selection.right - toolbar.width) / 2;
  return {
    left: clamp(
      centeredLeft,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, input.viewport.width - toolbar.width - VIEWPORT_MARGIN)
    ),
    top,
  };
}

function unionBounds(
  frame: FrameAnnotationToolbarBounds,
  callout: FrameAnnotationToolbarBounds | null | undefined
): FrameAnnotationToolbarBounds {
  if (!callout) return frame;
  return {
    bottom: Math.max(frame.bottom, callout.bottom),
    left: Math.min(frame.left, callout.left),
    right: Math.max(frame.right, callout.right),
    top: Math.min(frame.top, callout.top),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}
