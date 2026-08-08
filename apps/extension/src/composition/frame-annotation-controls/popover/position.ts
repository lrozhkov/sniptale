import React from 'react';
import { bindFloatingInteractionPositionListeners } from '@sniptale/ui/floating-interactions/placement';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';

const MARGIN = 8;
const GAP = 10;
const INTERACTIVE_POPOVER_Z_INDEX = 2147483647;

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
  const [, refresh] = React.useReducer((value) => value + 1, 0);
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
  if (!args.isOpen || !args.anchorEl) {
    return { position: 'fixed', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none' };
  }
  const anchor = args.anchorEl.getBoundingClientRect();
  const uiScale = readContentUiScaleCompensation(args.anchorEl);
  const margin = MARGIN * uiScale;
  const gap = GAP * uiScale;
  const width = Math.min(args.width * uiScale, window.innerWidth - margin * 2);
  const height = args.height * uiScale;
  const mainToolbar = args.anchorEl.closest<HTMLElement>(
    '.sniptale-toolbar, .sniptale-glass-toolbar'
  );
  if (mainToolbar) {
    return resolveMainToolbarPosition({
      anchor,
      displayMode: mainToolbar.dataset['displayMode'] === 'vertical' ? 'vertical' : 'horizontal',
      height,
      gap,
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
      top: Math.max(input.toolbar.bottom, input.anchor.bottom + input.gap),
    },
    up: {
      left: horizontalLeft,
      top: Math.min(input.toolbar.top, input.anchor.top - input.gap) - input.height,
    },
    right: {
      left: Math.max(input.toolbar.right, input.anchor.right + input.gap),
      top: verticalTop,
    },
    left: {
      left: Math.min(input.toolbar.left, input.anchor.left - input.gap) - input.width,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
