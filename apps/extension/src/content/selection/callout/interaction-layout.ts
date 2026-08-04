import React from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { useCalloutDrag } from './drag';
import type { CalloutDragBehavior } from './drag';
import type { ConnectorSide } from './dynamic-tail';
import { getStationaryConnectorWaypoint, getTranslatedConnectorGeometry } from './drag-anchor';
import { getCalloutLayoutState } from './layout';
import {
  getCalloutPerimeterAnchorPositions,
  getCalloutEdgePosition,
  getCalloutPerimeterPosition,
  useCalloutEdgeDrag,
} from './tail-drag';
import { useCalloutTailBaseRange } from './tail-base-range';
import { useCalloutWidthResize } from './width-resize';
import { useCalloutWaypointDrag } from './waypoint-drag';

type FrameRect = { x: number; y: number; width: number; height: number };
type SectionRect = { x: number; y: number; width: number; height: number };
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
  const restingLayout = getCalloutLayoutState({
    dimensions: args.dimensions,
    frameBorderWidth: args.frameBorderWidth,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    settings: widthSettings,
    zIndex: args.zIndex,
  });
  const createDraggedSettings = (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    translateConnectorGeometry: boolean
  ) =>
    getDraggedCalloutSettings({
      args,
      placement,
      translateConnectorGeometry,
      restingLayout,
      widthSettings,
    });
  const drag = useCalloutDrag({
    frameRect: args.frameRect,
    dimensions: args.dimensions,
    isEditing: args.isEditing,
    isHandlePinned: Boolean(args.isSettingsOpen) || widthResize.isResizing,
    manualPlacement: args.settings.placement.manualPlacement,
    onPositionChange: (placement, behavior) => {
      const draggedSettings = createDraggedSettings(placement, behavior.translateConnectorGeometry);
      args.onPositionChange(placement, {
        ...behavior,
        connectorBasePosition: draggedSettings.placement.connectorBasePosition,
        connectorBaseWidth: draggedSettings.placement.connectorBaseWidth,
        connectorFramePosition: draggedSettings.placement.connectorFramePosition,
        connectorWaypoint: draggedSettings.placement.connectorWaypoint,
      });
    },
    wrapperRef: args.wrapperRef,
  });
  const settings = drag.draft
    ? createDraggedSettings(drag.draft.placement, drag.draft.translateConnectorGeometry)
    : widthSettings;
  return { drag, settings, widthResize };
}

export function getCalloutSectionAnchorGuides(
  bubbleRect: SectionRect,
  titleRect: SectionRect | null
) {
  if (!titleRect || titleRect.height <= 0) return [];
  const bubbleBottom = bubbleRect.y + bubbleRect.height;
  const titleTop = Math.max(bubbleRect.y, titleRect.y);
  const dividerY = Math.min(bubbleBottom, titleRect.y + titleRect.height);
  if (dividerY <= bubbleRect.y || titleTop >= bubbleBottom) return [];
  return [titleTop + (dividerY - titleTop) / 2, dividerY, dividerY + (bubbleBottom - dividerY) / 2];
}

function getDraggedCalloutSettings(args: {
  args: InteractionArgs;
  placement: NonNullable<CalloutSettings['placement']['manualPlacement']>;
  translateConnectorGeometry: boolean;
  restingLayout: ReturnType<typeof getCalloutLayoutState>;
  widthSettings: CalloutSettings;
}): CalloutSettings {
  const placement = {
    ...args.widthSettings.placement,
    manualPlacement: args.placement,
  };
  const stableWaypoint = getStationaryConnectorWaypoint(
    args.restingLayout,
    args.args.frameRect,
    placement.connectorWaypoint
  );
  if (!args.translateConnectorGeometry) {
    return {
      ...args.widthSettings,
      placement: {
        ...placement,
        ...(stableWaypoint ? { connectorWaypoint: stableWaypoint } : {}),
      },
    };
  }
  const provisionalSettings = { ...args.widthSettings, placement };
  const nextLayout = getCalloutLayoutState({
    dimensions: args.args.dimensions,
    frameBorderWidth: args.args.frameBorderWidth,
    frameRect: args.args.frameRect,
    isEditing: args.args.isEditing,
    ...(args.restingLayout.dynamicTail
      ? { previousConnectorSide: args.restingLayout.dynamicTail.side }
      : {}),
    settings: provisionalSettings,
    zIndex: args.args.zIndex,
  });
  const connectorGeometry = getTranslatedConnectorGeometry(
    args.restingLayout,
    nextLayout,
    args.args.frameRect,
    args.widthSettings.placement.connectorWaypoint
  );
  return {
    ...provisionalSettings,
    placement: {
      ...placement,
      ...connectorGeometry,
    },
  };
}

function useCalloutConnectorDrafts(args: {
  baseLayout: ReturnType<typeof getCalloutLayoutState>;
  frameRect: FrameRect;
  isEditing: boolean;
  onTailBaseRangeChange: InteractionArgs['onTailBaseRangeChange'];
  onTailFramePositionChange: InteractionArgs['onTailFramePositionChange'];
  onWaypointChange: InteractionArgs['onWaypointChange'];
  settings: CalloutSettings;
  wrapperRef: InteractionArgs['wrapperRef'];
}) {
  const connectorSide = args.baseLayout.dynamicTail?.side ?? null;
  const bubbleRect = { ...args.baseLayout.calloutPos, ...args.baseLayout.calloutDimensions };
  const titleRect = args.wrapperRef.current
    ?.querySelector<HTMLElement>('[data-sniptale-callout-title="true"]')
    ?.getBoundingClientRect();
  const bubbleAnchorPositions = getCalloutPerimeterAnchorPositions(
    bubbleRect,
    getCalloutSectionAnchorGuides(bubbleRect, titleRect ?? null)
  );
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
    perimeterAnchorPositions: bubbleAnchorPositions,
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
    angleSnap: lineState?.routeControlAngleSnap ?? null,
    elbowConstraint: lineState?.routeControlConstraint ?? null,
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
    wrapperRef: args.wrapperRef,
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
