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
  coordinateSpace?: FrameAnnotationCoordinateSpace,
  uiScale = 1
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
    uiScale,
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
  const halfHandle = 6;
  const centerY = projected.y + projected.height / 2 - halfHandle;
  const baseStyle = {
    position: 'fixed' as const,
    top: centerY,
    zIndex: layout.effectiveZIndex + 1,
  };

  return {
    resizeLeftHandleStyle: { ...baseStyle, left: projected.x - halfHandle },
    resizeRightHandleStyle: {
      ...baseStyle,
      left: projected.x + projected.width - halfHandle,
    },
  };
}

function createConnectorControlStyles(
  layout: CalloutLayout,
  coordinateSpace?: FrameAnnotationCoordinateSpace,
  uiScale = 1
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
      zIndex,
      undefined
    ),
    curveEndHandleStyle: createFixedPointStyle(
      curveHandles?.end && coordinateSpace
        ? coordinateSpace.logicalPointToClient(curveHandles.end)
        : curveHandles?.end,
      zIndex,
      undefined
    ),
    tailHandleCursor:
      dynamicTail?.kind === 'line' ? 'grab' : getCalloutTailDragCursor(dynamicTail?.side ?? null),
    tailHandleStyle: createFixedPointStyle(
      projectPoint(tailBaseStartPoint, coordinateSpace),
      zIndex,
      undefined
    ),
    tailBaseEndHandleStyle: createFixedPointStyle(
      projectPoint(tailBaseEndPoint, coordinateSpace),
      zIndex,
      undefined
    ),
    tailFrameHandleStyle: createFixedPointStyle(
      projectPoint(dynamicTail?.attachment.tipPoint, coordinateSpace),
      zIndex,
      undefined
    ),
    waypointHandleStyle: createFixedPointStyle(
      projectPoint(routeControlPoint, coordinateSpace),
      zIndex,
      undefined
    ),
    waypointAngleStyle: createFixedPointStyle(
      projectPoint(routeControlPoint, coordinateSpace),
      zIndex + 1,
      { x: 12 * uiScale, y: -28 * uiScale }
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
  uiScale?: number;
  viewport: { height: number; width: number };
}) {
  return {
    ...createAdjacentControlStyles(
      args.layout,
      args.showSettingsHandle,
      args.viewport,
      args.coordinateSpace,
      args.uiScale
    ),
    ...createConnectorControlStyles(args.layout, args.coordinateSpace, args.uiScale),
    ...createResizeHandleStyles(args.layout, args.coordinateSpace),
  };
}
