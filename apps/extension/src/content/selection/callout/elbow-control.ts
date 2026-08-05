import type { CalloutConnectorRouting } from '@sniptale/runtime-contracts/highlighter/callout';
import type { ConnectorSide } from './dynamic-tail';

type Point = { x: number; y: number };

type ElbowRouteControlAxis = 'x' | 'y' | 'both';

export type ElbowWaypointConstraint = {
  blockPoint: Point;
  blockSide: ConnectorSide;
  framePoint: Point;
  frameSide: ConnectorSide;
};

function isVerticalSide(side: ConnectorSide) {
  return side === 'top' || side === 'bottom';
}

function getSegmentAxis(from: Point, to: Point): 'x' | 'y' | null {
  if (from.x === to.x && from.y !== to.y) return 'y';
  if (from.y === to.y && from.x !== to.x) return 'x';
  return null;
}

function countRouteCorners(route: Point[]) {
  let corners = 0;
  let previousAxis: 'x' | 'y' | null = null;
  for (let index = 1; index < route.length; index += 1) {
    const axis = getSegmentAxis(route[index - 1]!, route[index]!);
    if (!axis) continue;
    if (previousAxis && previousAxis !== axis) corners += 1;
    previousAxis = axis;
  }
  return corners;
}

function getParallelControlPoint(route: Point[]) {
  const from = route.length >= 4 ? route[1]! : route[0]!;
  const to = route.length >= 4 ? route.at(-2)! : route.at(-1)!;
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

export function getElbowRouteControl(args: {
  blockSide: ConnectorSide;
  frameSide: ConnectorSide;
  route: Point[];
  routing: CalloutConnectorRouting;
}): { axis: ElbowRouteControlAxis; point: Point } | null {
  if (args.routing !== 'elbow') return null;
  const cornerCount = countRouteCorners(args.route);
  if (cornerCount === 0) return null;
  if (cornerCount === 1 && isVerticalSide(args.blockSide) !== isVerticalSide(args.frameSide)) {
    return { axis: 'both', point: args.route[1]! };
  }
  if (cornerCount === 1) return null;
  if (isVerticalSide(args.blockSide) === isVerticalSide(args.frameSide)) {
    return {
      axis: isVerticalSide(args.blockSide) ? 'y' : 'x',
      point: getParallelControlPoint(args.route),
    };
  }
  return {
    axis: 'both',
    point: args.route[Math.floor(args.route.length / 2)]!,
  };
}

function clampToOutwardHalfline(value: number, point: Point, side: ConnectorSide) {
  switch (side) {
    case 'top':
      return Math.min(value, point.y);
    case 'right':
      return Math.max(value, point.x);
    case 'bottom':
      return Math.max(value, point.y);
    case 'left':
      return Math.min(value, point.x);
  }
}

function isOnOutwardHalfline(value: number, point: Point, side: ConnectorSide) {
  return clampToOutwardHalfline(value, point, side) === value;
}

export function getPerpendicularSingleCornerRoute(args: {
  blockPoint: Point;
  blockSide: ConnectorSide;
  framePoint: Point;
  frameSide: ConnectorSide;
}): Point[] | null {
  if (isVerticalSide(args.blockSide) === isVerticalSide(args.frameSide)) return null;
  const corner = isVerticalSide(args.blockSide)
    ? { x: args.blockPoint.x, y: args.framePoint.y }
    : { x: args.framePoint.x, y: args.blockPoint.y };
  const leavesBlockOutward = isVerticalSide(args.blockSide)
    ? isOnOutwardHalfline(corner.y, args.blockPoint, args.blockSide)
    : isOnOutwardHalfline(corner.x, args.blockPoint, args.blockSide);
  const approachesFrameFromOutside = isVerticalSide(args.frameSide)
    ? isOnOutwardHalfline(corner.y, args.framePoint, args.frameSide)
    : isOnOutwardHalfline(corner.x, args.framePoint, args.frameSide);
  return leavesBlockOutward && approachesFrameFromOutside
    ? [args.blockPoint, corner, args.framePoint]
    : null;
}

export function getPerpendicularWaypointRoute(args: {
  blockPoint: Point;
  blockSide: ConnectorSide;
  framePoint: Point;
  frameSide: ConnectorSide;
  waypoint: Point;
}): Point[] {
  const waypoint = constrainPerpendicularWaypoint({
    blockPoint: args.blockPoint,
    blockSide: args.blockSide,
    framePoint: args.framePoint,
    frameSide: args.frameSide,
    waypoint: args.waypoint,
  });
  if (isVerticalSide(args.blockSide)) {
    return [
      args.blockPoint,
      { x: args.blockPoint.x, y: waypoint.y },
      waypoint,
      { x: waypoint.x, y: args.framePoint.y },
      args.framePoint,
    ];
  }
  return [
    args.blockPoint,
    { x: waypoint.x, y: args.blockPoint.y },
    waypoint,
    { x: args.framePoint.x, y: waypoint.y },
    args.framePoint,
  ];
}

export function constrainPerpendicularWaypoint(
  args: ElbowWaypointConstraint & { waypoint: Point }
): Point {
  if (isVerticalSide(args.blockSide)) {
    return {
      x: clampToOutwardHalfline(args.waypoint.x, args.framePoint, args.frameSide),
      y: clampToOutwardHalfline(args.waypoint.y, args.blockPoint, args.blockSide),
    };
  }
  return {
    x: clampToOutwardHalfline(args.waypoint.x, args.blockPoint, args.blockSide),
    y: clampToOutwardHalfline(args.waypoint.y, args.framePoint, args.frameSide),
  };
}
