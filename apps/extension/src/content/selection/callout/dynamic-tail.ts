import type { CSSProperties } from 'react';
import { getCalloutTailMetrics } from './tail';
import { CALLOUT_GAP } from './constants';

export type ConnectorSide = 'top' | 'right' | 'bottom' | 'left';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const BUBBLE_EDGE_MARGIN = 4;
const FRAME_PORT_FOLLOW_RATIO = 0.86;
const SIDE_HYSTERESIS = 0.12;
const TIP_ROUNDING_RATIO = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function getSideScores(frame: Rect, bubble: Rect) {
  const frameCenter = getCenter(frame);
  const bubbleCenter = getCenter(bubble);
  return {
    horizontal:
      Math.abs(bubbleCenter.x - frameCenter.x) / Math.max(1, (frame.width + bubble.width) / 2),
    vertical:
      Math.abs(bubbleCenter.y - frameCenter.y) / Math.max(1, (frame.height + bubble.height) / 2),
  };
}

function resolveCandidateSide(frame: Rect, bubble: Rect): ConnectorSide {
  const frameCenter = getCenter(frame);
  const bubbleCenter = getCenter(bubble);
  const scores = getSideScores(frame, bubble);
  if (scores.horizontal >= scores.vertical) {
    return bubbleCenter.x < frameCenter.x ? 'left' : 'right';
  }
  return bubbleCenter.y < frameCenter.y ? 'top' : 'bottom';
}

function resolveConnectorSide(
  frame: Rect,
  bubble: Rect,
  previousSide?: ConnectorSide,
  preferredSide?: ConnectorSide
): ConnectorSide {
  const candidate = resolveCandidateSide(frame, bubble);
  if (!previousSide) return preferredSide ?? candidate;
  if (previousSide === candidate) return candidate;
  const scores = getSideScores(frame, bubble);
  return Math.abs(scores.horizontal - scores.vertical) <= SIDE_HYSTERESIS
    ? previousSide
    : candidate;
}

function getOppositeSide(side: ConnectorSide): ConnectorSide {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'right':
      return 'left';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
  }
}

function getPointOnSide(rect: Rect, origin: Point, toward: Point, side: ConnectorSide): Point {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;

  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? rect.y : rect.y + rect.height;
    const rayX = Math.abs(dy) < 0.001 ? origin.x : origin.x + (dx * (y - origin.y)) / dy;
    return { x: clamp(rayX, rect.x, rect.x + rect.width), y };
  }

  const x = side === 'left' ? rect.x : rect.x + rect.width;
  const rayY = Math.abs(dx) < 0.001 ? origin.y : origin.y + (dy * (x - origin.x)) / dx;
  return { x, y: clamp(rayY, rect.y, rect.y + rect.height) };
}

function getInteriorNormal(side: ConnectorSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: 1 };
    case 'right':
      return { x: -1, y: 0 };
    case 'bottom':
      return { x: 0, y: -1 };
    case 'left':
      return { x: 1, y: 0 };
  }
}

function getOutwardNormal(side: ConnectorSide): Point {
  const interior = getInteriorNormal(side);
  return { x: -interior.x, y: -interior.y };
}

function getSideTangent(side: ConnectorSide): Point {
  return side === 'top' || side === 'bottom' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

function offsetPoint(point: Point, direction: Point, distance: number): Point {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function getRoutingPole(frame: Rect, anchorPoint: Point, side: ConnectorSide): Point {
  const center = getCenter(frame);
  return side === 'top' || side === 'bottom'
    ? { x: clamp(anchorPoint.x, frame.x, frame.x + frame.width), y: center.y }
    : { x: center.x, y: clamp(anchorPoint.y, frame.y, frame.y + frame.height) };
}

function getFollowingFramePoint(args: {
  anchorPoint: Point;
  bubbleCenter: Point;
  frameRect: Rect;
  position?: number;
  side: ConnectorSide;
}): Point {
  if (args.position !== undefined) {
    const position = clamp(args.position, 0, 1);
    return args.side === 'top' || args.side === 'bottom'
      ? {
          x: args.frameRect.x + args.frameRect.width * position,
          y: args.side === 'top' ? args.frameRect.y : args.frameRect.y + args.frameRect.height,
        }
      : {
          x: args.side === 'left' ? args.frameRect.x : args.frameRect.x + args.frameRect.width,
          y: args.frameRect.y + args.frameRect.height * position,
        };
  }

  if (args.side === 'top' || args.side === 'bottom') {
    return {
      x: clamp(
        args.anchorPoint.x + (args.bubbleCenter.x - args.anchorPoint.x) * FRAME_PORT_FOLLOW_RATIO,
        args.frameRect.x,
        args.frameRect.x + args.frameRect.width
      ),
      y: args.side === 'top' ? args.frameRect.y : args.frameRect.y + args.frameRect.height,
    };
  }

  return {
    x: args.side === 'left' ? args.frameRect.x : args.frameRect.x + args.frameRect.width,
    y: clamp(
      args.anchorPoint.y + (args.bubbleCenter.y - args.anchorPoint.y) * FRAME_PORT_FOLLOW_RATIO,
      args.frameRect.y,
      args.frameRect.y + args.frameRect.height
    ),
  };
}

function getRoundedTriangleTip(args: {
  basePoint: Point;
  baseA: Point;
  baseB: Point;
  framePoint: Point;
  side: ConnectorSide;
}) {
  const tipPoint = offsetPoint(args.framePoint, getOutwardNormal(args.side), CALLOUT_GAP);
  const halfRoundingRatio = TIP_ROUNDING_RATIO / 2;
  const vertexScale = 1 / (1 - halfRoundingRatio);
  const tipVertex = {
    x: (tipPoint.x - halfRoundingRatio * args.basePoint.x) * vertexScale,
    y: (tipPoint.y - halfRoundingRatio * args.basePoint.y) * vertexScale,
  };

  return {
    tipA: interpolatePoint(tipVertex, args.baseA, TIP_ROUNDING_RATIO),
    tipB: interpolatePoint(tipVertex, args.baseB, TIP_ROUNDING_RATIO),
    tipPoint,
    tipVertex,
  };
}

function getBubbleBase(args: {
  baseOverlap: number;
  borderRadius: number;
  bubbleRect: Rect;
  bubbleSide: ConnectorSide;
  candidate: Point;
  desiredSpan: number;
  position?: number;
  width?: number;
}) {
  const horizontal = args.bubbleSide === 'top' || args.bubbleSide === 'bottom';
  const edgeStart = horizontal ? args.bubbleRect.x : args.bubbleRect.y;
  const edgeLength = horizontal ? args.bubbleRect.width : args.bubbleRect.height;
  const straightInset = Math.min(Math.max(BUBBLE_EDGE_MARGIN, args.borderRadius), edgeLength / 2);
  const straightStart = edgeStart + straightInset;
  const straightEnd = edgeStart + edgeLength - straightInset;
  const availableSpan = Math.max(0, straightEnd - straightStart);
  const requestedSpan =
    args.width === undefined ? args.desiredSpan : edgeLength * clamp(args.width, 0, 1);
  const baseSpan = clamp(requestedSpan, Math.min(4, availableSpan), availableSpan);
  const candidateAxis =
    args.position === undefined
      ? horizontal
        ? args.candidate.x
        : args.candidate.y
      : edgeStart + edgeLength * clamp(args.position, 0, 1);
  const baseCenterAxis = clamp(
    candidateAxis,
    straightStart + baseSpan / 2,
    straightEnd - baseSpan / 2
  );
  const edgePoint = horizontal
    ? { x: baseCenterAxis, y: args.candidate.y }
    : { x: args.candidate.x, y: baseCenterAxis };
  const tangent = getSideTangent(args.bubbleSide);
  const baseEdgeA = offsetPoint(edgePoint, tangent, -baseSpan / 2);
  const baseEdgeB = offsetPoint(edgePoint, tangent, baseSpan / 2);
  const interiorNormal = getInteriorNormal(args.bubbleSide);
  const baseA = offsetPoint(baseEdgeA, interiorNormal, args.baseOverlap);
  const baseB = offsetPoint(baseEdgeB, interiorNormal, args.baseOverlap);
  const bubblePoint = offsetPoint(edgePoint, interiorNormal, args.baseOverlap);

  return {
    baseA,
    baseB,
    baseEdgeA,
    baseEdgeB,
    bubbleEdgePoint: edgePoint,
    bubblePoint,
    tangent,
  };
}

function getConnectorPoints(args: {
  anchorPoint?: Point;
  borderRadius?: number;
  borderWidth?: number;
  bubbleRect: Rect;
  frameRect: Rect;
  side: ConnectorSide;
  tailBasePosition?: number;
  tailBaseWidth?: number;
  tailFramePosition?: number;
  tailSize: number;
}) {
  const bubbleSide = getOppositeSide(args.side);
  const bubbleCenter = getCenter(args.bubbleRect);
  const anchorPoint = args.anchorPoint ?? getCenter(args.frameRect);
  const routingPole = getRoutingPole(args.frameRect, anchorPoint, args.side);
  const bubbleEdgeCandidate = getPointOnSide(
    args.bubbleRect,
    bubbleCenter,
    routingPole,
    bubbleSide
  );
  const { baseSpan } = getCalloutTailMetrics(args.tailSize);
  const base = getBubbleBase({
    baseOverlap: Math.max(2, (args.borderWidth ?? 0) + 1),
    borderRadius: Math.max(0, args.borderRadius ?? 0),
    bubbleRect: args.bubbleRect,
    bubbleSide,
    candidate: bubbleEdgeCandidate,
    desiredSpan: baseSpan,
    ...(args.tailBasePosition === undefined ? {} : { position: args.tailBasePosition }),
    ...(args.tailBaseWidth === undefined ? {} : { width: args.tailBaseWidth }),
  });
  const framePoint = getFollowingFramePoint({
    anchorPoint,
    bubbleCenter,
    frameRect: args.frameRect,
    ...(args.tailFramePosition === undefined ? {} : { position: args.tailFramePosition }),
    side: args.side,
  });
  return {
    ...base,
    framePoint,
    ...getRoundedTriangleTip({
      basePoint: base.bubblePoint,
      baseA: base.baseA,
      baseB: base.baseB,
      framePoint,
      side: args.side,
    }),
  };
}

function getPathGeometry(args: {
  borderWidth: number;
  bubbleRect: Rect;
  points: ReturnType<typeof getConnectorPoints>;
}) {
  const pathPoints = [
    args.points.baseA,
    args.points.baseB,
    args.points.baseEdgeA,
    args.points.baseEdgeB,
    args.points.tipA,
    args.points.tipB,
    args.points.tipPoint,
    args.points.tipVertex,
    { x: args.bubbleRect.x, y: args.bubbleRect.y },
    {
      x: args.bubbleRect.x + args.bubbleRect.width,
      y: args.bubbleRect.y + args.bubbleRect.height,
    },
  ];
  const padding = Math.max(2, args.borderWidth / 2 + 1);
  const left = Math.min(...pathPoints.map((point) => point.x)) - padding;
  const top = Math.min(...pathPoints.map((point) => point.y)) - padding;
  const right = Math.max(...pathPoints.map((point) => point.x)) + padding;
  const bottom = Math.max(...pathPoints.map((point) => point.y)) + padding;
  const local = (point: Point) => ({ x: point.x - left, y: point.y - top });

  return {
    left,
    localBaseA: local(args.points.baseA),
    localBaseB: local(args.points.baseB),
    localBaseEdgeA: local(args.points.baseEdgeA),
    localBaseEdgeB: local(args.points.baseEdgeB),
    localBubbleRect: {
      height: args.bubbleRect.height,
      width: args.bubbleRect.width,
      x: args.bubbleRect.x - left,
      y: args.bubbleRect.y - top,
    },
    localTipA: local(args.points.tipA),
    localTipB: local(args.points.tipB),
    localTipPoint: local(args.points.tipPoint),
    localTipVertex: local(args.points.tipVertex),
    right,
    top,
    bottom,
  };
}

function getBubblePerimeterPath(args: {
  baseA: Point;
  bubbleRect: Rect;
  radius: number;
  side: ConnectorSide;
}): string {
  const left = args.bubbleRect.x;
  const top = args.bubbleRect.y;
  const right = left + args.bubbleRect.width;
  const bottom = top + args.bubbleRect.height;
  const radius = Math.min(args.radius, args.bubbleRect.width / 2, args.bubbleRect.height / 2);

  switch (getOppositeSide(args.side)) {
    case 'top':
      return [
        `L ${right - radius} ${top}`,
        `Q ${right} ${top} ${right} ${top + radius}`,
        `L ${right} ${bottom - radius}`,
        `Q ${right} ${bottom} ${right - radius} ${bottom}`,
        `L ${left + radius} ${bottom}`,
        `Q ${left} ${bottom} ${left} ${bottom - radius}`,
        `L ${left} ${top + radius}`,
        `Q ${left} ${top} ${left + radius} ${top}`,
        `L ${args.baseA.x} ${args.baseA.y}`,
      ].join(' ');
    case 'right':
      return [
        `L ${right} ${bottom - radius}`,
        `Q ${right} ${bottom} ${right - radius} ${bottom}`,
        `L ${left + radius} ${bottom}`,
        `Q ${left} ${bottom} ${left} ${bottom - radius}`,
        `L ${left} ${top + radius}`,
        `Q ${left} ${top} ${left + radius} ${top}`,
        `L ${right - radius} ${top}`,
        `Q ${right} ${top} ${right} ${top + radius}`,
        `L ${args.baseA.x} ${args.baseA.y}`,
      ].join(' ');
    case 'bottom':
      return [
        `L ${right - radius} ${bottom}`,
        `Q ${right} ${bottom} ${right} ${bottom - radius}`,
        `L ${right} ${top + radius}`,
        `Q ${right} ${top} ${right - radius} ${top}`,
        `L ${left + radius} ${top}`,
        `Q ${left} ${top} ${left} ${top + radius}`,
        `L ${left} ${bottom - radius}`,
        `Q ${left} ${bottom} ${left + radius} ${bottom}`,
        `L ${args.baseA.x} ${args.baseA.y}`,
      ].join(' ');
    case 'left':
      return [
        `L ${left} ${bottom - radius}`,
        `Q ${left} ${bottom} ${left + radius} ${bottom}`,
        `L ${right - radius} ${bottom}`,
        `Q ${right} ${bottom} ${right} ${bottom - radius}`,
        `L ${right} ${top + radius}`,
        `Q ${right} ${top} ${right - radius} ${top}`,
        `L ${left + radius} ${top}`,
        `Q ${left} ${top} ${left} ${top + radius}`,
        `L ${args.baseA.x} ${args.baseA.y}`,
      ].join(' ');
  }
}

export function getDynamicTailState(args: {
  anchorPoint?: Point;
  borderRadius?: number;
  borderWidth?: number;
  bubbleRect: Rect;
  frameRect: Rect;
  preferredSide?: ConnectorSide;
  previousSide?: ConnectorSide;
  tailBasePosition?: number;
  tailBaseWidth?: number;
  tailFramePosition?: number;
  tailSize: number;
}): {
  attachment: {
    baseA: Point;
    baseB: Point;
    baseEdgeA: Point;
    baseEdgeB: Point;
    bubbleEdgePoint: Point;
    bubblePoint: Point;
    framePoint: Point;
    tipA: Point;
    tipB: Point;
    tipPoint: Point;
    tipVertex: Point;
  };
  kind: 'wedge';
  outlinePath: string;
  path: string;
  side: ConnectorSide;
  style: CSSProperties;
  viewBox: string;
} {
  const side = resolveConnectorSide(
    args.frameRect,
    args.bubbleRect,
    args.previousSide,
    args.preferredSide
  );
  const points = getConnectorPoints({ ...args, side });
  const borderWidth = Math.max(0, args.borderWidth ?? 0);
  const geometry = getPathGeometry({ borderWidth, bubbleRect: args.bubbleRect, points });
  const width = Math.max(1, geometry.right - geometry.left);
  const height = Math.max(1, geometry.bottom - geometry.top);

  return {
    attachment: {
      baseA: points.baseA,
      baseB: points.baseB,
      baseEdgeA: points.baseEdgeA,
      baseEdgeB: points.baseEdgeB,
      bubbleEdgePoint: points.bubbleEdgePoint,
      bubblePoint: points.bubblePoint,
      framePoint: points.framePoint,
      tipA: points.tipA,
      tipB: points.tipB,
      tipPoint: points.tipPoint,
      tipVertex: points.tipVertex,
    },
    outlinePath: [
      `M ${geometry.localBaseEdgeA.x} ${geometry.localBaseEdgeA.y}`,
      `L ${geometry.localTipA.x} ${geometry.localTipA.y}`,
      `Q ${geometry.localTipVertex.x} ${geometry.localTipVertex.y}` +
        ` ${geometry.localTipB.x} ${geometry.localTipB.y}`,
      `L ${geometry.localBaseEdgeB.x} ${geometry.localBaseEdgeB.y}`,
      getBubblePerimeterPath({
        baseA: geometry.localBaseEdgeA,
        bubbleRect: geometry.localBubbleRect,
        radius: Math.max(0, args.borderRadius ?? 0),
        side,
      }),
      'Z',
    ].join(' '),
    path: [
      `M ${geometry.localBaseA.x} ${geometry.localBaseA.y}`,
      `L ${geometry.localTipA.x} ${geometry.localTipA.y}`,
      `Q ${geometry.localTipVertex.x} ${geometry.localTipVertex.y}` +
        ` ${geometry.localTipB.x} ${geometry.localTipB.y}`,
      `L ${geometry.localBaseB.x} ${geometry.localBaseB.y} Z`,
    ].join(' '),
    kind: 'wedge' as const,
    side,
    style: {
      position: 'absolute',
      left: geometry.left - args.bubbleRect.x,
      top: geometry.top - args.bubbleRect.y,
      width,
      height,
      overflow: 'visible',
      pointerEvents: 'auto',
      zIndex: 0,
    },
    viewBox: `0 0 ${width} ${height}`,
  };
}
