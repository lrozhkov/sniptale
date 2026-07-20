import type { CSSProperties } from 'react';
import type { CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { MIN_TAIL_EDGE_MARGIN } from './constants';

type NonAutoCalloutSide = Exclude<CalloutSide, 'auto'>;

export function getCalloutTailMetrics(tailSize: number) {
  return {
    baseSpan: Math.max(14, Math.round(tailSize * 2.2)),
    projection: Math.max(10, Math.round(tailSize * 1.15)),
  };
}

function resolveTailTipPercent(tailOffset: number) {
  if (tailOffset <= -8) {
    return 38;
  }

  if (tailOffset >= 8) {
    return 62;
  }

  return 50;
}

function createVerticalTailPath(
  width: number,
  height: number,
  tipX: number,
  direction: 'up' | 'down'
) {
  const startY = direction === 'down' ? 0 : height;
  const tipY = direction === 'down' ? height : 0;
  const rightControlX = Math.min(width, tipX + width * 0.2);
  const leftControlX = Math.max(0, tipX - width * 0.2);
  const midControlY = height * 0.55;

  if (direction === 'down') {
    return [
      `M 0 ${startY}`,
      `H ${width}`,
      `C ${width * 0.76} ${startY} ${rightControlX} ${midControlY} ${tipX} ${tipY}`,
      `C ${leftControlX} ${midControlY} ${width * 0.2} ${startY} 0 ${startY}`,
      'Z',
    ].join(' ');
  }

  return [
    `M 0 ${startY}`,
    `H ${width}`,
    `C ${width * 0.76} ${startY} ${rightControlX} ${height - midControlY} ${tipX} ${tipY}`,
    `C ${leftControlX} ${height - midControlY} ${width * 0.2} ${startY} 0 ${startY}`,
    'Z',
  ].join(' ');
}

function createHorizontalTailPath(
  width: number,
  height: number,
  tipY: number,
  direction: 'left' | 'right'
) {
  const startX = direction === 'right' ? 0 : width;
  const tipX = direction === 'right' ? width : 0;
  const bottomControlY = Math.min(height, tipY + height * 0.2);
  const topControlY = Math.max(0, tipY - height * 0.2);
  const midControlX = width * 0.55;

  if (direction === 'right') {
    return [
      `M ${startX} 0`,
      `V ${height}`,
      `C ${startX} ${height * 0.78} ${midControlX} ${bottomControlY} ${tipX} ${tipY}`,
      `C ${midControlX} ${topControlY} ${startX} ${height * 0.22} ${startX} 0`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${startX} 0`,
    `V ${height}`,
    `C ${startX} ${height * 0.78} ${width - midControlX} ${bottomControlY} ${tipX} ${tipY}`,
    `C ${width - midControlX} ${topControlY} ${startX} ${height * 0.22} ${startX} 0`,
    'Z',
  ].join(' ');
}

export function getTailOffset(
  side: NonAutoCalloutSide,
  anchorPos: { x: number; y: number },
  calloutPos: { x: number; y: number },
  calloutDimensions: { width: number; height: number },
  tailSize: number
): number {
  const { width: cw, height: ch } = calloutDimensions;
  const { baseSpan } = getCalloutTailMetrics(tailSize);
  const halfTail = baseSpan / 2;
  const maxOffsetFromCenter =
    side === 'top' || side === 'bottom'
      ? Math.max(0, cw / 2 - MIN_TAIL_EDGE_MARGIN - halfTail)
      : Math.max(0, ch / 2 - MIN_TAIL_EDGE_MARGIN - halfTail);

  const raw =
    side === 'top' || side === 'bottom'
      ? anchorPos.x - (calloutPos.x + cw / 2)
      : anchorPos.y - (calloutPos.y + ch / 2);

  return Math.max(-maxOffsetFromCenter, Math.min(maxOffsetFromCenter, raw));
}

export function getTailSvgState(
  side: NonAutoCalloutSide,
  tailSize: number,
  tailOffset: number
): {
  path: string;
  style: CSSProperties;
  viewBox: string;
} {
  const { baseSpan, projection } = getCalloutTailMetrics(tailSize);
  const tipCenterPercent = resolveTailTipPercent(tailOffset);
  const tipCenterPx = (tipCenterPercent / 100) * baseSpan;
  const overlap = 1;
  const base: CSSProperties = {
    position: 'absolute',
    zIndex: 0,
    overflow: 'visible',
    pointerEvents: 'none',
  };

  if (side === 'top' || side === 'bottom') {
    return createVerticalTailSvgState({
      base,
      baseSpan,
      overlap,
      projection,
      side,
      tailOffset,
      tipCenterPx,
    });
  }

  return createHorizontalTailSvgState({
    base,
    baseSpan,
    overlap,
    projection,
    side,
    tailOffset,
    tipCenterPx,
  });
}

function createVerticalTailSvgState(args: {
  base: CSSProperties;
  baseSpan: number;
  overlap: number;
  projection: number;
  side: 'top' | 'bottom';
  tailOffset: number;
  tipCenterPx: number;
}) {
  return {
    path: createVerticalTailPath(
      args.baseSpan,
      args.projection,
      args.tipCenterPx,
      args.side === 'top' ? 'down' : 'up'
    ),
    style: {
      ...args.base,
      width: args.baseSpan,
      height: args.projection,
      left: `calc(50% + ${args.tailOffset}px - ${args.tipCenterPx}px)`,
      [args.side === 'top' ? 'top' : 'bottom']: `calc(100% - ${args.overlap}px)`,
    },
    viewBox: `0 0 ${args.baseSpan} ${args.projection}`,
  };
}

function createHorizontalTailSvgState(args: {
  base: CSSProperties;
  baseSpan: number;
  overlap: number;
  projection: number;
  side: 'left' | 'right';
  tailOffset: number;
  tipCenterPx: number;
}) {
  return {
    path: createHorizontalTailPath(
      args.projection,
      args.baseSpan,
      args.tipCenterPx,
      args.side === 'left' ? 'right' : 'left'
    ),
    style: {
      ...args.base,
      width: args.projection,
      height: args.baseSpan,
      [args.side === 'left' ? 'left' : 'right']: `calc(100% - ${args.overlap}px)`,
      top: `calc(50% + ${args.tailOffset}px - ${args.tipCenterPx}px)`,
    },
    viewBox: `0 0 ${args.projection} ${args.baseSpan}`,
  };
}
