import type { ConnectorSide } from './dynamic-tail';

type Point = { x: number; y: number };

const DEFAULT_LANDING_LENGTH = 24;
const MIN_LANDING_LENGTH = 8;
const MAGNETIC_SNAP_DISTANCE = 8;

export type PolylineAngleSnap = {
  fixedPoint: Point;
  railPoint: Point;
  side: ConnectorSide;
};

function isVerticalSide(side: ConnectorSide) {
  return side === 'top' || side === 'bottom';
}

function getOutwardDirection(side: ConnectorSide) {
  return side === 'top' || side === 'left' ? -1 : 1;
}

function getRailAxis(point: Point, side: ConnectorSide) {
  return isVerticalSide(side) ? point.y : point.x;
}

function createRailPoint(axis: number, railPoint: Point, side: ConnectorSide): Point {
  return isVerticalSide(side) ? { x: railPoint.x, y: axis } : { x: axis, y: railPoint.y };
}

function constrainToOutwardRail(point: Point, railPoint: Point, side: ConnectorSide): Point {
  const direction = getOutwardDirection(side);
  const railStart = getRailAxis(railPoint, side);
  const requested = getRailAxis(point, side);
  const axis =
    direction < 0
      ? Math.min(requested, railStart - MIN_LANDING_LENGTH)
      : Math.max(requested, railStart + MIN_LANDING_LENGTH);
  return createRailPoint(axis, railPoint, side);
}

function getAngleCandidates(args: PolylineAngleSnap, angle: number): Point[] {
  const radians = (angle * Math.PI) / 180;
  if (isVerticalSide(args.side)) {
    const horizontalDistance = Math.abs(args.fixedPoint.x - args.railPoint.x);
    if (angle === 90 || (angle === 0 && horizontalDistance === 0)) return [];
    const verticalDistance = angle === 0 ? 0 : horizontalDistance * Math.tan(radians);
    return [-1, 1].map((direction) =>
      createRailPoint(args.fixedPoint.y + direction * verticalDistance, args.railPoint, args.side)
    );
  }
  const verticalDistance = Math.abs(args.fixedPoint.y - args.railPoint.y);
  if (angle === 0 || (angle === 90 && verticalDistance === 0)) return [];
  const horizontalDistance = angle === 90 ? 0 : verticalDistance / Math.tan(radians);
  return [-1, 1].map((direction) =>
    createRailPoint(args.fixedPoint.x + direction * horizontalDistance, args.railPoint, args.side)
  );
}

function getValidAngleCandidates(args: PolylineAngleSnap, angles: number[]) {
  return angles.flatMap((angle) =>
    getAngleCandidates(args, angle).filter((point) => {
      const direction = getOutwardDirection(args.side);
      return (
        (getRailAxis(point, args.side) - getRailAxis(args.railPoint, args.side)) * direction >=
        MIN_LANDING_LENGTH
      );
    })
  );
}

function getNearestRailPoint(point: Point, candidates: Point[], side: ConnectorSide) {
  return candidates.reduce<Point | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    const axis = getRailAxis(point, side);
    return Math.abs(getRailAxis(candidate, side) - axis) <
      Math.abs(getRailAxis(nearest, side) - axis)
      ? candidate
      : nearest;
  }, null);
}

export function snapPolylineControlPoint(args: {
  point: Point;
  snap: PolylineAngleSnap;
  strict: boolean;
}): Point {
  const constrained = constrainToOutwardRail(args.point, args.snap.railPoint, args.snap.side);
  const angles = args.strict
    ? Array.from({ length: 7 }, (_, index) => index * 15)
    : [0, 30, 45, 60, 90];
  const nearest = getNearestRailPoint(
    constrained,
    getValidAngleCandidates(args.snap, angles),
    args.snap.side
  );
  if (!nearest) return constrained;
  const distance = Math.abs(
    getRailAxis(nearest, args.snap.side) - getRailAxis(constrained, args.snap.side)
  );
  return args.strict || distance <= MAGNETIC_SNAP_DISTANCE ? nearest : constrained;
}

function getAutomaticControlPoint(args: PolylineAngleSnap) {
  const defaultPoint = createRailPoint(
    getRailAxis(args.railPoint, args.side) +
      getOutwardDirection(args.side) * DEFAULT_LANDING_LENGTH,
    args.railPoint,
    args.side
  );
  const nearest45 = getNearestRailPoint(
    defaultPoint,
    getValidAngleCandidates(args, [45]),
    args.side
  );
  return nearest45 ?? defaultPoint;
}

function getPolylineAngle(controlPoint: Point, fixedPoint: Point) {
  const horizontal = Math.abs(fixedPoint.x - controlPoint.x);
  const vertical = Math.abs(fixedPoint.y - controlPoint.y);
  if (horizontal < 0.001) return 90;
  return Math.round((Math.atan2(vertical, horizontal) * 180) / Math.PI);
}

export function getPolylineRouteState(args: {
  blockPoint: Point;
  blockSide: ConnectorSide;
  framePoint: Point;
  waypoint?: Point;
}) {
  const angleSnap: PolylineAngleSnap = {
    fixedPoint: args.framePoint,
    railPoint: args.blockPoint,
    side: args.blockSide,
  };
  const directDistance = Math.hypot(
    args.framePoint.x - args.blockPoint.x,
    args.framePoint.y - args.blockPoint.y
  );
  if (!args.waypoint && directDistance <= 40) {
    return {
      angle: null,
      angleSnap: null,
      axis: null,
      point: null,
      route: [args.blockPoint, args.framePoint],
    };
  }
  const point = args.waypoint
    ? constrainToOutwardRail(args.waypoint, args.blockPoint, args.blockSide)
    : getAutomaticControlPoint(angleSnap);
  return {
    angle: getPolylineAngle(point, args.framePoint),
    angleSnap,
    axis: isVerticalSide(args.blockSide) ? ('y' as const) : ('x' as const),
    point,
    route: [args.blockPoint, point, args.framePoint],
  };
}
