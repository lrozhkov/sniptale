import type { ConnectorSide } from './dynamic-tail';
import { getCalloutEdgePosition, useCalloutEdgeDrag } from './tail-drag';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

export function useCalloutTailBaseRange(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  bubbleRect: Rect;
  connectorSide: ConnectorSide | null;
  endPoint: Point | undefined;
  isEditing: boolean;
  onRangeChange: (position: number, width: number) => void;
  startPoint: Point | undefined;
  visualScale?: number;
}) {
  const startPosition = getCalloutEdgePosition(
    args.bubbleRect,
    args.connectorSide,
    args.startPoint
  );
  const endPosition = getCalloutEdgePosition(args.bubbleRect, args.connectorSide, args.endPoint);
  const horizontal = args.connectorSide === 'top' || args.connectorSide === 'bottom';
  const edgeLength = horizontal ? args.bubbleRect.width : args.bubbleRect.height;
  const minWidth = Math.min(1, (4 * (args.visualScale ?? 1)) / Math.max(1, edgeLength));
  const startDrag = useCalloutEdgeDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    edgeRect: args.bubbleRect,
    connectorSide: args.connectorSide,
    defaultPosition: startPosition,
    isEditing: args.isEditing,
    maxPosition: endPosition - minWidth,
    onPositionChange: (position) => {
      args.onRangeChange((position + endPosition) / 2, Math.max(minWidth, endPosition - position));
    },
    position: undefined,
    ...(args.visualScale === undefined ? {} : { visualScale: args.visualScale }),
  });
  const endDrag = useCalloutEdgeDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    edgeRect: args.bubbleRect,
    connectorSide: args.connectorSide,
    defaultPosition: endPosition,
    isEditing: args.isEditing,
    minPosition: startPosition + minWidth,
    onPositionChange: (position) => {
      args.onRangeChange(
        (startPosition + position) / 2,
        Math.max(minWidth, position - startPosition)
      );
    },
    position: undefined,
    ...(args.visualScale === undefined ? {} : { visualScale: args.visualScale }),
  });
  const draftStart = startDrag.draftPosition ?? startPosition;
  const draftEnd = endDrag.draftPosition ?? endPosition;
  const hasDraft = startDrag.draftPosition !== null || endDrag.draftPosition !== null;

  return {
    draftSettings: hasDraft
      ? {
          tailBasePosition: (draftStart + draftEnd) / 2,
          tailBaseWidth: Math.max(minWidth, draftEnd - draftStart),
        }
      : null,
    endDrag,
    hasDraft,
    startDrag,
  };
}
