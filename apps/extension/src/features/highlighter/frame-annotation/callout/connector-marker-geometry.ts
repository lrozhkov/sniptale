import type { CalloutConnectorMarker } from '@sniptale/runtime-contracts/highlighter/callout';

type ConnectorMarkerPoint = { x: number; y: number };

type ConnectorEndpoint = 'start' | 'end';

function normalize(vector: ConnectorMarkerPoint): ConnectorMarkerPoint {
  const length = Math.hypot(vector.x, vector.y);
  return length <= Number.EPSILON ? { x: 1, y: 0 } : { x: vector.x / length, y: vector.y / length };
}

function offset(
  point: ConnectorMarkerPoint,
  direction: ConnectorMarkerPoint,
  distance: number
): ConnectorMarkerPoint {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function getPathDirection(args: {
  adjacentPoint: ConnectorMarkerPoint;
  contactPoint: ConnectorMarkerPoint;
  endpoint: ConnectorEndpoint;
}) {
  return normalize(
    args.endpoint === 'start'
      ? {
          x: args.adjacentPoint.x - args.contactPoint.x,
          y: args.adjacentPoint.y - args.contactPoint.y,
        }
      : {
          x: args.contactPoint.x - args.adjacentPoint.x,
          y: args.contactPoint.y - args.adjacentPoint.y,
        }
  );
}

function getAngle(direction: ConnectorMarkerPoint) {
  return (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
}

function getCenteredMarkerSupport(
  marker: Extract<CalloutConnectorMarker, 'circle' | 'diamond' | 'ring-dot' | 'square'>,
  direction: ConnectorMarkerPoint,
  halfSize: number
) {
  if (marker === 'square') {
    return halfSize / Math.max(Math.abs(direction.x), Math.abs(direction.y));
  }
  if (marker === 'diamond') {
    return halfSize / Math.max(Number.EPSILON, Math.abs(direction.x) + Math.abs(direction.y));
  }
  return halfSize;
}

export function getConnectorEndpointGeometry(args: {
  adjacentPoint: ConnectorMarkerPoint;
  boundaryWidth: number;
  contactPoint: ConnectorMarkerPoint;
  endpoint: ConnectorEndpoint;
  lineWidth: number;
  marker: CalloutConnectorMarker;
  markerSize: number;
}) {
  const pathDirection = getPathDirection(args);
  const outsideDirection =
    args.endpoint === 'start' ? pathDirection : { x: -pathDirection.x, y: -pathDirection.y };
  const markerDirection = { x: -outsideDirection.x, y: -outsideDirection.y };
  const markerSize = Math.max(4, args.markerSize);
  const support = markerSize / 2;
  const boundaryClearance = Math.max(0, args.boundaryWidth) / 2;

  if (args.marker === 'none') {
    return {
      angle: getAngle(markerDirection),
      linePoint: offset(args.contactPoint, outsideDirection, boundaryClearance),
      markerPoint: args.contactPoint,
      tipPoint: args.contactPoint,
    };
  }

  if (
    args.marker === 'ring-dot' ||
    args.marker === 'circle' ||
    args.marker === 'square' ||
    args.marker === 'diamond'
  ) {
    const centeredSupport = getCenteredMarkerSupport(args.marker, outsideDirection, support);
    return {
      angle: getAngle(markerDirection),
      linePoint: offset(args.contactPoint, outsideDirection, centeredSupport),
      markerPoint: args.contactPoint,
      tipPoint: args.contactPoint,
    };
  }

  const edgeClearance = boundaryClearance + Math.max(1, args.lineWidth / 2);
  const tipPoint = offset(args.contactPoint, outsideDirection, edgeClearance);
  const markerPoint = offset(tipPoint, outsideDirection, support);

  return {
    angle: getAngle(markerDirection),
    linePoint: offset(markerPoint, outsideDirection, support),
    markerPoint,
    tipPoint,
  };
}
