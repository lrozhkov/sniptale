import type { FloatingToolbarGroup } from './canvas-toolbar-groups';
import type { CanvasSelectionToolbarPlacement } from './canvas-toolbar-geometry-types';

export type CanvasToolbarPopoverPlacement = 'above' | 'below';

const POPOVER_WIDTH_PX: Record<NonNullable<FloatingToolbarGroup['width']>, number> = {
  simple: 256,
  style: 288,
  rich: 352,
  menu: 272,
};

const POPOVER_VIEWPORT_GAP = 12;
const POPOVER_SURFACE_GAP = 12;
const POPOVER_MIN_HEIGHT_PX = 168;

export const CANVAS_POPOVER_HEIGHT_ESTIMATE_PX: Record<
  NonNullable<FloatingToolbarGroup['width']>,
  number
> = {
  simple: 220,
  style: 520,
  rich: 620,
  menu: 280,
};

interface ViewportRect {
  bottom: number;
  left: number;
  right?: number;
  top: number;
  width: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolvePreferredPopoverPlacement(args: {
  availableAbove: number;
  availableBelow: number;
  desiredHeight: number;
  toolbarPlacement: CanvasSelectionToolbarPlacement;
}): CanvasToolbarPopoverPlacement {
  const preferred = args.toolbarPlacement === 'above-selection' ? 'above' : 'below';
  const preferredSpace = preferred === 'above' ? args.availableAbove : args.availableBelow;
  const fallback = preferred === 'above' ? 'below' : 'above';
  const fallbackSpace = fallback === 'above' ? args.availableAbove : args.availableBelow;

  if (preferredSpace >= args.desiredHeight) {
    return preferred;
  }

  if (fallbackSpace >= args.desiredHeight) {
    return fallback;
  }

  return preferredSpace >= fallbackSpace ? preferred : fallback;
}

export function resolveCanvasToolbarPopoverLayout(args: {
  buttonRect: ViewportRect;
  group: FloatingToolbarGroup;
  measuredHeight: number | null;
  rootRect: ViewportRect;
  toolbarPlacement: CanvasSelectionToolbarPlacement;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const availableAbove = args.rootRect.top - POPOVER_SURFACE_GAP - POPOVER_VIEWPORT_GAP;
  const availableBelow =
    args.viewportHeight - args.rootRect.bottom - POPOVER_SURFACE_GAP - POPOVER_VIEWPORT_GAP;
  const popoverWidth = Math.min(
    POPOVER_WIDTH_PX[args.group.width ?? 'style'],
    args.viewportWidth - POPOVER_VIEWPORT_GAP * 2
  );
  const preferredLeft = args.buttonRect.left + args.buttonRect.width / 2 - popoverWidth / 2;
  const maxLeft = Math.max(
    POPOVER_VIEWPORT_GAP,
    args.viewportWidth - popoverWidth - POPOVER_VIEWPORT_GAP
  );
  const viewportLeft = clamp(preferredLeft, POPOVER_VIEWPORT_GAP, maxLeft);
  const desiredHeight =
    args.measuredHeight ?? CANVAS_POPOVER_HEIGHT_ESTIMATE_PX[args.group.width ?? 'style'];
  const placement = resolvePreferredPopoverPlacement({
    availableAbove,
    availableBelow,
    desiredHeight,
    toolbarPlacement: args.toolbarPlacement,
  });
  const availableHeight = placement === 'above' ? availableAbove : availableBelow;

  return {
    left: viewportLeft - args.rootRect.left,
    maxHeight: Math.max(POPOVER_MIN_HEIGHT_PX, availableHeight),
    placement,
  };
}

export function resolveMeasuredPopoverHeight(popover: HTMLDivElement | null): number | null {
  if (!popover || popover.scrollHeight <= 0) {
    return null;
  }

  return Math.ceil(popover.scrollHeight);
}
