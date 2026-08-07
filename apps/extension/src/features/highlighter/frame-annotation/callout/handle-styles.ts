import { getCalloutTailDragCursor } from './tail-drag';
import type { getCalloutLayoutState } from './layout';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';
import {
  ADJACENT_CONTROL_BUTTON_SIZE,
  ADJACENT_CONTROL_GAP,
  getAdjacentControlGroupPosition,
} from '../interaction/adjacent-controls';

type CalloutLayout = ReturnType<typeof getCalloutLayoutState>;

function createFixedPointStyle(
  point: { x: number; y: number } | null | undefined,
  zIndex: number,
  offset = { x: -6, y: -6 }
) {
  return point
    ? {
        position: 'fixed' as const,
        left: point.x + offset.x,
        top: point.y + offset.y,
        zIndex,
      }
    : null;
}

function createAdjacentControlStyles(
  layout: CalloutLayout,
  showSettingsHandle: boolean,
  viewport: { height: number; width: number },
  coordinateSpace?: FrameAnnotationCoordinateSpace
) {
  const logicalRect = {
    x: layout.calloutPos.x,
    y: layout.calloutPos.y,
    width: layout.calloutDimensions.width,
    height: layout.calloutDimensions.height,
  };
  const projected = coordinateSpace?.logicalRectToClient(logicalRect) ?? logicalRect;
  const targetRect = {
    bottom: projected.y + projected.height,
    left: projected.x,
    right: projected.x + projected.width,
    top: projected.y,
  };
  const position = getAdjacentControlGroupPosition({
    controlCount: showSettingsHandle ? 2 : 1,
    targetRect,
    viewport,
  });
  const baseStyle = {
    position: 'fixed' as const,
    top: position.y,
    zIndex: layout.effectiveZIndex + 1,
  };

  return {
    dragHandleStyle: { ...baseStyle, left: position.x },
    settingsHandleStyle: {
      ...baseStyle,
      left: position.x + ADJACENT_CONTROL_BUTTON_SIZE + ADJACENT_CONTROL_GAP,
    },
  };
}

function createResizeHandleStyles(
  layout: CalloutLayout,
  coordinateSpace?: FrameAnnotationCoordinateSpace
) {
  const projected = coordinateSpace?.logicalRectToClient({
    x: layout.calloutPos.x,
    y: layout.calloutPos.y,
    width: layout.calloutDimensions.width,
    height: layout.calloutDimensions.height,
  }) ?? { x: layout.calloutPos.x, y: layout.calloutPos.y, ...layout.calloutDimensions };
  const centerY = projected.y + projected.height / 2 - 6;
  const baseStyle = {
    position: 'fixed' as const,
    top: centerY,
    zIndex: layout.effectiveZIndex + 1,
  };

  return {
    resizeLeftHandleStyle: { ...baseStyle, left: projected.x - 6 },
    resizeRightHandleStyle: {
      ...baseStyle,
      left: projected.x + projected.width - 6,
    },
  };
}

function createConnectorControlStyles(
  layout: CalloutLayout,
  coordinateSpace?: FrameAnnotationCoordinateSpace
) {
  const { dynamicTail, effectiveZIndex } = layout;
  const zIndex = effectiveZIndex + 1;
  const tailBaseStartPoint =
    dynamicTail?.kind === 'line'
      ? dynamicTail.attachment.bubbleEdgePoint
      : dynamicTail?.attachment.baseEdgeA;
  const tailBaseEndPoint =
    dynamicTail?.kind === 'wedge' ? dynamicTail.attachment.baseEdgeB : undefined;
  const curveHandles = dynamicTail?.kind === 'line' ? dynamicTail.curveHandles : undefined;
  const routeControlPoint =
    dynamicTail?.kind === 'line' ? dynamicTail.routeControlPoint : undefined;

  return {
    curveStartHandleStyle: createFixedPointStyle(
      curveHandles?.start && coordinateSpace
        ? coordinateSpace.logicalPointToClient(curveHandles.start)
        : curveHandles?.start,
      zIndex
    ),
    curveEndHandleStyle: createFixedPointStyle(
      curveHandles?.end && coordinateSpace
        ? coordinateSpace.logicalPointToClient(curveHandles.end)
        : curveHandles?.end,
      zIndex
    ),
    tailHandleCursor:
      dynamicTail?.kind === 'line' ? 'grab' : getCalloutTailDragCursor(dynamicTail?.side ?? null),
    tailHandleStyle: createFixedPointStyle(
      projectPoint(tailBaseStartPoint, coordinateSpace),
      zIndex
    ),
    tailBaseEndHandleStyle: createFixedPointStyle(
      projectPoint(tailBaseEndPoint, coordinateSpace),
      zIndex
    ),
    tailFrameHandleStyle: createFixedPointStyle(
      projectPoint(dynamicTail?.attachment.tipPoint, coordinateSpace),
      zIndex
    ),
    waypointHandleStyle: createFixedPointStyle(
      projectPoint(routeControlPoint, coordinateSpace),
      zIndex
    ),
    waypointAngleStyle: createFixedPointStyle(
      projectPoint(routeControlPoint, coordinateSpace),
      zIndex + 1,
      { x: 12, y: -28 }
    ),
  };
}

function projectPoint(
  point: { x: number; y: number } | null | undefined,
  coordinateSpace?: FrameAnnotationCoordinateSpace
) {
  return point && coordinateSpace ? coordinateSpace.logicalPointToClient(point) : point;
}

export function createCalloutHandleStyles(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  layout: CalloutLayout;
  showSettingsHandle: boolean;
  viewport: { height: number; width: number };
}) {
  return {
    ...createAdjacentControlStyles(
      args.layout,
      args.showSettingsHandle,
      args.viewport,
      args.coordinateSpace
    ),
    ...createConnectorControlStyles(args.layout, args.coordinateSpace),
    ...createResizeHandleStyles(args.layout, args.coordinateSpace),
  };
}
