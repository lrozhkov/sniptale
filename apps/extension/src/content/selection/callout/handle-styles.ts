import { getCalloutTailDragCursor } from './tail-drag';
import type { getCalloutLayoutState } from './layout';
import {
  ADJACENT_CONTROL_BUTTON_SIZE,
  ADJACENT_CONTROL_GAP,
  getAdjacentControlGroupPosition,
} from '../popover-sync/adjacent-controls';

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
  viewport: { height: number; width: number }
) {
  const targetRect = {
    bottom: layout.calloutPos.y + layout.calloutDimensions.height,
    left: layout.calloutPos.x,
    right: layout.calloutPos.x + layout.calloutDimensions.width,
    top: layout.calloutPos.y,
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

function createResizeHandleStyles(layout: CalloutLayout) {
  const centerY = layout.calloutPos.y + layout.calloutDimensions.height / 2 - 6;
  const baseStyle = {
    position: 'fixed' as const,
    top: centerY,
    zIndex: layout.effectiveZIndex + 1,
  };

  return {
    resizeLeftHandleStyle: { ...baseStyle, left: layout.calloutPos.x - 6 },
    resizeRightHandleStyle: {
      ...baseStyle,
      left: layout.calloutPos.x + layout.calloutDimensions.width - 6,
    },
  };
}

function createConnectorControlStyles(layout: CalloutLayout) {
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
    curveStartHandleStyle: createFixedPointStyle(curveHandles?.start, zIndex),
    curveEndHandleStyle: createFixedPointStyle(curveHandles?.end, zIndex),
    tailHandleCursor:
      dynamicTail?.kind === 'line' ? 'grab' : getCalloutTailDragCursor(dynamicTail?.side ?? null),
    tailHandleStyle: createFixedPointStyle(tailBaseStartPoint, zIndex),
    tailBaseEndHandleStyle: createFixedPointStyle(tailBaseEndPoint, zIndex),
    tailFrameHandleStyle: createFixedPointStyle(dynamicTail?.attachment.tipPoint, zIndex),
    waypointHandleStyle: createFixedPointStyle(routeControlPoint, zIndex),
    waypointAngleStyle: createFixedPointStyle(routeControlPoint, zIndex + 1, { x: 12, y: -28 }),
  };
}

export function createCalloutHandleStyles(args: {
  layout: CalloutLayout;
  showSettingsHandle: boolean;
  viewport: { height: number; width: number };
}) {
  return {
    ...createAdjacentControlStyles(args.layout, args.showSettingsHandle, args.viewport),
    ...createConnectorControlStyles(args.layout),
    ...createResizeHandleStyles(args.layout),
  };
}
