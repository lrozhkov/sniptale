import type { RefObject } from 'react';
import { queryAllContentUiElements } from '../../../platform/dom-host';

export type ScenarioRecorderSidebarPosition = {
  x: number;
  y: number;
};

const DEFAULT_SIDEBAR_RIGHT = 20;
const SIDEBAR_VIEWPORT_PADDING = 12;
const SIDEBAR_BLOCKER_GAP = 12;

function resolveSidebarRect(position: ScenarioRecorderSidebarPosition, sidebarEl: HTMLElement) {
  return {
    left: position.x,
    top: position.y,
    right: position.x + sidebarEl.offsetWidth,
    bottom: position.y + sidebarEl.offsetHeight,
  };
}

export function resolveDefaultSidebarPosition(
  sidebarEl: HTMLElement,
  defaultTop: number
): ScenarioRecorderSidebarPosition {
  return {
    x: Math.max(
      SIDEBAR_VIEWPORT_PADDING,
      window.innerWidth - sidebarEl.offsetWidth - DEFAULT_SIDEBAR_RIGHT
    ),
    y: defaultTop,
  };
}

export function clampScenarioRecorderSidebarPosition(
  position: ScenarioRecorderSidebarPosition,
  sidebarEl: HTMLElement
): ScenarioRecorderSidebarPosition {
  const maxX = Math.max(
    SIDEBAR_VIEWPORT_PADDING,
    window.innerWidth - sidebarEl.offsetWidth - SIDEBAR_VIEWPORT_PADDING
  );
  const maxY = Math.max(
    SIDEBAR_VIEWPORT_PADDING,
    window.innerHeight - sidebarEl.offsetHeight - SIDEBAR_VIEWPORT_PADDING
  );

  return {
    x: Math.min(Math.max(position.x, SIDEBAR_VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(position.y, SIDEBAR_VIEWPORT_PADDING), maxY),
  };
}

function rectsIntersect(
  left: { left: number; right: number; top: number; bottom: number },
  right: DOMRect
) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function resolveFloatingBlockerRects(sidebarRef: RefObject<HTMLElement | null>) {
  const sidebarEl = sidebarRef.current;

  return queryAllContentUiElements<HTMLElement>(
    '[data-ui="content.toolbar.root"], .sniptale-popover-menu'
  )
    .filter((element) => element !== sidebarEl)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((left, right) => left.top - right.top);
}

export function resolveScenarioRecorderSidebarPosition(args: {
  requestedPosition: ScenarioRecorderSidebarPosition;
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  const sidebarEl = args.sidebarRef.current;
  if (!sidebarEl) {
    return args.requestedPosition;
  }

  let nextPosition = clampScenarioRecorderSidebarPosition(args.requestedPosition, sidebarEl);
  const blockerRects = resolveFloatingBlockerRects(args.sidebarRef);

  for (const blockerRect of blockerRects) {
    const sidebarRect = resolveSidebarRect(nextPosition, sidebarEl);
    if (!rectsIntersect(sidebarRect, blockerRect)) {
      continue;
    }

    nextPosition = clampScenarioRecorderSidebarPosition(
      {
        ...nextPosition,
        y: blockerRect.bottom + SIDEBAR_BLOCKER_GAP,
      },
      sidebarEl
    );
  }

  return nextPosition;
}
