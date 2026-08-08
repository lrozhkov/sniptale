const VIEWPORT_MARGIN = 8;
const TARGET_GAP = 6;
export const ADJACENT_CONTROL_BUTTON_SIZE = 26;
export const ADJACENT_CONTROL_GAP = 4;

type Rect = { bottom: number; left: number; right: number; top: number };
type Viewport = { height: number; width: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getAdjacentControlGroupPosition(args: {
  controlCount: number;
  targetRect: Rect;
  uiScale?: number;
  viewport: Viewport;
}) {
  const uiScale = args.uiScale ?? 1;
  const count = Math.max(1, args.controlCount);
  const controlSize = ADJACENT_CONTROL_BUTTON_SIZE * uiScale;
  const viewportMargin = VIEWPORT_MARGIN * uiScale;
  const targetGap = TARGET_GAP * uiScale;
  const width = count * controlSize + (count - 1) * ADJACENT_CONTROL_GAP * uiScale;
  const maximumLeft = Math.max(viewportMargin, args.viewport.width - viewportMargin - width);
  const right = args.targetRect.right + targetGap;
  const left = args.targetRect.left - targetGap - width;
  const x =
    right + width <= args.viewport.width - viewportMargin
      ? right
      : left >= viewportMargin
        ? left
        : clamp(right, viewportMargin, maximumLeft);

  const above = args.targetRect.top - controlSize - ADJACENT_CONTROL_GAP * uiScale;
  const below = args.targetRect.bottom + ADJACENT_CONTROL_GAP * uiScale;
  const maximumTop = Math.max(viewportMargin, args.viewport.height - viewportMargin - controlSize);
  const y =
    above >= viewportMargin
      ? above
      : below + controlSize <= args.viewport.height - viewportMargin
        ? below
        : clamp(above, viewportMargin, maximumTop);

  return { x, y };
}
