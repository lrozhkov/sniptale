import type { CSSProperties } from 'react';
import type {
  CalloutConnectorCornerStyle,
  CalloutConnectorMarker,
  CalloutConnectorRouting,
  CalloutConnectorSpacing,
  CalloutCurveSettings,
  CalloutPlacement,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';
import { getCalloutPerimeterPoint } from './tail-drag';
import { getConnectorEndpointGeometry } from './connector-marker-geometry';
import {
  getElbowRouteControl,
  getPerpendicularSingleCornerRoute,
  getPerpendicularWaypointRoute,
  type ElbowWaypointConstraint,
} from './elbow-control';
import { getPolylineRouteState } from './polyline-control';
import { createRoundedConnectorPath } from './line-path';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type PerimeterSide = ConnectorSide;

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

function routeCrossesObstacle(points: Point[], obstacles: Rect[]) {
  for (let index = 1; index < points.length; index += 1) {
    if (
      obstacles.some((rect) => segmentCrossesRectInterior(points[index - 1]!, points[index]!, rect))
    ) {
      return true;
    }
  }
  return false;
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

function inflateRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
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
  const singleCornerRoute = getAvailableSingleCornerRoute(args);
  if (singleCornerRoute) return singleCornerRoute;
  const parallelEndpointAxes = isVerticalSide(blockSide) === isVerticalSide(frameSide);
  if (args.waypoint && parallelEndpointAxes) return getParallelWaypointRoute(args);
  if (args.waypoint) {
    return compactRoute(
      getPerpendicularWaypointRoute({
        blockPoint,
        blockSide,
        framePoint,
        frameSide,
        waypoint: args.waypoint,
      })
    );
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

function getAvailableSingleCornerRoute(args: Parameters<typeof getRoute>[0]) {
  if (args.waypoint) return null;
  const route = getPerpendicularSingleCornerRoute(args);
  return route && !routeCrossesObstacle(route, args.obstacles) ? route : null;
}

function getParallelWaypointRoute(args: Parameters<typeof getRoute>[0]): Point[] {
  const { blockPoint, blockSide, endpointClearance, framePoint, frameSide, obstacles } = args;
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
    waypoint: args.waypoint!,
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

type LineConnectorArgs = {
  anchorPoint: Point;
  blockBoundaryWidth: number;
  blockMarker: CalloutConnectorMarker;
  blockMarkerSize: number;
  bubbleOffset?: Point;
  bubbleRect: Rect;
  cornerStyle?: CalloutConnectorCornerStyle;
  curve?: CalloutCurveSettings;
  frameBoundaryWidth: number;
  frameMarker: CalloutConnectorMarker;
  frameMarkerSize: number;
  frameRect: Rect;
  lineWidth: number;
  placement: CalloutPlacement;
  previousSide?: ConnectorSide;
  preferredSide?: ConnectorSide;
  routing: CalloutConnectorRouting;
  spacing?: CalloutConnectorSpacing;
  wedgeSize: number;
};

const DEFAULT_SPACING: CalloutConnectorSpacing = {
  blockGap: 0,
  frameGap: 0,
  minimumEndSegment: 16,
  obstacleMargin: 0,
};

const DEFAULT_CURVE: CalloutCurveSettings = { curvature: 0.35, mode: 'auto' };
const DEFAULT_CORNER_STYLE: CalloutConnectorCornerStyle = { kind: 'sharp', radius: 8 };

function getConnectorSpacing(args: LineConnectorArgs) {
  return args.spacing ?? DEFAULT_SPACING;
}

function addPoint(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function getCurveRoute(args: {
  blockPoint: Point;
  blockSide: PerimeterSide;
  curve: CalloutCurveSettings;
  framePoint: Point;
  frameSide: PerimeterSide;
  minimumEndSegment: number;
}) {
  const distance = Math.hypot(
    args.framePoint.x - args.blockPoint.x,
    args.framePoint.y - args.blockPoint.y
  );
  const handleLength = Math.max(
    args.minimumEndSegment,
    Math.min(distance * 0.72, distance * (0.18 + args.curve.curvature * 0.42))
  );
  const blockDirection = getOutwardDirection(args.blockSide);
  const frameDirection = getOutwardDirection(args.frameSide);
  const automaticControls = [
    addPoint(args.blockPoint, {
      x: blockDirection.x * handleLength,
      y: blockDirection.y * handleLength,
    }),
    addPoint(args.framePoint, {
      x: frameDirection.x * handleLength,
      y: frameDirection.y * handleLength,
    }),
  ] as const;
  return {
    controls: [
      args.curve.mode === 'manual' && args.curve.startHandle
        ? addPoint(args.blockPoint, args.curve.startHandle)
        : automaticControls[0],
      args.curve.mode === 'manual' && args.curve.endHandle
        ? addPoint(args.framePoint, args.curve.endHandle)
        : automaticControls[1],
    ] as const,
    points: [args.blockPoint, args.framePoint],
  };
}

function createCurvePath(
  start: Point,
  controls: readonly [Point, Point],
  end: Point,
  left: number,
  top: number
) {
  return (
    `M ${start.x - left} ${start.y - top} ` +
    `C ${controls[0].x - left} ${controls[0].y - top} ` +
    `${controls[1].x - left} ${controls[1].y - top} ${end.x - left} ${end.y - top}`
  );
}

function getConnectorAttachment(args: LineConnectorArgs) {
  const attachment = getDynamicTailState({
    anchorPoint: args.anchorPoint,
    ...(args.bubbleOffset ? { bubbleOffset: args.bubbleOffset } : {}),
    bubbleRect: args.bubbleRect,
    frameRect: args.frameRect,
    ...(args.preferredSide ? { preferredSide: args.preferredSide } : {}),
    ...(args.previousSide ? { previousSide: args.previousSide } : {}),
    tailSize: args.wedgeSize,
  });
  const blockBoundaryPoint =
    args.placement.connectorBasePosition === undefined
      ? attachment.attachment.bubbleEdgePoint
      : getCalloutPerimeterPoint(args.bubbleRect, args.placement.connectorBasePosition);
  const frameBoundaryPoint =
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
  const spacing = getConnectorSpacing(args);
  const blockPoint = offsetOutward(blockBoundaryPoint, blockSide, spacing.blockGap);
  const framePoint = offsetOutward(frameBoundaryPoint, frameSide, spacing.frameGap);
  return {
    attachment,
    blockBoundaryPoint,
    blockPoint,
    blockSide,
    frameBoundaryPoint,
    framePoint,
    frameSide,
  };
}

function getEndpointClearance(args: LineConnectorArgs) {
  return Math.max(
    getConnectorSpacing(args).minimumEndSegment,
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

function getLineConnectorRenderGeometry(args: {
  connector: LineConnectorArgs;
  curveState: ReturnType<typeof getCurveRoute> | null;
  route: Point[];
  blockPoint: Point;
  framePoint: Point;
}) {
  const { connector, curveState, route } = args;
  const blockMarkerGeometry = getConnectorEndpointGeometry({
    adjacentPoint: curveState?.controls[0] ?? route[1]!,
    boundaryWidth: connector.blockBoundaryWidth,
    contactPoint: args.blockPoint,
    endpoint: 'start',
    lineWidth: connector.lineWidth,
    marker: connector.blockMarker,
    markerSize: connector.blockMarkerSize,
  });
  const frameMarkerGeometry = getConnectorEndpointGeometry({
    adjacentPoint: curveState?.controls[1] ?? route.at(-2)!,
    boundaryWidth: connector.frameBoundaryWidth,
    contactPoint: args.framePoint,
    endpoint: 'end',
    lineWidth: connector.lineWidth,
    marker: connector.frameMarker,
    markerSize: connector.frameMarkerSize,
  });
  const renderRoute = [
    blockMarkerGeometry.linePoint,
    ...route.slice(1, -1),
    frameMarkerGeometry.linePoint,
  ];
  const boundsPoints = [
    ...renderRoute,
    ...(curveState?.controls ?? []),
    blockMarkerGeometry.markerPoint,
    frameMarkerGeometry.markerPoint,
  ];
  const blockMarkerSize = connector.blockMarker === 'none' ? 0 : connector.blockMarkerSize;
  const frameMarkerSize = connector.frameMarker === 'none' ? 0 : connector.frameMarkerSize;
  const padding = Math.max(blockMarkerSize, frameMarkerSize, connector.lineWidth) / 2 + 4;
  const left = Math.min(...boundsPoints.map((point) => point.x)) - padding;
  const top = Math.min(...boundsPoints.map((point) => point.y)) - padding;
  const right = Math.max(...boundsPoints.map((point) => point.x)) + padding;
  const bottom = Math.max(...boundsPoints.map((point) => point.y)) + padding;
  return {
    blockMarkerGeometry,
    bounds: { bottom, left, right, top },
    frameMarkerGeometry,
    renderRoute,
  };
}

function getLineConnectorSvgStyle(
  bounds: { bottom: number; left: number; right: number; top: number },
  bubbleRect: Rect
): CSSProperties {
  return {
    position: 'absolute',
    left: bounds.left - bubbleRect.x,
    top: bounds.top - bubbleRect.y,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: 0,
  };
}

export function getLineConnectorState(args: LineConnectorArgs) {
  const {
    attachment,
    blockBoundaryPoint,
    blockPoint,
    blockSide,
    frameBoundaryPoint,
    framePoint,
    frameSide,
  } = getConnectorAttachment(args);
  const endpointClearance = getEndpointClearance(args);
  const spacing = getConnectorSpacing(args);
  const waypoint = getPlacementWaypoint(args);
  const routeState = getLineRouteState({
    args,
    blockPoint,
    blockSide,
    endpointClearance,
    framePoint,
    frameSide,
    spacing,
    ...(waypoint ? { waypoint } : {}),
  });
  const { curveState, polylineState, route } = routeState;
  const routeControl =
    args.routing === 'curve'
      ? null
      : (polylineState ??
        getElbowRouteControl({ blockSide, frameSide, route, routing: args.routing }));
  const routeControlConstraint: ElbowWaypointConstraint | null =
    args.routing === 'elbow' && isVerticalSide(blockSide) !== isVerticalSide(frameSide)
      ? { blockPoint, blockSide, framePoint, frameSide }
      : null;
  const presentation = getLineConnectorRenderGeometry({
    blockPoint,
    connector: args,
    curveState,
    framePoint,
    route,
  });
  const { blockMarkerGeometry, bounds, frameMarkerGeometry, renderRoute } = presentation;
  const style = getLineConnectorSvgStyle(bounds, args.bubbleRect);

  return createLineConnectorState({
    args,
    attachment,
    blockBoundaryPoint,
    blockMarkerGeometry,
    bounds,
    curveState,
    frameBoundaryPoint,
    frameMarkerGeometry,
    polylineState,
    renderRoute,
    route,
    routeControl,
    routeControlConstraint,
    style,
  });
}

function getLineRouteState(input: {
  args: LineConnectorArgs;
  blockPoint: Point;
  blockSide: PerimeterSide;
  endpointClearance: number;
  framePoint: Point;
  frameSide: PerimeterSide;
  spacing: CalloutConnectorSpacing;
  waypoint?: Point;
}) {
  const {
    args,
    blockPoint,
    blockSide,
    endpointClearance,
    framePoint,
    frameSide,
    spacing,
    waypoint,
  } = input;
  const curveState =
    args.routing === 'curve'
      ? getCurveRoute({
          blockPoint,
          blockSide,
          curve: args.curve ?? DEFAULT_CURVE,
          framePoint,
          frameSide,
          minimumEndSegment: spacing.minimumEndSegment,
        })
      : null;
  const polylineState =
    args.routing === 'polyline'
      ? getPolylineRouteState({
          blockPoint,
          blockSide,
          framePoint,
          frameSide,
          ...(waypoint ? { waypoint } : {}),
        })
      : null;
  const route =
    curveState?.points ??
    polylineState?.route ??
    getRoute({
      blockPoint,
      blockSide,
      framePoint,
      frameSide,
      obstacles: [args.bubbleRect, args.frameRect].map((rect) =>
        inflateRect(rect, spacing.obstacleMargin)
      ),
      routing: args.routing,
      endpointClearance,
      ...(waypoint ? { waypoint } : {}),
    });
  return { curveState, polylineState, route };
}

function createLineConnectorState(input: {
  args: LineConnectorArgs;
  attachment: ReturnType<typeof getConnectorAttachment>['attachment'];
  blockBoundaryPoint: Point;
  blockMarkerGeometry: ReturnType<typeof getLineConnectorRenderGeometry>['blockMarkerGeometry'];
  bounds: { bottom: number; left: number; right: number; top: number };
  curveState: ReturnType<typeof getCurveRoute> | null;
  frameBoundaryPoint: Point;
  frameMarkerGeometry: ReturnType<typeof getLineConnectorRenderGeometry>['frameMarkerGeometry'];
  polylineState: ReturnType<typeof getPolylineRouteState> | null;
  renderRoute: Point[];
  route: Point[];
  routeControl:
    | ReturnType<typeof getElbowRouteControl>
    | ReturnType<typeof getPolylineRouteState>
    | null;
  routeControlConstraint: ElbowWaypointConstraint | null;
  style: CSSProperties;
}) {
  const {
    args,
    attachment,
    blockBoundaryPoint,
    blockMarkerGeometry,
    bounds,
    curveState,
    frameBoundaryPoint,
    frameMarkerGeometry,
    polylineState,
    renderRoute,
    route,
    routeControl,
    routeControlConstraint,
    style,
  } = input;
  const { bottom, left, right, top } = bounds;
  return {
    attachment: {
      ...attachment.attachment,
      baseA: blockBoundaryPoint,
      baseB: blockBoundaryPoint,
      baseEdgeA: blockBoundaryPoint,
      baseEdgeB: blockBoundaryPoint,
      bubbleEdgePoint: blockBoundaryPoint,
      bubblePoint: blockBoundaryPoint,
      framePoint: frameBoundaryPoint,
      tipPoint: frameBoundaryPoint,
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
    path: curveState
      ? createCurvePath(renderRoute[0]!, curveState.controls, renderRoute.at(-1)!, left, top)
      : createRoundedConnectorPath(
          renderRoute,
          left,
          top,
          args.cornerStyle ?? DEFAULT_CORNER_STYLE
        ),
    curveHandles: curveState
      ? {
          end: curveState.controls[1],
          start: curveState.controls[0],
        }
      : null,
    routeControlAxis: routeControl?.axis ?? null,
    routeControlAngle: polylineState?.angle ?? null,
    routeControlAngleSnap: polylineState?.angleSnap ?? null,
    routeControlConstraint,
    routeControlPoint: routeControl?.point ?? null,
    routePoints: route,
    side: attachment.side,
    style,
    viewBox: `0 0 ${Math.max(1, right - left)} ${Math.max(1, bottom - top)}`,
  };
}
