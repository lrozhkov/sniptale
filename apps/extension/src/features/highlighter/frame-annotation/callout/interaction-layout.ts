import React from 'react';
import type {
  CalloutAttachment,
  CalloutCurveSettings,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { useCalloutDrag } from './drag';
import type { CalloutDragBehavior } from './drag';
import type { ConnectorSide } from './dynamic-tail';
import { getStationaryConnectorWaypoint, getTranslatedConnectorGeometry } from './drag-anchor';
import { getCalloutLayoutState } from './layout';
import {
  getCalloutPerimeterAnchorPositions,
  getCalloutPerimeterAnchors,
  getCalloutEdgePosition,
  getCalloutPerimeterPosition,
  useCalloutEdgeDrag,
} from './tail-drag';
import { useCalloutTailBaseRange } from './tail-base-range';
import { useCalloutWidthResize } from './width-resize';
import { useCalloutWaypointDrag } from './waypoint-drag';
import { useCalloutCurveHandleDrag } from './curve-handle-drag';
import {
  domRectToFrameAnnotationRect,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

type FrameRect = { x: number; y: number; width: number; height: number };
type SectionRect = { x: number; y: number; width: number; height: number };
type InteractionArgs = {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  dimensions: { width: number; height: number };
  frameBorderWidth: number;
  frameRect: FrameRect;
  isEditing: boolean;
  isSettingsOpen?: boolean;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    behavior: CalloutDragBehavior
  ) => void;
  onMoveEnd?: () => void;
  projectMoveRect?: (rect: SectionRect) => SectionRect;
  onTailBaseRangeChange: (position: number, width: number, attachment?: CalloutAttachment) => void;
  onTailFramePositionChange: (position: number, attachment?: CalloutAttachment) => void;
  onCurveChange: (curve: CalloutCurveSettings) => void;
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
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
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
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
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
    ...(args.onMoveEnd ? { onMoveEnd: args.onMoveEnd } : {}),
    ...(args.projectMoveRect ? { projectMoveRect: args.projectMoveRect } : {}),
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

function useCalloutCurveDrafts(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  curve: CalloutCurveSettings;
  isEditing: boolean;
  lineState: Extract<
    NonNullable<ReturnType<typeof getCalloutLayoutState>['dynamicTail']>,
    { kind: 'line' }
  > | null;
  onCurveChange: InteractionArgs['onCurveChange'];
}) {
  const handles = args.lineState?.curveHandles ?? null;
  const routeStart = args.lineState?.routePoints[0] ?? null;
  const routeEnd = args.lineState?.routePoints.at(-1) ?? null;
  const routeDistance =
    routeStart && routeEnd ? Math.hypot(routeEnd.x - routeStart.x, routeEnd.y - routeStart.y) : 0;
  const maximumDistance = Math.min(96, Math.max(24, routeDistance * 0.5));
  const commitHandle = (endpoint: 'startHandle' | 'endHandle', offset: { x: number; y: number }) =>
    args.onCurveChange({ ...args.curve, [endpoint]: offset, mode: 'manual' });
  const startDrag = useCalloutCurveHandleDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    defaultPoint: handles?.start ?? null,
    isEditing: args.isEditing,
    maximumDistance,
    onChange: (offset) => commitHandle('startHandle', offset),
    origin: routeStart,
    storedOffset: args.curve.startHandle,
  });
  const endDrag = useCalloutCurveHandleDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    defaultPoint: handles?.end ?? null,
    isEditing: args.isEditing,
    maximumDistance,
    onChange: (offset) => commitHandle('endHandle', offset),
    origin: routeEnd,
    storedOffset: args.curve.endHandle,
  });
  const draft =
    startDrag.draftOffset || endDrag.draftOffset
      ? {
          ...args.curve,
          ...(startDrag.draftOffset ? { startHandle: startDrag.draftOffset } : {}),
          ...(endDrag.draftOffset ? { endHandle: endDrag.draftOffset } : {}),
          mode: 'manual' as const,
        }
      : null;
  return { draft, endDrag, startDrag };
}

function createConnectorDraftSettings(args: {
  curveDraft: CalloutCurveSettings | null;
  lineBaseDrag: ReturnType<typeof useCalloutEdgeDrag>;
  settings: CalloutSettings;
  tailBaseRange: ReturnType<typeof useCalloutTailBaseRange>;
  tailFrameDrag: ReturnType<typeof useCalloutEdgeDrag>;
  waypointDrag: ReturnType<typeof useCalloutWaypointDrag>;
}): CalloutSettings {
  const draftBasePosition =
    args.tailBaseRange.draftSettings?.tailBasePosition ??
    (args.lineBaseDrag.draftPosition === null ? undefined : args.lineBaseDrag.draftPosition);
  const draftFramePosition =
    args.tailFrameDrag.draftPosition === null ? undefined : args.tailFrameDrag.draftPosition;
  const hasDraftAttachment =
    args.lineBaseDrag.draftAttachment !== null ||
    args.tailFrameDrag.draftAttachment !== null ||
    draftBasePosition !== undefined ||
    draftFramePosition !== undefined;
  return {
    ...args.settings,
    style: args.curveDraft
      ? {
          ...args.settings.style,
          connector: { ...args.settings.style.connector, curve: args.curveDraft },
        }
      : args.settings.style,
    placement: {
      ...args.settings.placement,
      ...(hasDraftAttachment
        ? {
            connectorAttachments: {
              block:
                args.lineBaseDrag.draftAttachment ??
                (draftBasePosition === undefined
                  ? (args.settings.placement.connectorAttachments?.block ?? {
                      mode: 'auto' as const,
                    })
                  : { mode: 'free' as const, perimeterPosition: draftBasePosition }),
              frame:
                args.tailFrameDrag.draftAttachment ??
                (draftFramePosition === undefined
                  ? (args.settings.placement.connectorAttachments?.frame ?? {
                      mode: 'auto' as const,
                    })
                  : { mode: 'free' as const, perimeterPosition: draftFramePosition }),
            },
          }
        : {}),
      ...(args.tailBaseRange.draftSettings
        ? {
            connectorBasePosition: args.tailBaseRange.draftSettings.tailBasePosition,
            connectorBaseWidth: args.tailBaseRange.draftSettings.tailBaseWidth,
          }
        : {}),
      ...(args.lineBaseDrag.draftPosition === null
        ? {}
        : { connectorBasePosition: args.lineBaseDrag.draftPosition }),
      ...(args.tailFrameDrag.draftPosition === null
        ? {}
        : { connectorFramePosition: args.tailFrameDrag.draftPosition }),
      ...(args.waypointDrag.draftPosition === null
        ? {}
        : { connectorWaypoint: args.waypointDrag.draftPosition }),
    },
  };
}

function useCalloutConnectorDrafts(args: {
  baseLayout: ReturnType<typeof getCalloutLayoutState>;
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  frameRect: FrameRect;
  isEditing: boolean;
  onTailBaseRangeChange: InteractionArgs['onTailBaseRangeChange'];
  onTailFramePositionChange: InteractionArgs['onTailFramePositionChange'];
  onCurveChange: InteractionArgs['onCurveChange'];
  onWaypointChange: InteractionArgs['onWaypointChange'];
  settings: CalloutSettings;
  wrapperRef: InteractionArgs['wrapperRef'];
}) {
  const connectorSide = args.baseLayout.dynamicTail?.side ?? null;
  const bubbleRect = { ...args.baseLayout.calloutPos, ...args.baseLayout.calloutDimensions };
  const { bubbleAnchorPositions, bubbleAnchors } = getBubbleAnchors(args, bubbleRect);
  const attachmentDrags = useConnectorAttachmentDrags(
    args,
    bubbleRect,
    connectorSide,
    bubbleAnchorPositions,
    bubbleAnchors
  );
  const lineState =
    args.baseLayout.dynamicTail?.kind === 'line' ? args.baseLayout.dynamicTail : null;
  const waypointDrag = useCalloutWaypointDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
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
  const curveDrafts = useCalloutCurveDrafts({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    curve: args.settings.style.connector.curve,
    isEditing: args.isEditing,
    lineState,
    onCurveChange: args.onCurveChange,
  });
  const settings = createConnectorDraftSettings({
    curveDraft: curveDrafts.draft,
    lineBaseDrag: attachmentDrags.lineBaseDrag,
    settings: args.settings,
    tailBaseRange: attachmentDrags.tailBaseRange,
    tailFrameDrag: attachmentDrags.tailFrameDrag,
    waypointDrag,
  });
  return {
    hasDraft:
      attachmentDrags.tailBaseRange.hasDraft ||
      attachmentDrags.lineBaseDrag.draftPosition !== null ||
      attachmentDrags.tailFrameDrag.draftPosition !== null ||
      waypointDrag.draftPosition !== null ||
      curveDrafts.startDrag.draftOffset !== null ||
      curveDrafts.endDrag.draftOffset !== null,
    curveEndDrag: curveDrafts.endDrag,
    curveStartDrag: curveDrafts.startDrag,
    ...attachmentDrags,
    settings,
    waypointDrag,
  };
}

function getBubbleAnchors(
  args: Parameters<typeof useCalloutConnectorDrafts>[0],
  bubbleRect: SectionRect
) {
  const titleClientRect = args.wrapperRef.current
    ?.querySelector<HTMLElement>('[data-sniptale-callout-title-shell="true"]')
    ?.getBoundingClientRect();
  const titleRect =
    titleClientRect && args.coordinateSpace
      ? args.coordinateSpace.clientRectToLogical(domRectToFrameAnnotationRect(titleClientRect))
      : titleClientRect;
  const guides = getCalloutSectionAnchorGuides(bubbleRect, titleRect ?? null);
  return {
    bubbleAnchorPositions: getCalloutPerimeterAnchorPositions(bubbleRect, guides),
    bubbleAnchors: getCalloutPerimeterAnchors(bubbleRect, guides),
  };
}

function useConnectorAttachmentDrags(
  args: Parameters<typeof useCalloutConnectorDrafts>[0],
  bubbleRect: SectionRect,
  connectorSide: ConnectorSide | null,
  bubbleAnchorPositions: number[],
  bubbleAnchors: ReturnType<typeof getCalloutPerimeterAnchors>
) {
  const tailBaseRange = useCalloutTailBaseRange({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    bubbleRect,
    connectorSide: args.baseLayout.dynamicTail?.kind === 'wedge' ? connectorSide : null,
    endPoint: args.baseLayout.dynamicTail?.attachment.baseEdgeB,
    isEditing: args.isEditing,
    onRangeChange: args.onTailBaseRangeChange,
    startPoint: args.baseLayout.dynamicTail?.attachment.baseEdgeA,
  });
  const lineBaseDrag = useCalloutEdgeDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
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
    onPositionChange: (position, attachment) => args.onTailBaseRangeChange(position, 0, attachment),
    perimeterAnchors: bubbleAnchors,
    perimeterAnchorPositions: bubbleAnchorPositions,
    perimeter: true,
    position: args.settings.placement.connectorBasePosition,
  });
  const tailFrameDrag = useCalloutEdgeDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
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
    perimeterAnchors: getCalloutPerimeterAnchors(args.frameRect),
    perimeter: args.baseLayout.dynamicTail?.kind === 'line',
    position: args.settings.placement.connectorFramePosition,
  });
  return { lineBaseDrag, tailBaseRange, tailFrameDrag };
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
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    onTailBaseRangeChange: args.onTailBaseRangeChange,
    onTailFramePositionChange: args.onTailFramePositionChange,
    onCurveChange: args.onCurveChange,
    onWaypointChange: args.onWaypointChange,
    settings: placement.settings,
    wrapperRef: args.wrapperRef,
  });
  const layout = connector.hasDraft
    ? getCalloutLayoutState({ ...baseLayoutArgs, settings: connector.settings })
    : baseLayout;
  if (layout.dynamicTail) previousConnectorSideRef.current = layout.dynamicTail.side;

  return {
    effectiveSettings: connector.settings,
    layout,
    handles: {
      curveEndDrag: connector.curveEndDrag,
      curveStartDrag: connector.curveStartDrag,
      drag: placement.drag,
      tailBaseEndDrag: connector.tailBaseRange.endDrag,
      tailBaseStartDrag:
        baseLayout.dynamicTail?.kind === 'line'
          ? connector.lineBaseDrag
          : connector.tailBaseRange.startDrag,
      tailFrameDrag: connector.tailFrameDrag,
      waypointDrag: connector.waypointDrag,
      widthResize: placement.widthResize,
    },
  };
}
