const VIEWPORT_MARGIN = 8;
const ELEMENT_GAP = 12;
const DEFAULT_TOOLBAR_WIDTH = 420;
const DEFAULT_TOOLBAR_HEIGHT = 44;

interface FrameAnnotationToolbarBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function resolveFrameAnnotationToolbarPlacement(input: {
  railBounds: FrameAnnotationToolbarBounds;
  obstacleBounds?: readonly FrameAnnotationToolbarBounds[];
  toolbarSize?: { height: number; width: number };
  viewport: { height: number; width: number };
}) {
  const toolbar = {
    height: input.toolbarSize?.height || DEFAULT_TOOLBAR_HEIGHT,
    width: input.toolbarSize?.width || DEFAULT_TOOLBAR_WIDTH,
  };
  const scale = Math.min(1, (input.viewport.width - 2 * VIEWPORT_MARGIN) / toolbar.width);
  const width = toolbar.width * scale;
  const height = toolbar.height * scale;
  const left = clamp(
    (input.railBounds.left + input.railBounds.right - width) / 2,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, input.viewport.width - width - VIEWPORT_MARGIN)
  );
  let bottom = input.railBounds.bottom;
  for (const obstacle of input.obstacleBounds ?? []) {
    if (left < obstacle.right && left + width > obstacle.left) {
      bottom = Math.max(bottom, obstacle.bottom);
    }
  }
  return {
    left,
    scale,
    top: clamp(
      bottom + ELEMENT_GAP,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, input.viewport.height - height - VIEWPORT_MARGIN)
    ),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}
