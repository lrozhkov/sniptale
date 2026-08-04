import type { CalloutConnectorWaypoint } from '@sniptale/runtime-contracts/highlighter/callout';
import type { getCalloutLayoutState } from './layout';
import { getCalloutEdgePosition, getCalloutPerimeterPosition } from './tail-drag';

type Rect = { x: number; y: number; width: number; height: number };
type ConnectorGeometry = {
  connectorBasePosition?: number;
  connectorBaseWidth?: number;
  connectorFramePosition?: number;
  connectorWaypoint?: CalloutConnectorWaypoint;
};

function translatePoint(point: { x: number; y: number }, delta: { x: number; y: number }) {
  return { x: point.x + delta.x, y: point.y + delta.y };
}

function toWaypoint(frameRect: Rect, point: { x: number; y: number }): CalloutConnectorWaypoint {
  return {
    centerOffsetX: point.x - (frameRect.x + frameRect.width / 2),
    centerOffsetY: point.y - (frameRect.y + frameRect.height / 2),
  };
}

export function getStationaryConnectorWaypoint(
  currentLayout: ReturnType<typeof getCalloutLayoutState>,
  frameRect: Rect,
  currentWaypoint: CalloutConnectorWaypoint | undefined
): CalloutConnectorWaypoint | undefined {
  if (currentWaypoint) return currentWaypoint;
  const connector = currentLayout.dynamicTail;
  return connector?.kind === 'line' && connector.routeControlPoint
    ? toWaypoint(frameRect, connector.routeControlPoint)
    : undefined;
}

export function getTranslatedConnectorGeometry(
  currentLayout: ReturnType<typeof getCalloutLayoutState>,
  nextLayout: ReturnType<typeof getCalloutLayoutState>,
  frameRect: Rect,
  currentWaypoint: CalloutConnectorWaypoint | undefined
): ConnectorGeometry {
  const currentConnector = currentLayout.dynamicTail;
  const nextConnector = nextLayout.dynamicTail;
  if (!currentConnector || !nextConnector || currentConnector.kind !== nextConnector.kind)
    return {};
  const delta = {
    x: nextLayout.calloutPos.x - currentLayout.calloutPos.x,
    y: nextLayout.calloutPos.y - currentLayout.calloutPos.y,
  };
  const nextBubbleRect = {
    ...nextLayout.calloutPos,
    ...nextLayout.calloutDimensions,
  };
  if (currentConnector.kind === 'line') {
    const currentControlPoint = currentWaypoint
      ? {
          x: frameRect.x + frameRect.width / 2 + currentWaypoint.centerOffsetX,
          y: frameRect.y + frameRect.height / 2 + currentWaypoint.centerOffsetY,
        }
      : currentConnector.routeControlPoint;
    return {
      connectorBasePosition: getCalloutPerimeterPosition(
        nextBubbleRect,
        translatePoint(currentConnector.attachment.bubbleEdgePoint, delta)
      ),
      connectorFramePosition: getCalloutPerimeterPosition(
        frameRect,
        translatePoint(currentConnector.attachment.framePoint, delta)
      ),
      ...(currentControlPoint
        ? { connectorWaypoint: toWaypoint(frameRect, translatePoint(currentControlPoint, delta)) }
        : {}),
    };
  }
  const baseCenter = {
    x: (currentConnector.attachment.baseEdgeA.x + currentConnector.attachment.baseEdgeB.x) / 2,
    y: (currentConnector.attachment.baseEdgeA.y + currentConnector.attachment.baseEdgeB.y) / 2,
  };
  const baseSpan = Math.hypot(
    currentConnector.attachment.baseEdgeB.x - currentConnector.attachment.baseEdgeA.x,
    currentConnector.attachment.baseEdgeB.y - currentConnector.attachment.baseEdgeA.y
  );
  const baseEdgeLength =
    nextConnector.side === 'top' || nextConnector.side === 'bottom'
      ? nextBubbleRect.width
      : nextBubbleRect.height;
  return {
    connectorBasePosition: getCalloutEdgePosition(
      nextBubbleRect,
      nextConnector.side,
      translatePoint(baseCenter, delta)
    ),
    connectorBaseWidth: baseSpan / Math.max(1, baseEdgeLength),
    connectorFramePosition: getCalloutEdgePosition(
      frameRect,
      nextConnector.side,
      translatePoint(currentConnector.attachment.framePoint, delta)
    ),
  };
}
