import React from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';

const MARGIN = 8;
const GAP = 10;
const INTERACTIVE_POPOVER_Z_INDEX = 2147483647;
const measuredPopoverHeights = new WeakMap<HTMLElement, number>();

export const FrameAnnotationPopoverMeasurementContext = React.createContext<(() => void) | null>(
  null
);

export type FrameAnnotationMenuDirection = 'up' | 'down' | 'left' | 'right';

/** Resolve the physical side of an anchored popover from its placed rectangle. */
export function resolveFrameAnnotationPopoverDirection(
  anchor: DOMRect,
  popover: { left: number; top: number; width: number }
): FrameAnnotationMenuDirection {
  if (popover.left >= anchor.right) return 'right';
  if (popover.left + popover.width <= anchor.left) return 'left';
  return popover.top >= anchor.bottom ? 'down' : 'up';
}

const interactiveSurfaceStyle = {
  pointerEvents: 'auto',
  zIndex: INTERACTIVE_POPOVER_Z_INDEX,
} as const;

export function useFrameAnnotationSettingsPopoverPosition(args: {
  anchorEl: HTMLElement | null;
  height: number;
  isOpen: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  width: number;
}): React.CSSProperties {
  const onMeasured = React.useContext(FrameAnnotationPopoverMeasurementContext);
  const [, refresh] = React.useReducer((value) => value + 1, 0);
  React.useLayoutEffect(() => {
    const measuredHeight = args.popoverRef.current?.offsetHeight;
    if (!onMeasured || !args.isOpen || !args.anchorEl || !measuredHeight) return;
    if (measuredPopoverHeights.get(args.anchorEl) === measuredHeight) return;
    measuredPopoverHeights.set(args.anchorEl, measuredHeight);
    onMeasured?.();
  });
  React.useLayoutEffect(() => {
    if (!args.isOpen) return;
    const update = () => refresh();
    const cleanup = bindFloatingInteractionPositionListeners(args.anchorEl, update);
    const observer =
      typeof ResizeObserver === 'undefined' || !args.popoverRef.current
        ? null
        : new ResizeObserver(update);
    if (observer && args.popoverRef.current) observer.observe(args.popoverRef.current);
    return () => {
      observer?.disconnect();
      cleanup?.();
    };
  }, [args.anchorEl, args.isOpen, args.popoverRef]);
  if (!args.isOpen) {
    return { position: 'fixed', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none' };
  }
  return resolveFrameAnnotationSettingsPopoverPosition({
    anchorEl: args.anchorEl,
    height: args.height,
    width: args.width,
    measuredHeight: args.popoverRef.current?.offsetHeight,
  });
}

/** Resolve current toolbar placement with the last measured height when the popover is closed. */
function resolveFrameAnnotationSettingsPopoverPosition(args: {
  anchorEl: HTMLElement | null;
  height: number;
  measuredHeight?: number | undefined;
  width: number;
}): React.CSSProperties {
  if (!args.anchorEl) {
    return { position: 'fixed', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none' };
  }
  const anchor = args.anchorEl.getBoundingClientRect();
  const uiScale = readContentUiScaleCompensation(args.anchorEl);
  const margin = MARGIN * uiScale;
  // A runtime may align settings to its full toolbar edge without changing content defaults.
  const configuredGap = Number.parseFloat(
    getComputedStyle(args.anchorEl).getPropertyValue('--sniptale-settings-popover-gap')
  );
  const hasToolbarGap = Number.isFinite(configuredGap) && configuredGap >= 0;
  const gap = (hasToolbarGap ? configuredGap : GAP) * uiScale;
  const width = Math.min(args.width * uiScale, window.innerWidth - margin * 2);
  const measuredHeight = args.measuredHeight || measuredPopoverHeights.get(args.anchorEl);
  const height = (measuredHeight && measuredHeight > 0 ? measuredHeight : args.height) * uiScale;
  const mainToolbar = args.anchorEl.closest<HTMLElement>(
    hasToolbarGap
      ? '.sniptale-toolbar, .sniptale-glass-toolbar, .sniptale-toolbar-root'
      : '.sniptale-toolbar, .sniptale-glass-toolbar'
  );
  if (mainToolbar) {
    return resolveMainToolbarPosition({
      anchor,
      displayMode: mainToolbar.dataset['displayMode'] === 'vertical' ? 'vertical' : 'horizontal',
      height,
      gap,
      toolbarGap: hasToolbarGap ? gap : 0,
      margin,
      toolbar: mainToolbar.getBoundingClientRect(),
      width,
    });
  }
  const left = clamp(anchor.left, margin, window.innerWidth - width - margin);
  const below = anchor.bottom + gap;
  const top =
    below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, anchor.top - gap - height);
  return { position: 'fixed', left, top, width, ...interactiveSurfaceStyle };
}

function resolveMainToolbarPosition(input: {
  anchor: DOMRect;
  displayMode: 'horizontal' | 'vertical';
  height: number;
  gap: number;
  toolbarGap: number;
  margin: number;
  toolbar: DOMRect;
  width: number;
}): React.CSSProperties {
  const horizontalLeft = clamp(
    input.anchor.left,
    input.margin,
    window.innerWidth - input.width - input.margin
  );
  const verticalTop = clamp(
    input.anchor.top,
    input.margin,
    window.innerHeight - input.height - input.margin
  );
  const candidates = {
    down: {
      left: horizontalLeft,
      top: Math.max(input.toolbar.bottom + input.toolbarGap, input.anchor.bottom + input.gap),
    },
    up: {
      left: horizontalLeft,
      top:
        Math.min(input.toolbar.top - input.toolbarGap, input.anchor.top - input.gap) - input.height,
    },
    right: {
      left: Math.max(input.toolbar.right + input.toolbarGap, input.anchor.right + input.gap),
      top: verticalTop,
    },
    left: {
      left:
        Math.min(input.toolbar.left - input.toolbarGap, input.anchor.left - input.gap) -
        input.width,
      top: verticalTop,
    },
  };
  const ordered =
    input.displayMode === 'vertical'
      ? [candidates.right, candidates.left, candidates.down, candidates.up]
      : [candidates.down, candidates.up, candidates.right, candidates.left];
  const position =
    ordered.find(
      (candidate) =>
        candidate.left >= input.margin &&
        candidate.top >= input.margin &&
        candidate.left + input.width <= window.innerWidth - input.margin &&
        candidate.top + input.height <= window.innerHeight - input.margin
    ) ?? ordered[0]!;
  return { position: 'fixed', ...position, width: input.width, ...interactiveSurfaceStyle };
}

/** Predict a visible settings-popover side with the owner's current placement and measured size. */
export function resolveFrameAnnotationSettingsPopoverDirection(args: {
  anchorEl: HTMLElement | null;
  height: number;
  width: number;
}) {
  if (!args.anchorEl) return undefined;
  const style = resolveFrameAnnotationSettingsPopoverPosition(args);
  const height =
    (measuredPopoverHeights.get(args.anchorEl) ?? args.height) *
    readContentUiScaleCompensation(args.anchorEl);
  if (
    typeof style.left !== 'number' ||
    typeof style.top !== 'number' ||
    typeof style.width !== 'number' ||
    style.left < 0 ||
    style.top < 0 ||
    style.left + style.width > window.innerWidth ||
    style.top + height > window.innerHeight
  )
    return undefined;
  return resolveFrameAnnotationPopoverDirection(args.anchorEl.getBoundingClientRect(), {
    left: style.left,
    top: style.top,
    width: style.width,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
