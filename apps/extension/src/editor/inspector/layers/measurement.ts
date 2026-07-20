import type React from 'react';

const DEFAULT_LAYERS_PANEL_MAX_HEIGHT_RATIO = 0.5;

export type ResizeBehavior = 'clamp' | 'measure';

export type LayerPanelHeightState = {
  expandedHeight: number | null;
  scrollable: boolean;
};

function getParentHeight(element: HTMLElement | null): number {
  return element?.parentElement?.clientHeight ?? 0;
}

function getMaxExpandedHeight(element: HTMLElement | null, maxHeightRatio: number): number {
  return Math.floor(getParentHeight(element) * maxHeightRatio);
}

function getNaturalBodyHeight(
  bodyElement: HTMLDivElement | null,
  listElement: HTMLDivElement | null,
  actionsElement: HTMLDivElement | null
): number {
  if (!bodyElement) {
    return 0;
  }

  if (!listElement) {
    return bodyElement.scrollHeight;
  }

  const borderHeight = Math.max(0, bodyElement.offsetHeight - bodyElement.clientHeight);
  return borderHeight + (actionsElement?.offsetHeight ?? 0) + listElement.scrollHeight;
}

function getNaturalPanelHeight(args: {
  actionsElement: HTMLDivElement | null;
  bodyElement: HTMLDivElement | null;
  headerElement: HTMLDivElement | null;
  listElement: HTMLDivElement | null;
}) {
  return (
    (args.headerElement?.offsetHeight ?? 0) +
    getNaturalBodyHeight(args.bodyElement, args.listElement, args.actionsElement)
  );
}

export function getLayerPanelMeasurement(args: {
  actionsRef: React.RefObject<HTMLDivElement | null>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  cachedHeightRef: React.MutableRefObject<number | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  behavior: ResizeBehavior;
  maxExpandedHeightRatio?: number;
}): LayerPanelHeightState | null {
  const maxExpandedHeight = getMaxExpandedHeight(
    args.frameRef.current,
    args.maxExpandedHeightRatio ?? DEFAULT_LAYERS_PANEL_MAX_HEIGHT_RATIO
  );
  if (maxExpandedHeight <= 0) {
    return null;
  }

  const naturalPanelHeight = getNaturalPanelHeight({
    actionsElement: args.actionsRef.current,
    bodyElement: args.bodyRef.current,
    headerElement: args.headerRef.current,
    listElement: args.listRef.current,
  });
  const nextExpandedHeight =
    args.behavior === 'clamp' && args.cachedHeightRef.current !== null
      ? Math.min(args.cachedHeightRef.current, maxExpandedHeight)
      : Math.min(naturalPanelHeight, maxExpandedHeight);

  return {
    expandedHeight: nextExpandedHeight,
    scrollable: naturalPanelHeight > nextExpandedHeight,
  };
}
