import React from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { useCalloutDrag } from './drag';
import type { ConnectorSide } from './dynamic-tail';
import { getCalloutLayoutState } from './layout';
import { getCalloutEdgePosition, useCalloutEdgeDrag } from './tail-drag';
import { useCalloutTailBaseRange } from './tail-base-range';
import { useCalloutWidthResize } from './width-resize';

type FrameRect = { x: number; y: number; width: number; height: number };

export function useCalloutInteractionLayout(args: {
  dimensions: { width: number; height: number };
  frameRect: FrameRect;
  isEditing: boolean;
  isSettingsOpen?: boolean;
  onPositionChange: (placement: NonNullable<CalloutSettings['manualPlacement']>) => void;
  onTailBaseRangeChange: (position: number, width: number) => void;
  onTailFramePositionChange: (position: number) => void;
  onWidthChange: (
    maxWidth: number,
    placement: NonNullable<CalloutSettings['manualPlacement']>
  ) => void;
  settings: CalloutSettings;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  zIndex: number;
}) {
  const previousConnectorSideRef = React.useRef<ConnectorSide | undefined>(undefined);
  const widthResize = useCalloutWidthResize({
    dimensions: args.dimensions,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    manualPlacement: args.settings.manualPlacement,
    maxWidth: args.settings.maxWidth,
    onWidthChange: args.onWidthChange,
    wrapperRef: args.wrapperRef,
  });
  const drag = useCalloutDrag({
    frameRect: args.frameRect,
    dimensions: args.dimensions,
    isEditing: args.isEditing,
    isHandlePinned: Boolean(args.isSettingsOpen) || widthResize.isResizing,
    manualPlacement: args.settings.manualPlacement,
    onPositionChange: args.onPositionChange,
    wrapperRef: args.wrapperRef,
  });
  const widthSettings = {
    ...args.settings,
    ...(widthResize.draftMaxWidth === null ? {} : { maxWidth: widthResize.draftMaxWidth }),
    ...(widthResize.draftPlacement ? { manualPlacement: widthResize.draftPlacement } : {}),
  };
  const placementSettings = drag.draftPlacement
    ? { ...widthSettings, manualPlacement: drag.draftPlacement }
    : widthSettings;
  const baseLayoutArgs = {
    dimensions: args.dimensions,
    frameRect: args.frameRect,
    isEditing: args.isEditing,
    settings: placementSettings,
    zIndex: args.zIndex,
    ...(previousConnectorSideRef.current
      ? { previousConnectorSide: previousConnectorSideRef.current }
      : {}),
  };
  const baseLayout = getCalloutLayoutState(baseLayoutArgs);
  const connectorSide = baseLayout.dynamicTail?.side ?? null;
  const bubbleRect = { ...baseLayout.calloutPos, ...baseLayout.calloutDimensions };
  const tailBaseRange = useCalloutTailBaseRange({
    bubbleRect,
    connectorSide,
    endPoint: baseLayout.dynamicTail?.attachment.baseEdgeB,
    isEditing: args.isEditing,
    onRangeChange: args.onTailBaseRangeChange,
    startPoint: baseLayout.dynamicTail?.attachment.baseEdgeA,
  });
  const tailFrameDrag = useCalloutEdgeDrag({
    edgeRect: args.frameRect,
    connectorSide: baseLayout.dynamicTail?.side ?? null,
    defaultPosition: getCalloutEdgePosition(
      args.frameRect,
      connectorSide,
      baseLayout.dynamicTail?.attachment.framePoint
    ),
    isEditing: args.isEditing,
    onPositionChange: args.onTailFramePositionChange,
    position: args.settings.tailFramePosition,
  });
  const effectiveSettings = {
    ...placementSettings,
    ...(tailBaseRange.draftSettings ?? {}),
    ...(tailFrameDrag.draftPosition === null
      ? {}
      : { tailFramePosition: tailFrameDrag.draftPosition }),
  };
  const hasTailDraft = tailBaseRange.hasDraft || tailFrameDrag.draftPosition !== null;
  const layout = hasTailDraft
    ? getCalloutLayoutState({ ...baseLayoutArgs, settings: effectiveSettings })
    : baseLayout;
  if (layout.dynamicTail) previousConnectorSideRef.current = layout.dynamicTail.side;

  return {
    drag,
    effectiveSettings,
    layout,
    tailBaseEndDrag: tailBaseRange.endDrag,
    tailBaseStartDrag: tailBaseRange.startDrag,
    tailFrameDrag,
    widthResize,
  };
}
