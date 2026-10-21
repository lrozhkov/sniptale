import type { CSSProperties } from 'react';

const FLOATING_INTERACTION_LAYER_Z_INDEX = 2147483647;
export const TOOLBAR_SURFACE_GAP_PX = 1;

interface ToolbarSurfaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveToolbarSurfacePlacement(args: {
  anchor: ToolbarSurfaceRect;
  toolbar: ToolbarSurfaceRect;
  viewport: { width: number; height: number };
  width: number;
  height: number;
  placement: 'up' | 'down' | 'side';
  surfaceInset?: number;
  align?: 'start' | 'center';
}) {
  const inset = args.surfaceInset ?? 0;
  const margin = 8;
  const gap = TOOLBAR_SURFACE_GAP_PX;
  const rightSpace = args.viewport.width - args.toolbar.x - args.toolbar.width - gap - margin;
  const leftSpace = args.toolbar.x - gap - margin;
  const side = args.placement === 'side';
  const right = rightSpace >= args.width - inset * 2 || rightSpace >= leftSpace;
  const availableWidth = side ? (right ? rightSpace : leftSpace) : args.viewport.width - margin * 2;
  const availableHeight = side
    ? args.viewport.height - margin * 2
    : args.placement === 'up'
      ? args.toolbar.y - gap - margin
      : args.viewport.height - args.toolbar.y - args.toolbar.height - gap - margin;
  const maxWidth = Math.max(inset * 2, availableWidth + inset * 2);
  const maxHeight = Math.max(inset * 2, availableHeight + inset * 2);
  const visibleWidth = Math.max(0, Math.min(args.width, maxWidth) - inset * 2);
  const visibleHeight = Math.max(0, Math.min(args.height, maxHeight) - inset * 2);
  const clamp = (value: number, maximum: number) => Math.max(margin, Math.min(value, maximum));
  const alignedLeft =
    args.align === 'center'
      ? args.anchor.x + (args.anchor.width - visibleWidth) / 2
      : args.anchor.x;
  const left = side
    ? right
      ? args.toolbar.x + args.toolbar.width + gap
      : args.toolbar.x - gap - visibleWidth
    : clamp(alignedLeft, args.viewport.width - visibleWidth - margin);
  const top = side
    ? clamp(args.anchor.y, args.viewport.height - visibleHeight - margin)
    : args.placement === 'up'
      ? args.toolbar.y - gap - visibleHeight
      : args.toolbar.y + args.toolbar.height + gap;
  return { left: left - inset, top: top - inset, maxWidth, maxHeight };
}

export function mergeFloatingInteractionLayerStyle(style: CSSProperties): CSSProperties {
  return {
    ...style,
    pointerEvents: 'auto',
    zIndex: style.zIndex ?? FLOATING_INTERACTION_LAYER_Z_INDEX,
  };
}

function getFloatingInteractionOwnerWindow(anchor: HTMLElement | null): Window | null {
  return anchor?.ownerDocument.defaultView ?? (typeof window === 'undefined' ? null : window);
}

function addListenerTarget(
  targets: EventTarget[],
  seen: Set<EventTarget>,
  target: EventTarget | null | undefined
) {
  if (!target || seen.has(target)) {
    return;
  }

  seen.add(target);
  targets.push(target);
}

function getFloatingInteractionPositionTargets(anchor: HTMLElement | null): EventTarget[] {
  const targets: EventTarget[] = [];
  const seen = new Set<EventTarget>();
  let element: HTMLElement | null = anchor;

  while (element) {
    addListenerTarget(targets, seen, element);
    const parent = element.parentElement;
    if (parent) {
      element = parent;
      continue;
    }

    const root = element.getRootNode();
    if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
      addListenerTarget(targets, seen, root);
      element = root.host instanceof HTMLElement ? root.host : null;
      continue;
    }

    element = null;
  }

  const ownerDocument =
    anchor?.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  addListenerTarget(targets, seen, ownerDocument);
  addListenerTarget(targets, seen, ownerDocument?.defaultView ?? null);
  return targets;
}

export function bindFloatingInteractionPositionListeners(
  anchor: HTMLElement | null,
  updatePosition: () => void
) {
  if (!anchor) {
    updatePosition();
    return undefined;
  }

  const ownerWindow = getFloatingInteractionOwnerWindow(anchor);
  const scrollTargets = getFloatingInteractionPositionTargets(anchor);
  const scrollTargetSet = new Set<EventTarget>(scrollTargets);
  let lastScrollEvent: Event | null = null;
  const handleScroll = (event: Event) => {
    if (event.target && !scrollTargetSet.has(event.target)) {
      return;
    }

    if (event === lastScrollEvent) {
      return;
    }

    lastScrollEvent = event;
    updatePosition();
  };

  updatePosition();
  for (const target of scrollTargets) {
    target.addEventListener('scroll', handleScroll, true);
  }
  ownerWindow?.addEventListener('resize', updatePosition);

  return () => {
    for (const target of scrollTargets) {
      target.removeEventListener('scroll', handleScroll, true);
    }
    ownerWindow?.removeEventListener('resize', updatePosition);
  };
}
