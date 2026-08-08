import type { ConnectorSide } from './dynamic-tail';

type Point = { x: number; y: number };

const DEFAULT_LANDING_LENGTH = 24;
const MAX_AUTOMATIC_LANDING_LENGTH = 96;
const MIN_LANDING_LENGTH = 8;
const MANUAL_ANGLE_STEP = 15;
const ENDPOINT_RAIL_SNAP_DISTANCE = 10;

export type PolylineAngleSnap = {
  fixedPoint: Point;
  fixedSide: ConnectorSide;
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
  disableMagnetism?: boolean;
  point: Point;
  snap: PolylineAngleSnap;
  strict: boolean;
}): Point {
  if (!args.strict) {
    return args.disableMagnetism ? args.point : snapToEndpointRail(args.point, args.snap);
  }
  const deltaX = args.point.x - args.snap.fixedPoint.x;
  const deltaY = args.point.y - args.snap.fixedPoint.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 0.001) return args.point;
  const step = (MANUAL_ANGLE_STEP * Math.PI) / 180;
  const angle = Math.round(Math.atan2(deltaY, deltaX) / step) * step;
  return {
    x: args.snap.fixedPoint.x + Math.cos(angle) * distance,
    y: args.snap.fixedPoint.y + Math.sin(angle) * distance,
  };
}

function getPerpendicularRailCandidate(point: Point, endpoint: Point, side: ConnectorSide) {
  return isVerticalSide(side) ? { x: endpoint.x, y: point.y } : { x: point.x, y: endpoint.y };
}

function snapToEndpointRail(point: Point, snap: PolylineAngleSnap): Point {
  const candidates = [
    getPerpendicularRailCandidate(point, snap.railPoint, snap.side),
    getPerpendicularRailCandidate(point, snap.fixedPoint, snap.fixedSide),
  ];
  const nearest = candidates.reduce<{ distance: number; point: Point } | null>(
    (best, candidate) => {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      return best === null || distance < best.distance ? { distance, point: candidate } : best;
    },
    null
  );
  return nearest && nearest.distance <= ENDPOINT_RAIL_SNAP_DISTANCE ? nearest.point : point;
}

function getAutomaticControlPoint(args: PolylineAngleSnap) {
  const railAxis = getRailAxis(args.railPoint, args.side);
  const defaultPoint = createRailPoint(
    railAxis + getOutwardDirection(args.side) * DEFAULT_LANDING_LENGTH,
    args.railPoint,
    args.side
  );
  const nearest45 = getNearestRailPoint(
    defaultPoint,
    getValidAngleCandidates(args, [45]),
    args.side
  );
  if (!nearest45) return defaultPoint;
  const landingLength = Math.abs(getRailAxis(nearest45, args.side) - railAxis);
  return landingLength <= MAX_AUTOMATIC_LANDING_LENGTH ? nearest45 : defaultPoint;
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
  frameSide: ConnectorSide;
  waypoint?: Point;
}) {
  const angleSnap: PolylineAngleSnap = {
    fixedPoint: args.framePoint,
    fixedSide: args.frameSide,
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
  const point = args.waypoint ?? getAutomaticControlPoint(angleSnap);
  return {
    angle: getPolylineAngle(point, args.framePoint),
    angleSnap,
    axis: 'both' as const,
    point,
    route: [args.blockPoint, point, args.framePoint],
  };
}
