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
  viewport: Viewport;
}) {
  const count = Math.max(1, args.controlCount);
  const width = count * ADJACENT_CONTROL_BUTTON_SIZE + (count - 1) * ADJACENT_CONTROL_GAP;
  const maximumLeft = Math.max(VIEWPORT_MARGIN, args.viewport.width - VIEWPORT_MARGIN - width);
  const right = args.targetRect.right + TARGET_GAP;
  const left = args.targetRect.left - TARGET_GAP - width;
  const x =
    right + width <= args.viewport.width - VIEWPORT_MARGIN
      ? right
      : left >= VIEWPORT_MARGIN
        ? left
        : clamp(right, VIEWPORT_MARGIN, maximumLeft);

  const above = args.targetRect.top - ADJACENT_CONTROL_BUTTON_SIZE - ADJACENT_CONTROL_GAP;
  const below = args.targetRect.bottom + ADJACENT_CONTROL_GAP;
  const maximumTop = Math.max(
    VIEWPORT_MARGIN,
    args.viewport.height - VIEWPORT_MARGIN - ADJACENT_CONTROL_BUTTON_SIZE
  );
  const y =
    above >= VIEWPORT_MARGIN
      ? above
      : below + ADJACENT_CONTROL_BUTTON_SIZE <= args.viewport.height - VIEWPORT_MARGIN
        ? below
        : clamp(above, VIEWPORT_MARGIN, maximumTop);

  return { x, y };
}
