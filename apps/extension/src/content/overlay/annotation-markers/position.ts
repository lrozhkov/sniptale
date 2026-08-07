import { useLayoutEffect, useState } from 'react';
import type { BrowserDomAnnotationRecord } from '../../parser/page-preparation/annotations';
import { getAbsolutePosition } from '../../platform/frame';

export interface AnnotationMarkerProjection {
  record: BrowserDomAnnotationRecord;
  target: Element;
}

export interface AnnotationMarkerOffset {
  x: number;
  y: number;
}

export interface AnnotationMarkerPosition {
  compactTooltip: boolean;
  markerLeft: number | null;
  markerRight: number | null;
  markerTop: number;
  tooltipBottom: number | null;
  tooltipLeft: number | null;
  tooltipMaxHeight: number;
  tooltipMaxWidth: number;
  tooltipRight: number | null;
  tooltipCorridor: 'above' | 'below' | 'none';
  tooltipTop: number | null;
}

const MARKER_HEIGHT = 32;
const MARKER_TARGET_GAP = 16;

type MarkerAnchorPosition = Pick<
  AnnotationMarkerPosition,
  'markerLeft' | 'markerRight' | 'markerTop'
> & {
  anchorX: number;
  markerOnLeft: boolean;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function clampMarkerOffset(
  target: Element,
  offset: AnnotationMarkerOffset,
  uiScale = 1
): AnnotationMarkerOffset {
  const scale = uiScale > 0 ? uiScale : 1;
  const clientRect = getAbsolutePosition(target);
  const rect = {
    x: clientRect.x / scale,
    y: clientRect.y / scale,
    width: clientRect.width / scale,
    height: clientRect.height / scale,
  };
  const logicalOffset = { x: offset.x / scale, y: offset.y / scale };
  const defaultX = rect.x + rect.width - 12;
  const defaultY = rect.y - 12;
  return {
    x:
      clamp(
        logicalOffset.x,
        rect.x - MARKER_TARGET_GAP - defaultX,
        rect.x + rect.width + MARKER_TARGET_GAP - defaultX
      ) * scale,
    y:
      clamp(
        logicalOffset.y,
        rect.y - MARKER_TARGET_GAP - defaultY,
        rect.y + rect.height + MARKER_TARGET_GAP - MARKER_HEIGHT - defaultY
      ) * scale,
  };
}

function markerPositionsMatch(
  left: ReadonlyMap<number, AnnotationMarkerPosition>,
  right: ReadonlyMap<number, AnnotationMarkerPosition>
): boolean {
  if (left.size !== right.size) return false;
  for (const [annotationId, leftPosition] of left) {
    const rightPosition = right.get(annotationId);
    if (
      !rightPosition ||
      leftPosition.compactTooltip !== rightPosition.compactTooltip ||
      leftPosition.markerLeft !== rightPosition.markerLeft ||
      leftPosition.markerRight !== rightPosition.markerRight ||
      leftPosition.markerTop !== rightPosition.markerTop ||
      leftPosition.tooltipBottom !== rightPosition.tooltipBottom ||
      leftPosition.tooltipLeft !== rightPosition.tooltipLeft ||
      leftPosition.tooltipMaxHeight !== rightPosition.tooltipMaxHeight ||
      leftPosition.tooltipMaxWidth !== rightPosition.tooltipMaxWidth ||
      leftPosition.tooltipRight !== rightPosition.tooltipRight ||
      leftPosition.tooltipCorridor !== rightPosition.tooltipCorridor ||
      leftPosition.tooltipTop !== rightPosition.tooltipTop
    ) {
      return false;
    }
  }
  return true;
}

function resolveMarkerAnchor(
  rect: { height: number; width: number; x: number; y: number },
  offset: AnnotationMarkerOffset,
  viewportWidth: number,
  viewportHeight: number
): MarkerAnchorPosition {
  const anchorX = clamp(rect.x + rect.width - 12 + offset.x, 4, viewportWidth - 4);
  const markerTop = clamp(rect.y - 12 + offset.y, 4, viewportHeight - 36);
  const markerOnLeft = anchorX <= viewportWidth / 2;
  return {
    anchorX,
    markerLeft: markerOnLeft ? anchorX : null,
    markerOnLeft,
    markerRight: markerOnLeft ? null : Math.max(4, viewportWidth - anchorX),
    markerTop,
  };
}

function resolveTooltipPosition(
  anchor: MarkerAnchorPosition,
  viewportWidth: number,
  viewportHeight: number
): Omit<AnnotationMarkerPosition, 'markerLeft' | 'markerRight' | 'markerTop'> {
  const horizontalSpace = Math.max(
    0,
    anchor.markerOnLeft ? viewportWidth - 4 - anchor.anchorX : anchor.anchorX - 4
  );
  let tooltipLeft = anchor.markerOnLeft ? anchor.anchorX : null;
  let tooltipRight = anchor.markerOnLeft ? null : Math.max(4, viewportWidth - anchor.anchorX);
  let tooltipMaxWidth = Math.floor(Math.min(300, horizontalSpace));
  let compactTooltip = false;
  if (tooltipMaxWidth < 22) {
    compactTooltip = true;
    tooltipLeft = 4;
    tooltipRight = null;
    tooltipMaxWidth = Math.floor(Math.max(0, viewportWidth - 8));
  }

  const availableAbove = Math.max(0, anchor.markerTop - 12);
  const availableBelow = Math.max(0, viewportHeight - 4 - (anchor.markerTop + 40));
  const placeBelow = availableBelow >= 190 || availableBelow >= availableAbove;
  const verticalSpace = placeBelow ? availableBelow : availableAbove;
  let tooltipTop: number | null = placeBelow ? anchor.markerTop + 40 : null;
  let tooltipBottom: number | null = placeBelow
    ? null
    : Math.max(4, viewportHeight - anchor.markerTop + 8);
  let tooltipMaxHeight = Math.floor(verticalSpace);
  let tooltipCorridor: AnnotationMarkerPosition['tooltipCorridor'] = placeBelow ? 'below' : 'above';
  if (tooltipMaxHeight < 18) {
    compactTooltip = true;
    tooltipCorridor = 'none';
    tooltipTop = 4;
    tooltipBottom = null;
    tooltipMaxHeight = Math.floor(Math.max(0, viewportHeight - 8));
  }

  return {
    compactTooltip,
    tooltipBottom,
    tooltipLeft,
    tooltipMaxHeight,
    tooltipMaxWidth,
    tooltipRight,
    tooltipCorridor,
    tooltipTop,
  };
}

function resolveMarkerPosition(
  target: Element,
  offset: AnnotationMarkerOffset = { x: 0, y: 0 },
  uiScale = 1
): AnnotationMarkerPosition | null {
  try {
    if (!target.isConnected || target.getClientRects().length === 0) return null;
    const clientRect = getAbsolutePosition(target);
    if (![clientRect.height, clientRect.width, clientRect.x, clientRect.y].every(Number.isFinite))
      return null;

    const scale = uiScale > 0 ? uiScale : 1;
    const rect = {
      x: clientRect.x / scale,
      y: clientRect.y / scale,
      width: clientRect.width / scale,
      height: clientRect.height / scale,
    };
    const boundedClientOffset = clampMarkerOffset(target, offset, scale);
    const boundedOffset = {
      x: boundedClientOffset.x / scale,
      y: boundedClientOffset.y / scale,
    };
    const viewportWidth = Math.max(0, window.innerWidth / scale);
    const viewportHeight = Math.max(0, window.innerHeight / scale);
    const anchor = resolveMarkerAnchor(rect, boundedOffset, viewportWidth, viewportHeight);
    const tooltip = resolveTooltipPosition(anchor, viewportWidth, viewportHeight);

    return {
      markerLeft: anchor.markerLeft === null ? null : anchor.markerLeft * scale,
      markerRight: anchor.markerRight === null ? null : anchor.markerRight * scale,
      markerTop: anchor.markerTop * scale,
      ...tooltip,
      tooltipBottom: tooltip.tooltipBottom === null ? null : tooltip.tooltipBottom * scale,
      tooltipLeft: tooltip.tooltipLeft === null ? null : tooltip.tooltipLeft * scale,
      tooltipRight: tooltip.tooltipRight === null ? null : tooltip.tooltipRight * scale,
      tooltipTop: tooltip.tooltipTop === null ? null : tooltip.tooltipTop * scale,
    };
  } catch {
    return null;
  }
}

export function useMarkerPositions(
  projections: AnnotationMarkerProjection[],
  offsets: ReadonlyMap<number, AnnotationMarkerOffset>,
  uiScale = 1
): ReadonlyMap<number, AnnotationMarkerPosition> {
  const [positions, setPositions] = useState<ReadonlyMap<number, AnnotationMarkerPosition>>(
    () => new Map()
  );

  useLayoutEffect(() => {
    if (projections.length === 0) {
      setPositions((current) => (current.size === 0 ? current : new Map()));
      return;
    }
    let active = true;
    let animationFrame = 0;
    let lastPositions: ReadonlyMap<number, AnnotationMarkerPosition> = new Map();

    function samplePositions() {
      const nextPositions = new Map<number, AnnotationMarkerPosition>();
      projections.forEach(({ record, target }) => {
        const position = resolveMarkerPosition(target, offsets.get(record.annotationId), uiScale);
        if (position) nextPositions.set(record.annotationId, position);
      });
      if (!markerPositionsMatch(lastPositions, nextPositions)) {
        lastPositions = nextPositions;
        setPositions((current) =>
          markerPositionsMatch(current, nextPositions) ? current : nextPositions
        );
      }
      if (active) animationFrame = window.requestAnimationFrame(samplePositions);
    }

    samplePositions();
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [offsets, projections, uiScale]);

  return positions;
}
