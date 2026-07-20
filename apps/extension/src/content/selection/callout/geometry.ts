import type { CalloutAnchor, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { CALLOUT_GAP } from './constants';
import { getCalloutTailMetrics } from './tail';

type NonAutoCalloutSide = Exclude<CalloutSide, 'auto'>;

function getIdealCalloutRect(
  side: NonAutoCalloutSide,
  anchorPos: { x: number; y: number },
  calloutDimensions: { width: number; height: number },
  tailSize: number
): { left: number; top: number; width: number; height: number } {
  const { width: cw, height: ch } = calloutDimensions;
  const { projection } = getCalloutTailMetrics(tailSize);
  const totalGap = CALLOUT_GAP + projection;
  let left = 0;
  let top = 0;

  switch (side) {
    case 'top':
      left = anchorPos.x - cw / 2;
      top = anchorPos.y - ch - totalGap;
      break;
    case 'bottom':
      left = anchorPos.x - cw / 2;
      top = anchorPos.y + totalGap;
      break;
    case 'left':
      left = anchorPos.x - cw - totalGap;
      top = anchorPos.y - ch / 2;
      break;
    case 'right':
      left = anchorPos.x + totalGap;
      top = anchorPos.y - ch / 2;
      break;
  }

  return { left, top, width: cw, height: ch };
}

function rectFitsInViewport(
  rect: { left: number; top: number; width: number; height: number },
  margin: number
): boolean {
  return (
    rect.left >= margin &&
    rect.top >= margin &&
    rect.left + rect.width <= window.innerWidth - margin &&
    rect.top + rect.height <= window.innerHeight - margin
  );
}

export function getPreferredSideFromAnchor(anchor: CalloutAnchor): NonAutoCalloutSide | null {
  switch (anchor) {
    case 'middle-left':
      return 'left';
    case 'middle-right':
      return 'right';
    case 'top-left':
    case 'top-center':
    case 'top-right':
      return 'top';
    case 'bottom-left':
    case 'bottom-center':
    case 'bottom-right':
      return 'bottom';
    case 'center':
    default:
      return null;
  }
}

export function getAnchorPosition(
  anchor: CalloutAnchor,
  frameRect: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const { x, y, width, height } = frameRect;

  switch (anchor) {
    case 'top-left':
      return { x, y };
    case 'top-center':
      return { x: x + width / 2, y };
    case 'top-right':
      return { x: x + width, y };
    case 'middle-left':
      return { x, y: y + height / 2 };
    case 'center':
      return { x: x + width / 2, y: y + height / 2 };
    case 'middle-right':
      return { x: x + width, y: y + height / 2 };
    case 'bottom-left':
      return { x, y: y + height };
    case 'bottom-center':
      return { x: x + width / 2, y: y + height };
    case 'bottom-right':
      return { x: x + width, y: y + height };
    default:
      return { x, y };
  }
}

export function pickBestSide(
  anchorPos: { x: number; y: number },
  calloutDimensions: { width: number; height: number },
  tailSize: number = 8,
  preferredSide: NonAutoCalloutSide | null = null
): NonAutoCalloutSide {
  const margin = 12;
  const defaultOrder: NonAutoCalloutSide[] = ['top', 'bottom', 'right', 'left'];
  const sides =
    preferredSide != null
      ? [preferredSide, ...defaultOrder.filter((side) => side !== preferredSide)]
      : defaultOrder;

  for (const side of sides) {
    const rect = getIdealCalloutRect(side, anchorPos, calloutDimensions, tailSize);
    if (rectFitsInViewport(rect, margin)) {
      return side;
    }
  }

  let bestSide: NonAutoCalloutSide = preferredSide ?? 'top';
  let bestOverflow = Infinity;
  for (const side of sides) {
    const rect = getIdealCalloutRect(side, anchorPos, calloutDimensions, tailSize);
    const overflow =
      Math.max(0, margin - rect.left) +
      Math.max(0, margin - rect.top) +
      Math.max(0, rect.left + rect.width - (window.innerWidth - margin)) +
      Math.max(0, rect.top + rect.height - (window.innerHeight - margin));
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      bestSide = side;
    }
  }

  return bestSide;
}

export function getCalloutPosition(
  side: NonAutoCalloutSide,
  anchorPos: { x: number; y: number },
  calloutDimensions: { width: number; height: number },
  tailSize: number
): { x: number; y: number } {
  const { width: cw, height: ch } = calloutDimensions;
  const { projection } = getCalloutTailMetrics(tailSize);
  const totalGap = CALLOUT_GAP + projection;

  let x = anchorPos.x;
  let y = anchorPos.y;

  switch (side) {
    case 'top':
      x = anchorPos.x - cw / 2;
      y = anchorPos.y - ch - totalGap;
      break;
    case 'bottom':
      x = anchorPos.x - cw / 2;
      y = anchorPos.y + totalGap;
      break;
    case 'left':
      x = anchorPos.x - cw - totalGap;
      y = anchorPos.y - ch / 2;
      break;
    case 'right':
      x = anchorPos.x + totalGap;
      y = anchorPos.y - ch / 2;
      break;
  }

  const margin = 8;
  x = Math.max(margin, Math.min(x, window.innerWidth - cw - margin));
  y = Math.max(margin, Math.min(y, window.innerHeight - ch - margin));
  return { x, y };
}
