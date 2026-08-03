import React from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { useCalloutDrag } from './drag';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutLayoutState } from './layout';
import { getCalloutEdgePosition, useCalloutEdgeDrag } from './tail-drag';
import { useCalloutTailBaseRange } from './tail-base-range';
import { useCalloutWidthResize } from './width-resize';

type FrameRect = { x: number; y: number; width: number; height: number };
type InteractionArgs = {
  dimensions: { width: number; height: number };
  frameRect: FrameRect;
  isEditing: boolean;
  isSettingsOpen?: boolean;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
  ) => void;
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
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
  const settings = drag.draftPlacement
    ? {
        ...widthSettings,
        placement: { ...widthSettings.placement, manualPlacement: drag.draftPlacement },
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
    defaultPosition: getCalloutEdgePosition(
      bubbleRect,
      connectorSide,
      args.baseLayout.dynamicTail?.attachment.bubbleEdgePoint
    ),
    isEditing: args.isEditing,
    onPositionChange: (position) => args.onTailBaseRangeChange(position, 0),
    position: args.settings.placement.connectorBasePosition,
  });
  const tailFrameDrag = useCalloutEdgeDrag({
    edgeRect: args.frameRect,
    connectorSide,
    defaultPosition: getCalloutEdgePosition(
      args.frameRect,
      connectorSide,
      args.baseLayout.dynamicTail?.attachment.framePoint
    ),
    isEditing: args.isEditing,
    onPositionChange: args.onTailFramePositionChange,
    position: args.settings.placement.connectorFramePosition,
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
    },
  };
  return {
    hasDraft:
      tailBaseRange.hasDraft ||
      lineBaseDrag.draftPosition !== null ||
      tailFrameDrag.draftPosition !== null,
    lineBaseDrag,
    settings,
    tailBaseRange,
    tailFrameDrag,
  };
}

export function useCalloutInteractionLayout(args: InteractionArgs) {
  const previousConnectorSideRef = React.useRef<ConnectorSide | undefined>(undefined);
  const placement = useCalloutPlacementDraft(args);
  const baseLayoutArgs = {
    dimensions: args.dimensions,
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
    widthResize: placement.widthResize,
  };
}
