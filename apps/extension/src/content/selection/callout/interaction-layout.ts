import React from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { useCalloutDrag } from './drag';
import type { CalloutDragBehavior } from './drag';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutLayoutState } from './layout';
import {
  getCalloutEdgePosition,
  getCalloutPerimeterPosition,
  useCalloutEdgeDrag,
} from './tail-drag';
import { useCalloutTailBaseRange } from './tail-base-range';
import { useCalloutWidthResize } from './width-resize';
import { useCalloutWaypointDrag } from './waypoint-drag';

type FrameRect = { x: number; y: number; width: number; height: number };
type InteractionArgs = {
  dimensions: { width: number; height: number };
  frameBorderWidth: number;
  frameRect: FrameRect;
  isEditing: boolean;
  isSettingsOpen?: boolean;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    behavior: CalloutDragBehavior
  ) => void;
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
  onWaypointChange: (waypoint: CalloutSettings['placement']['connectorWaypoint']) => void;
  onWidthChange: (
    maxWidth: number,
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
  ) => void;
  settings: CalloutSettings;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  zIndex: number;
};

function useCalloutPlacementDraft(args: InteractionArgs) {
  const widthResize = useCalloutWidthResize({
    dimensions: args.dimensions,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    manualPlacement: args.settings.placement.manualPlacement,
    maxWidth: args.settings.style.typography.maxWidth,
    onWidthChange: args.onWidthChange,
    wrapperRef: args.wrapperRef,
  });
  const drag = useCalloutDrag({
    frameRect: args.frameRect,
    dimensions: args.dimensions,
    isEditing: args.isEditing,
    isHandlePinned: Boolean(args.isSettingsOpen) || widthResize.isResizing,
    manualPlacement: args.settings.placement.manualPlacement,
    onPositionChange: args.onPositionChange,
    wrapperRef: args.wrapperRef,
  });
  const widthSettings: CalloutSettings = {
    ...args.settings,
    style: {
      ...args.settings.style,
      typography: {
        ...args.settings.style.typography,
        ...(widthResize.draftMaxWidth === null ? {} : { maxWidth: widthResize.draftMaxWidth }),
      },
    },
    placement: {
      ...args.settings.placement,
      ...(widthResize.draftPlacement ? { manualPlacement: widthResize.draftPlacement } : {}),
    },
  };
  const settings = drag.draft
    ? {
        ...widthSettings,
        placement: {
          ...widthSettings.placement,
          manualPlacement: drag.draft.placement,
          ...(drag.draft.preserveConnectorAnchors
            ? {}
            : {
                connectorBasePosition: undefined,
                connectorBaseWidth: undefined,
                connectorFramePosition: undefined,
                connectorWaypoint: undefined,
              }),
        },
      }
    : widthSettings;
  return { drag, settings, widthResize };
}

function useCalloutConnectorDrafts(args: {
  baseLayout: ReturnType<typeof getCalloutLayoutState>;
  frameRect: FrameRect;
  isEditing: boolean;
  onTailBaseRangeChange: InteractionArgs['onTailBaseRangeChange'];
  onTailFramePositionChange: InteractionArgs['onTailFramePositionChange'];
  onWaypointChange: InteractionArgs['onWaypointChange'];
  settings: CalloutSettings;
}) {
  const connectorSide = args.baseLayout.dynamicTail?.side ?? null;
  const bubbleRect = { ...args.baseLayout.calloutPos, ...args.baseLayout.calloutDimensions };
  const tailBaseRange = useCalloutTailBaseRange({
    bubbleRect,
    connectorSide: args.baseLayout.dynamicTail?.kind === 'wedge' ? connectorSide : null,
    endPoint: args.baseLayout.dynamicTail?.attachment.baseEdgeB,
    isEditing: args.isEditing,
    onRangeChange: args.onTailBaseRangeChange,
    startPoint: args.baseLayout.dynamicTail?.attachment.baseEdgeA,
  });
  const lineBaseDrag = useCalloutEdgeDrag({
    edgeRect: bubbleRect,
    connectorSide: args.baseLayout.dynamicTail?.kind === 'line' ? connectorSide : null,
    defaultPosition: getCalloutPerimeterPosition(
      bubbleRect,
      args.baseLayout.dynamicTail?.attachment.bubbleEdgePoint ?? {
        x: bubbleRect.x + bubbleRect.width / 2,
        y: bubbleRect.y,
      }
    ),
    isEditing: args.isEditing,
    onPositionChange: (position) => args.onTailBaseRangeChange(position, 0),
    perimeter: true,
    position: args.settings.placement.connectorBasePosition,
  });
  const tailFrameDrag = useCalloutEdgeDrag({
    edgeRect: args.frameRect,
    connectorSide,
    defaultPosition:
      args.baseLayout.dynamicTail?.kind === 'line'
        ? getCalloutPerimeterPosition(
            args.frameRect,
            args.baseLayout.dynamicTail.attachment.framePoint
          )
        : getCalloutEdgePosition(
            args.frameRect,
            connectorSide,
            args.baseLayout.dynamicTail?.attachment.framePoint
          ),
    isEditing: args.isEditing,
    onPositionChange: args.onTailFramePositionChange,
    perimeter: args.baseLayout.dynamicTail?.kind === 'line',
    position: args.settings.placement.connectorFramePosition,
  });
  const lineState =
    args.baseLayout.dynamicTail?.kind === 'line' ? args.baseLayout.dynamicTail : null;
  const waypointDrag = useCalloutWaypointDrag({
    axis: lineState?.routeControlAxis ?? null,
    defaultPoint: lineState?.routeControlPoint ?? null,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    onChange: args.onWaypointChange,
    position: args.settings.placement.connectorWaypoint,
    snapPoints: lineState ? [lineState.routePoints[0]!, lineState.routePoints.at(-1)!] : [],
  });
  const settings: CalloutSettings = {
    ...args.settings,
    placement: {
      ...args.settings.placement,
      ...(tailBaseRange.draftSettings
        ? {
            connectorBasePosition: tailBaseRange.draftSettings.tailBasePosition,
            connectorBaseWidth: tailBaseRange.draftSettings.tailBaseWidth,
          }
        : {}),
      ...(lineBaseDrag.draftPosition === null
        ? {}
        : { connectorBasePosition: lineBaseDrag.draftPosition }),
      ...(tailFrameDrag.draftPosition === null
        ? {}
        : { connectorFramePosition: tailFrameDrag.draftPosition }),
      ...(waypointDrag.draftPosition === null
        ? {}
        : { connectorWaypoint: waypointDrag.draftPosition }),
    },
  };
  return {
    hasDraft:
      tailBaseRange.hasDraft ||
      lineBaseDrag.draftPosition !== null ||
      tailFrameDrag.draftPosition !== null ||
      waypointDrag.draftPosition !== null,
    lineBaseDrag,
    settings,
    tailBaseRange,
    tailFrameDrag,
    waypointDrag,
  };
}

export function useCalloutInteractionLayout(args: InteractionArgs) {
  const previousConnectorSideRef = React.useRef<ConnectorSide | undefined>(undefined);
  const placement = useCalloutPlacementDraft(args);
  const baseLayoutArgs = {
    dimensions: args.dimensions,
    frameBorderWidth: args.frameBorderWidth,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    settings: placement.settings,
    zIndex: args.zIndex,
    ...(previousConnectorSideRef.current
      ? { previousConnectorSide: previousConnectorSideRef.current }
      : {}),
  };
  const baseLayout = getCalloutLayoutState(baseLayoutArgs);
  const connector = useCalloutConnectorDrafts({
    baseLayout,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    onTailBaseRangeChange: args.onTailBaseRangeChange,
    onTailFramePositionChange: args.onTailFramePositionChange,
    onWaypointChange: args.onWaypointChange,
    settings: placement.settings,
  });
  const layout = connector.hasDraft
    ? getCalloutLayoutState({ ...baseLayoutArgs, settings: connector.settings })
    : baseLayout;
  if (layout.dynamicTail) previousConnectorSideRef.current = layout.dynamicTail.side;

  return {
    drag: placement.drag,
    effectiveSettings: connector.settings,
    layout,
    tailBaseEndDrag: connector.tailBaseRange.endDrag,
    tailBaseStartDrag:
      baseLayout.dynamicTail?.kind === 'line'
        ? connector.lineBaseDrag
        : connector.tailBaseRange.startDrag,
    tailFrameDrag: connector.tailFrameDrag,
    waypointDrag: connector.waypointDrag,
    widthResize: placement.widthResize,
  };
}
