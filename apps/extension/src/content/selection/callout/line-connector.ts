import type { CSSProperties } from 'react';
import type {
  CalloutConnectorMarker,
  CalloutConnectorRouting,
  CalloutPlacement,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';
import { getCalloutPerimeterPoint } from './tail-drag';
import { getConnectorEndpointGeometry } from './connector-marker-geometry';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type PerimeterSide = ConnectorSide;

const ENDPOINT_CLEARANCE = 16;

function createPath(points: Point[], left: number, top: number): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x - left} ${point.y - top}`)
    .join(' ');
}

function getOppositeSide(side: PerimeterSide): PerimeterSide {
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

function getPerimeterSide(rect: Rect, position: number): PerimeterSide {
  const perimeter = Math.max(1, 2 * (rect.width + rect.height));
  let distance = Math.max(0, Math.min(position, 1)) * perimeter;
  if (distance <= rect.width) return 'top';
  distance -= rect.width;
  if (distance <= rect.height) return 'right';
  distance -= rect.height;
  if (distance <= rect.width) return 'bottom';
  return 'left';
}

function offsetOutward(point: Point, side: PerimeterSide, clearance: number): Point {
  const direction = getOutwardDirection(side);
  return {
    x: point.x + direction.x * clearance,
    y: point.y + direction.y * clearance,
  };
}

function getOutwardDirection(side: PerimeterSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
  }
}

function isVerticalSide(side: PerimeterSide) {
  return side === 'top' || side === 'bottom';
}

function compactRoute(points: Point[]): Point[] {
  return points.reduce<Point[]>((route, point) => {
    const previous = route.at(-1);
    if (previous?.x === point.x && previous.y === point.y) return route;
    const beforePrevious = route.at(-2);
    if (
      beforePrevious &&
      previous &&
      ((beforePrevious.x === previous.x && previous.x === point.x) ||
        (beforePrevious.y === previous.y && previous.y === point.y)) &&
      (previous.x - beforePrevious.x) * (point.x - previous.x) +
        (previous.y - beforePrevious.y) * (point.y - previous.y) >
        0
    ) {
      route[route.length - 1] = point;
      return route;
    }
    route.push(point);
    return route;
  }, []);
}

function canConnectStubsDirectly(
  blockStub: Point,
  frameStub: Point,
  blockSide: PerimeterSide,
  frameSide: PerimeterSide
) {
  const delta = { x: frameStub.x - blockStub.x, y: frameStub.y - blockStub.y };
  const blockOutward = getOutwardDirection(blockSide);
  const frameInward = getOutwardDirection(getOppositeSide(frameSide));
  return (
    (delta.x === 0 || delta.y === 0) &&
    delta.x * blockOutward.x + delta.y * blockOutward.y > 0 &&
    delta.x * frameInward.x + delta.y * frameInward.y > 0
  );
}

function canUseDirectRoute(
  blockPoint: Point,
  framePoint: Point,
  blockSide: PerimeterSide,
  frameSide: PerimeterSide
) {
  const delta = { x: framePoint.x - blockPoint.x, y: framePoint.y - blockPoint.y };
  const blockOutward = getOutwardDirection(blockSide);
  const frameInward = getOutwardDirection(getOppositeSide(frameSide));
  return (
    delta.x * blockOutward.x + delta.y * blockOutward.y >= 0 &&
    delta.x * frameInward.x + delta.y * frameInward.y >= 0
  );
}

function segmentCrossesRectInterior(from: Point, to: Point, rect: Rect) {
  if (from.x === to.x) {
    return (
      from.x > rect.x &&
      from.x < rect.x + rect.width &&
      Math.min(from.y, to.y) < rect.y + rect.height &&
      Math.max(from.y, to.y) > rect.y
    );
  }
  return (
    from.y > rect.y &&
    from.y < rect.y + rect.height &&
    Math.min(from.x, to.x) < rect.x + rect.width &&
    Math.max(from.x, to.x) > rect.x
  );
}

function getRouteScore(points: Point[], obstacles: Rect[]) {
  let crossings = 0;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    length += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    crossings += obstacles.filter((rect) => segmentCrossesRectInterior(from, to, rect)).length;
  }
  return crossings * 1_000_000 + length;
}

function selectBestRoute(routes: Point[][], obstacles: Rect[]) {
  return routes.reduce(
    (best, route) =>
      getRouteScore(route, obstacles) < getRouteScore(best, obstacles) ? route : best,
    routes[0]!
  );
}

function getOrthogonalBridge(
  blockStub: Point,
  frameStub: Point,
  blockSide: PerimeterSide,
  frameSide: PerimeterSide,
  obstacles: Rect[],
  clearance: number
): Point[] {
  if (canConnectStubsDirectly(blockStub, frameStub, blockSide, frameSide)) {
    return [blockStub, frameStub];
  }

  const channelXCoordinates = [
    (blockStub.x + frameStub.x) / 2,
    Math.min(...obstacles.map((rect) => rect.x)) - clearance,
    Math.max(...obstacles.map((rect) => rect.x + rect.width)) + clearance,
  ];
  const channelYCoordinates = [
    (blockStub.y + frameStub.y) / 2,
    Math.min(...obstacles.map((rect) => rect.y)) - clearance,
    Math.max(...obstacles.map((rect) => rect.y + rect.height)) + clearance,
  ];
  const routes = [
    [blockStub, { x: frameStub.x, y: blockStub.y }, frameStub],
    [blockStub, { x: blockStub.x, y: frameStub.y }, frameStub],
    ...channelXCoordinates.map((channelX) => [
      blockStub,
      { x: channelX, y: blockStub.y },
      { x: channelX, y: frameStub.y },
      frameStub,
    ]),
    ...channelYCoordinates.map((channelY) => [
      blockStub,
      { x: blockStub.x, y: channelY },
      { x: frameStub.x, y: channelY },
      frameStub,
    ]),
  ].map(compactRoute);
  return selectBestRoute(routes, obstacles);
}

function getSafeWaypoint(args: {
  blockPoint: Point;
  blockSide: PerimeterSide;
  clearance: number;
  framePoint: Point;
  frameSide: PerimeterSide;
  obstacles: Rect[];
  waypoint: Point;
}) {
  if (isVerticalSide(args.blockSide)) {
    if (args.blockSide === args.frameSide) {
      const exteriorY =
        args.blockSide === 'top'
          ? Math.min(...args.obstacles.map((rect) => rect.y)) - args.clearance
          : Math.max(...args.obstacles.map((rect) => rect.y + rect.height)) + args.clearance;
      return {
        ...args.waypoint,
        y:
          args.blockSide === 'top'
            ? Math.min(args.waypoint.y, exteriorY)
            : Math.max(args.waypoint.y, exteriorY),
      };
    }
    return {
      ...args.waypoint,
      y: Math.max(
        Math.min(args.blockPoint.y, args.framePoint.y),
        Math.min(args.waypoint.y, Math.max(args.blockPoint.y, args.framePoint.y))
      ),
    };
  }

  if (args.blockSide === args.frameSide) {
    const exteriorX =
      args.blockSide === 'left'
        ? Math.min(...args.obstacles.map((rect) => rect.x)) - args.clearance
        : Math.max(...args.obstacles.map((rect) => rect.x + rect.width)) + args.clearance;
    return {
      ...args.waypoint,
      x:
        args.blockSide === 'left'
          ? Math.min(args.waypoint.x, exteriorX)
          : Math.max(args.waypoint.x, exteriorX),
    };
  }
  return {
    ...args.waypoint,
    x: Math.max(
      Math.min(args.blockPoint.x, args.framePoint.x),
      Math.min(args.waypoint.x, Math.max(args.blockPoint.x, args.framePoint.x))
    ),
  };
}

function getRoute(args: {
  blockPoint: Point;
  blockSide: PerimeterSide;
  framePoint: Point;
  frameSide: PerimeterSide;
  obstacles: Rect[];
  routing: CalloutConnectorRouting;
  endpointClearance: number;
  waypoint?: Point;
}) {
  const { blockPoint, blockSide, endpointClearance, framePoint, frameSide, obstacles, routing } =
    args;
  if (routing === 'straight') return [blockPoint, framePoint];
  const directDistance = Math.hypot(framePoint.x - blockPoint.x, framePoint.y - blockPoint.y);
  const nearlyAligned =
    Math.min(Math.abs(framePoint.x - blockPoint.x), Math.abs(framePoint.y - blockPoint.y)) <= 6;
  if (
    canUseDirectRoute(blockPoint, framePoint, blockSide, frameSide) &&
    (directDistance <= endpointClearance * 2 || nearlyAligned)
  ) {
    return [blockPoint, framePoint];
  }
  const parallelEndpointAxes = isVerticalSide(blockSide) === isVerticalSide(frameSide);
  if (args.waypoint && parallelEndpointAxes) {
    const controlledAxisHasSpan = isVerticalSide(blockSide)
      ? Math.abs(framePoint.x - blockPoint.x) > 6
      : Math.abs(framePoint.y - blockPoint.y) > 6;
    if (!controlledAxisHasSpan) return [blockPoint, framePoint];
    const waypoint = getSafeWaypoint({
      blockPoint,
      blockSide,
      clearance: endpointClearance,
      framePoint,
      frameSide,
      obstacles,
      waypoint: args.waypoint,
    });
    return isVerticalSide(blockSide)
      ? compactRoute([
          blockPoint,
          { x: blockPoint.x, y: waypoint.y },
          { x: framePoint.x, y: waypoint.y },
          framePoint,
        ])
      : compactRoute([
          blockPoint,
          { x: waypoint.x, y: blockPoint.y },
          { x: waypoint.x, y: framePoint.y },
          framePoint,
        ]);
  }
  const blockStub = offsetOutward(blockPoint, blockSide, endpointClearance);
  const frameStub = offsetOutward(framePoint, frameSide, endpointClearance);
  return compactRoute([
    blockPoint,
    ...getOrthogonalBridge(
      blockStub,
      frameStub,
      blockSide,
      frameSide,
      obstacles,
      endpointClearance
    ),
    framePoint,
  ]);
}

function getRouteControlPoint(route: Point[]) {
  const from = route.length >= 4 ? route[1]! : route[0]!;
  const to = route.length >= 4 ? route.at(-2)! : route.at(-1)!;
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
}

type LineConnectorArgs = {
  anchorPoint: Point;
  blockBoundaryWidth: number;
  blockMarker: CalloutConnectorMarker;
  blockMarkerSize: number;
  bubbleRect: Rect;
  frameBoundaryWidth: number;
  frameMarker: CalloutConnectorMarker;
  frameMarkerSize: number;
  frameRect: Rect;
  lineWidth: number;
  placement: CalloutPlacement;
  previousSide?: ConnectorSide;
  preferredSide?: ConnectorSide;
  routing: CalloutConnectorRouting;
  wedgeSize: number;
};

function getConnectorAttachment(args: LineConnectorArgs) {
  const attachment = getDynamicTailState({
    anchorPoint: args.anchorPoint,
    bubbleRect: args.bubbleRect,
    frameRect: args.frameRect,
    ...(args.preferredSide ? { preferredSide: args.preferredSide } : {}),
    ...(args.previousSide ? { previousSide: args.previousSide } : {}),
    tailSize: args.wedgeSize,
  });
  const blockPoint =
    args.placement.connectorBasePosition === undefined
      ? attachment.attachment.bubbleEdgePoint
      : getCalloutPerimeterPoint(args.bubbleRect, args.placement.connectorBasePosition);
  const framePoint =
    args.placement.connectorFramePosition === undefined
      ? attachment.attachment.framePoint
      : getCalloutPerimeterPoint(args.frameRect, args.placement.connectorFramePosition);
  const blockSide =
    args.placement.connectorBasePosition === undefined
      ? getOppositeSide(attachment.side)
      : getPerimeterSide(args.bubbleRect, args.placement.connectorBasePosition);
  const frameSide =
    args.placement.connectorFramePosition === undefined
      ? attachment.side
      : getPerimeterSide(args.frameRect, args.placement.connectorFramePosition);
  return { attachment, blockPoint, blockSide, framePoint, frameSide };
}

function getEndpointClearance(args: LineConnectorArgs) {
  return Math.max(
    ENDPOINT_CLEARANCE,
    (args.blockMarker === 'none' ? 0 : args.blockMarkerSize) +
      args.blockBoundaryWidth +
      args.lineWidth,
    (args.frameMarker === 'none' ? 0 : args.frameMarkerSize) +
      args.frameBoundaryWidth +
      args.lineWidth
  );
}

function getPlacementWaypoint(args: LineConnectorArgs): Point | undefined {
  const waypoint = args.placement.connectorWaypoint;
  if (!waypoint) return undefined;
  return {
    x: args.frameRect.x + args.frameRect.width / 2 + waypoint.centerOffsetX,
    y: args.frameRect.y + args.frameRect.height / 2 + waypoint.centerOffsetY,
  };
}

function getRouteControlAxis(args: {
  blockPoint: Point;
  blockSide: PerimeterSide;
  framePoint: Point;
  frameSide: PerimeterSide;
  route: Point[];
  routing: CalloutConnectorRouting;
}) {
  if (
    args.routing !== 'elbow' ||
    args.route.length <= 2 ||
    isVerticalSide(args.blockSide) !== isVerticalSide(args.frameSide)
  ) {
    return null;
  }
  const controlledAxisHasSpan = isVerticalSide(args.blockSide)
    ? Math.abs(args.framePoint.x - args.blockPoint.x) > 6
    : Math.abs(args.framePoint.y - args.blockPoint.y) > 6;
  if (!controlledAxisHasSpan) return null;
  return isVerticalSide(args.blockSide) ? ('y' as const) : ('x' as const);
}

export function getLineConnectorState(args: LineConnectorArgs) {
  const { attachment, blockPoint, blockSide, framePoint, frameSide } = getConnectorAttachment(args);
  const endpointClearance = getEndpointClearance(args);
  const waypoint = getPlacementWaypoint(args);
  const route = getRoute({
    blockPoint,
    blockSide,
    framePoint,
    frameSide,
    obstacles: [args.bubbleRect, args.frameRect],
    routing: args.routing,
    endpointClearance,
    ...(waypoint ? { waypoint } : {}),
  });
  const routeControlAxis = getRouteControlAxis({
    blockPoint,
    blockSide,
    framePoint,
    frameSide,
    route,
    routing: args.routing,
  });
  const blockMarkerGeometry = getConnectorEndpointGeometry({
    adjacentPoint: route[1]!,
    boundaryWidth: args.blockBoundaryWidth,
    contactPoint: blockPoint,
    endpoint: 'start',
    lineWidth: args.lineWidth,
    marker: args.blockMarker,
    markerSize: args.blockMarkerSize,
  });
  const frameMarkerGeometry = getConnectorEndpointGeometry({
    adjacentPoint: route.at(-2)!,
    boundaryWidth: args.frameBoundaryWidth,
    contactPoint: framePoint,
    endpoint: 'end',
    lineWidth: args.lineWidth,
    marker: args.frameMarker,
    markerSize: args.frameMarkerSize,
  });
  const renderRoute = [
    blockMarkerGeometry.linePoint,
    ...route.slice(1, -1),
    frameMarkerGeometry.linePoint,
  ];
  const boundsPoints = [
    ...renderRoute,
    blockMarkerGeometry.markerPoint,
    frameMarkerGeometry.markerPoint,
  ];
  const blockMarkerSize = args.blockMarker === 'none' ? 0 : args.blockMarkerSize;
  const frameMarkerSize = args.frameMarker === 'none' ? 0 : args.frameMarkerSize;
  const padding = Math.max(blockMarkerSize, frameMarkerSize, args.lineWidth) / 2 + 4;
  const left = Math.min(...boundsPoints.map((point) => point.x)) - padding;
  const top = Math.min(...boundsPoints.map((point) => point.y)) - padding;
  const right = Math.max(...boundsPoints.map((point) => point.x)) + padding;
  const bottom = Math.max(...boundsPoints.map((point) => point.y)) + padding;
  const style: CSSProperties = {
    position: 'absolute',
    left: left - args.bubbleRect.x,
    top: top - args.bubbleRect.y,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    overflow: 'visible',
    pointerEvents: 'auto',
    zIndex: 0,
  };

  return {
    attachment: {
      ...attachment.attachment,
      baseA: blockPoint,
      baseB: blockPoint,
      baseEdgeA: blockPoint,
      baseEdgeB: blockPoint,
      bubbleEdgePoint: blockPoint,
      bubblePoint: blockPoint,
      framePoint,
      tipPoint: framePoint,
    },
    blockPoint: {
      x: blockMarkerGeometry.markerPoint.x - left,
      y: blockMarkerGeometry.markerPoint.y - top,
    },
    blockAngle: blockMarkerGeometry.angle,
    framePoint: {
      x: frameMarkerGeometry.markerPoint.x - left,
      y: frameMarkerGeometry.markerPoint.y - top,
    },
    frameAngle: frameMarkerGeometry.angle,
    kind: 'line' as const,
    path: createPath(renderRoute, left, top),
    routeControlAxis,
    routeControlPoint: routeControlAxis ? getRouteControlPoint(route) : null,
    routePoints: route,
    side: attachment.side,
    style,
    viewBox: `0 0 ${Math.max(1, right - left)} ${Math.max(1, bottom - top)}`,
  };
}
