import type { CSSProperties } from 'react';
import type {
  CalloutConnectorRouting,
  CalloutPlacement,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

function createPath(points: Point[], left: number, top: number): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x - left} ${point.y - top}`)
    .join(' ');
}

function getAngle(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function getRoute(blockPoint: Point, framePoint: Point, routing: CalloutConnectorRouting) {
  if (routing === 'straight') return [blockPoint, framePoint];
  const dx = Math.abs(framePoint.x - blockPoint.x);
  const dy = Math.abs(framePoint.y - blockPoint.y);
  const elbow =
    dx >= dy ? { x: framePoint.x, y: blockPoint.y } : { x: blockPoint.x, y: framePoint.y };
  return [blockPoint, elbow, framePoint];
}

export function getLineConnectorState(args: {
  anchorPoint: Point;
  bubbleRect: Rect;
  frameRect: Rect;
  placement: CalloutPlacement;
  previousSide?: ConnectorSide;
  preferredSide?: ConnectorSide;
  routing: CalloutConnectorRouting;
  wedgeSize: number;
}) {
  const attachment = getDynamicTailState({
    anchorPoint: args.anchorPoint,
    bubbleRect: args.bubbleRect,
    frameRect: args.frameRect,
    ...(args.placement.connectorBasePosition === undefined
      ? {}
      : { tailBasePosition: args.placement.connectorBasePosition }),
    ...(args.placement.connectorFramePosition === undefined
      ? {}
      : { tailFramePosition: args.placement.connectorFramePosition }),
    ...(args.preferredSide ? { preferredSide: args.preferredSide } : {}),
    ...(args.previousSide ? { previousSide: args.previousSide } : {}),
    tailSize: args.wedgeSize,
  });
  const blockPoint = attachment.attachment.bubbleEdgePoint;
  const framePoint = attachment.attachment.framePoint;
  const route = getRoute(blockPoint, framePoint, args.routing);
  const padding = 14;
  const left = Math.min(...route.map((point) => point.x)) - padding;
  const top = Math.min(...route.map((point) => point.y)) - padding;
  const right = Math.max(...route.map((point) => point.x)) + padding;
  const bottom = Math.max(...route.map((point) => point.y)) + padding;
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
      bubblePoint: blockPoint,
      tipPoint: framePoint,
    },
    blockPoint: { x: blockPoint.x - left, y: blockPoint.y - top },
    blockAngle: getAngle(route[0]!, route[1]!),
    framePoint: { x: framePoint.x - left, y: framePoint.y - top },
    frameAngle: getAngle(route.at(-2)!, route.at(-1)!),
    kind: 'line' as const,
    path: createPath(route, left, top),
    side: attachment.side,
    style,
    viewBox: `0 0 ${Math.max(1, right - left)} ${Math.max(1, bottom - top)}`,
  };
}
