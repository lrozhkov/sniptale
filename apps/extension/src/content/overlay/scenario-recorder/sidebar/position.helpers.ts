import type { RefObject } from 'react';
import { queryAllContentUiElements } from '../../../platform/dom-host';
import {
  projectClientRectToContentUi,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';

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
  defaultTop: number,
  uiScale = 1
): ScenarioRecorderSidebarPosition {
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  return {
    x: Math.max(
      SIDEBAR_VIEWPORT_PADDING,
      viewport.width - sidebarEl.offsetWidth - DEFAULT_SIDEBAR_RIGHT
    ),
    y: defaultTop,
  };
}

export function clampScenarioRecorderSidebarPosition(
  position: ScenarioRecorderSidebarPosition,
  sidebarEl: HTMLElement,
  uiScale = 1
): ScenarioRecorderSidebarPosition {
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  const maxX = Math.max(
    SIDEBAR_VIEWPORT_PADDING,
    viewport.width - sidebarEl.offsetWidth - SIDEBAR_VIEWPORT_PADDING
  );
  const maxY = Math.max(
    SIDEBAR_VIEWPORT_PADDING,
    viewport.height - sidebarEl.offsetHeight - SIDEBAR_VIEWPORT_PADDING
  );

  return {
    x: Math.min(Math.max(position.x, SIDEBAR_VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(position.y, SIDEBAR_VIEWPORT_PADDING), maxY),
  };
}

function rectsIntersect(
  left: { left: number; right: number; top: number; bottom: number },
  right: { left: number; right: number; top: number; bottom: number }
) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function resolveFloatingBlockerRects(sidebarRef: RefObject<HTMLElement | null>, uiScale: number) {
  const sidebarEl = sidebarRef.current;

  return queryAllContentUiElements<HTMLElement>(
    '[data-ui="content.toolbar.root"], .sniptale-popover-menu'
  )
    .filter((element) => element !== sidebarEl)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return projectClientRectToContentUi(
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        uiScale
      );
    })
    .map((rect) => ({
      ...rect,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      bottom: rect.y + rect.height,
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((left, right) => left.top - right.top);
}

export function resolveScenarioRecorderSidebarPosition(args: {
  requestedPosition: ScenarioRecorderSidebarPosition;
  sidebarRef: RefObject<HTMLElement | null>;
  uiScale?: number;
}) {
  const sidebarEl = args.sidebarRef.current;
  if (!sidebarEl) {
    return args.requestedPosition;
  }

  const uiScale = args.uiScale ?? 1;
  let nextPosition = clampScenarioRecorderSidebarPosition(
    args.requestedPosition,
    sidebarEl,
    uiScale
  );
  const blockerRects = resolveFloatingBlockerRects(args.sidebarRef, uiScale);

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
      sidebarEl,
      uiScale
    );
  }

  return nextPosition;
}
