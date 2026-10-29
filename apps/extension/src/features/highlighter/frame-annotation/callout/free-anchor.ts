import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutLayoutState } from './layout';
import { useCalloutWaypointDrag } from './waypoint-drag';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';

type Point = { x: number; y: number };
export type CalloutAnchorChange = (point: Point, placement: CalloutSettings['placement']) => void;
type AnchorArgs = Parameters<typeof getCalloutLayoutState>[0] & {
  coordinateSpace: FrameAnnotationCoordinateSpace;
  onChange?: CalloutAnchorChange | undefined;
};

function placementAtAnchor(args: AnchorArgs, point: Point): CalloutSettings['placement'] {
  const layout = getCalloutLayoutState(args);
  const scale = args.visualScale ?? 1;
  const center = {
    x: point.x + args.frameRect.width / 2,
    y: point.y + args.frameRect.height / 2,
  };
  const waypoint = args.settings.placement.connectorWaypoint;
  return {
    ...args.settings.placement,
    manualPlacement: {
      centerOffsetX: (layout.calloutPos.x + layout.calloutDimensions.width / 2 - center.x) / scale,
      centerOffsetY: (layout.calloutPos.y + layout.calloutDimensions.height / 2 - center.y) / scale,
    },
    ...(waypoint
      ? {
          connectorWaypoint: {
            centerOffsetX: waypoint.centerOffsetX + (args.frameRect.x - point.x) / scale,
            centerOffsetY: waypoint.centerOffsetY + (args.frameRect.y - point.y) / scale,
          },
        }
      : {}),
  };
}

/** Moves a standalone connector endpoint while its bubble and route stay stationary. */
export function useCalloutFreeAnchor(args: AnchorArgs) {
  const center = {
    x: args.frameRect.x + args.frameRect.width / 2,
    y: args.frameRect.y + args.frameRect.height / 2,
  };
  const toAnchor = (position: { centerOffsetX: number; centerOffsetY: number }): Point => ({
    x: position.centerOffsetX - args.frameRect.width / 2,
    y: position.centerOffsetY - args.frameRect.height / 2,
  });
  const drag = useCalloutWaypointDrag({
    coordinateSpace: args.coordinateSpace,
    axis: 'both',
    defaultPoint: center,
    frameRect: { x: 0, y: 0, width: 0, height: 0 },
    isEditing: args.isEditing || !args.onChange,
    position: { centerOffsetX: center.x, centerOffsetY: center.y },
    snapPoints: [],
    onChange: (position) => {
      if (!position) return;
      const point = toAnchor(position);
      args.onChange?.(point, placementAtAnchor(args, point));
    },
  });
  // The synchronous owner accepts or refuses the endpoint on release, including rounded editor coordinates.
  const point =
    args.onChange && drag.isDragging && drag.draftPosition ? toAnchor(drag.draftPosition) : null;
  return {
    drag,
    frameRect: point ? { ...args.frameRect, ...point } : args.frameRect,
    settings: point
      ? { ...args.settings, placement: placementAtAnchor(args, point) }
      : args.settings,
  };
}
