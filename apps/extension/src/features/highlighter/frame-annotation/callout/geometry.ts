import type { CalloutAnchor, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { CALLOUT_GAP } from './constants';
import { getCalloutTailMetrics } from './tail';

type NonAutoCalloutSide = Exclude<CalloutSide, 'auto'>;

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

export function getCalloutPosition(args: {
  anchor: CalloutAnchor;
  anchorPos: { x: number; y: number };
  calloutDimensions: { width: number; height: number };
  frameHeight: number;
  side: NonAutoCalloutSide;
  tailSize: number;
  visualScale?: number;
}): { x: number; y: number } {
  const { width: cw, height: ch } = args.calloutDimensions;
  const { projection } = getCalloutTailMetrics(args.tailSize);
  const totalGap = (CALLOUT_GAP + projection) * (args.visualScale ?? 1);
  const cornerOffsetX = getCornerOffsetX({
    anchor: args.anchor,
    calloutHeight: ch,
    frameHeight: args.frameHeight,
    side: args.side,
    totalGap,
  });

  let x = args.anchorPos.x;
  let y = args.anchorPos.y;

  switch (args.side) {
    case 'top':
      x = args.anchorPos.x - cw / 2 + cornerOffsetX;
      y = args.anchorPos.y - ch - totalGap;
      break;
    case 'bottom':
      x = args.anchorPos.x - cw / 2 + cornerOffsetX;
      y = args.anchorPos.y + totalGap;
      break;
    case 'left':
      x = args.anchorPos.x - cw - totalGap;
      y = args.anchorPos.y - ch / 2;
      break;
    case 'right':
      x = args.anchorPos.x + totalGap;
      y = args.anchorPos.y - ch / 2;
      break;
  }

  return { x, y };
}

function getCornerOffsetX(args: {
  anchor: CalloutAnchor;
  calloutHeight: number;
  frameHeight: number;
  side: NonAutoCalloutSide;
  totalGap: number;
}) {
  if (args.side !== 'top' && args.side !== 'bottom') return 0;

  const direction =
    args.anchor === 'top-left' || args.anchor === 'bottom-left'
      ? -1
      : args.anchor === 'top-right' || args.anchor === 'bottom-right'
        ? 1
        : 0;
  if (direction === 0) return 0;

  const halfCalloutHeight = args.calloutHeight / 2;
  const rayDistance = args.frameHeight / 2 + halfCalloutHeight + args.totalGap;
  const edgeProgress = rayDistance <= 0 ? 0 : halfCalloutHeight / rayDistance;
  const diagonalOffset = args.totalGap / Math.max(0.25, 1 - edgeProgress);
  const restrainedOffset = Math.min(diagonalOffset, args.totalGap * 2);
  return direction * Math.round(restrainedOffset);
}
