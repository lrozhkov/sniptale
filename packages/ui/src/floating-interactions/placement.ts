import type { CSSProperties } from 'react';

const FLOATING_INTERACTION_LAYER_Z_INDEX = 2147483647;

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
