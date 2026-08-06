import type { CSSProperties } from 'react';
import type { CalloutSettings, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { FONT_FAMILY_MAP } from './constants';
import { getAnchorPosition, getCalloutPosition, getPreferredSideFromAnchor } from './geometry';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';
import { getLineConnectorState } from './line-connector';
import { resolveCalloutAttachmentPosition } from './tail-drag';
import {
  Z_INDEX_CALLOUT_EDITING,
  Z_INDEX_CALLOUT_VIEWING,
} from '../interactive-frame/layout/portal';

type RegionRect = { x: number; y: number; width: number; height: number };
const MIN_CALLOUT_CONTENT_WIDTH = 40;

export function getCalloutLayoutState(args: {
  dimensions: { width: number; height: number };
  frameBorderWidth?: number;
  frameRect: RegionRect;
  isEditing: boolean;
  settings: CalloutSettings;
  zIndex: number;
  previousConnectorSide?: ConnectorSide;
}) {
  const { placement, style } = args.settings;
  const anchorPos = getAnchorPosition(placement.anchor, args.frameRect);
  const effectiveDimensions =
    args.dimensions.width > 0 && args.dimensions.height > 0
      ? args.dimensions
      : {
          width: Math.min(style.typography.maxWidth, 200),
          height: Math.max(24, style.typography.fontSize * 2.5),
        };
  const preferredSide = getPreferredSideFromAnchor(placement.anchor);
  const resolvedSide: Exclude<CalloutSide, 'auto'> =
    placement.side === 'auto' ? (preferredSide ?? 'top') : placement.side;
  const positionDimensions =
    args.dimensions.width > 0 && args.dimensions.height > 0 ? args.dimensions : effectiveDimensions;
  const automaticCalloutPos = getCalloutPosition({
    anchor: placement.anchor,
    anchorPos,
    calloutDimensions: positionDimensions,
    frameHeight: args.frameRect.height,
    side: resolvedSide,
    tailSize: style.connector.kind === 'wedge' ? style.connector.wedgeSize : 0,
  });
  const calloutPos = placement.manualPlacement
    ? getManualCalloutPosition(args.frameRect, positionDimensions, placement.manualPlacement)
    : automaticCalloutPos;
  const bubbleOffset = {
    x: calloutPos.x - automaticCalloutPos.x,
    y: calloutPos.y - automaticCalloutPos.y,
  };
  const bubbleRect = { ...calloutPos, ...positionDimensions };
  const blockAttachmentPosition = resolveCalloutAttachmentPosition(
    bubbleRect,
    placement.connectorAttachments?.block
  );
  const frameAttachmentPosition = resolveCalloutAttachmentPosition(
    args.frameRect,
    placement.connectorAttachments?.frame
  );
  const connectorPlacement = {
    ...placement,
    connectorBasePosition: placement.connectorAttachments?.block
      ? blockAttachmentPosition
      : placement.connectorBasePosition,
    connectorFramePosition: placement.connectorAttachments?.frame
      ? frameAttachmentPosition
      : placement.connectorFramePosition,
  };
  const effectiveZIndex = args.isEditing
    ? Z_INDEX_CALLOUT_EDITING
    : Math.min(args.zIndex, Z_INDEX_CALLOUT_VIEWING);
  const connectorState =
    style.connector.kind === 'wedge'
      ? getDynamicTailState({
          anchorPoint: anchorPos,
          borderRadius: style.surface.radius,
          borderWidth: style.surface.borderWidth,
          bubbleOffset,
          bubbleRect,
          frameRect: args.frameRect,
          ...(connectorPlacement.connectorBasePosition === undefined
            ? {}
            : { tailBasePosition: connectorPlacement.connectorBasePosition }),
          ...(placement.connectorBaseWidth === undefined
            ? {}
            : { tailBaseWidth: placement.connectorBaseWidth }),
          ...(connectorPlacement.connectorFramePosition === undefined
            ? {}
            : { tailFramePosition: connectorPlacement.connectorFramePosition }),
          tailSize: style.connector.wedgeSize,
          ...(placement.manualPlacement ? {} : { preferredSide: resolvedSide }),
          ...(args.previousConnectorSide ? { previousSide: args.previousConnectorSide } : {}),
        })
      : style.connector.kind === 'line'
        ? getLineConnectorState({
            anchorPoint: anchorPos,
            blockBoundaryWidth: style.surface.borderWidth,
            blockMarker: style.connector.blockMarker,
            blockMarkerSize: style.connector.blockMarkerSize,
            bubbleOffset,
            bubbleRect,
            frameBoundaryWidth: args.frameBorderWidth ?? 0,
            frameMarker: style.connector.frameMarker,
            frameMarkerSize: style.connector.frameMarkerSize,
            frameRect: args.frameRect,
            lineWidth: style.connector.width,
            placement: connectorPlacement,
            routing: style.connector.routing,
            cornerStyle: style.connector.cornerStyle,
            curve: style.connector.curve,
            spacing: style.connector.spacing,
            wedgeSize: style.connector.wedgeSize,
            ...(placement.manualPlacement ? {} : { preferredSide: resolvedSide }),
            ...(args.previousConnectorSide ? { previousSide: args.previousConnectorSide } : {}),
          })
        : null;
  const dynamicTail =
    connectorState?.kind === 'wedge' &&
    !doesWedgeExitBubble(connectorState, { ...calloutPos, ...positionDimensions })
      ? null
      : connectorState;

  return {
    effectiveZIndex,
    resolvedSide,
    dynamicTail,
    calloutPos,
    calloutDimensions: positionDimensions,
    wrapperStyle: getCalloutWrapperStyle(args.settings, calloutPos, effectiveZIndex),
    cloudStyle: getCalloutCloudStyle(args.settings, args.isEditing, dynamicTail),
    editableStyle: getCalloutEditableStyle(args.settings),
  };
}

function doesWedgeExitBubble(
  connector: ReturnType<typeof getDynamicTailState>,
  bubbleRect: RegionRect
) {
  const tip = connector.attachment.tipPoint;
  switch (connector.side) {
    case 'top':
      return tip.y >= bubbleRect.y + bubbleRect.height;
    case 'right':
      return tip.x <= bubbleRect.x;
    case 'bottom':
      return tip.y <= bubbleRect.y;
    case 'left':
      return tip.x >= bubbleRect.x + bubbleRect.width;
  }
}

function getManualCalloutPosition(
  frameRect: RegionRect,
  dimensions: { width: number; height: number },
  placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
) {
  const desiredX =
    frameRect.x + frameRect.width / 2 + placement.centerOffsetX - dimensions.width / 2;
  const desiredY =
    frameRect.y + frameRect.height / 2 + placement.centerOffsetY - dimensions.height / 2;
  return {
    x: desiredX,
    y: desiredY,
  };
}

function getCalloutWrapperStyle(
  settings: CalloutSettings,
  calloutPos: { x: number; y: number },
  effectiveZIndex: number
): CSSProperties {
  const calloutShadow =
    settings.style.surface.shadow <= 0
      ? 'none'
      : `drop-shadow(0 4px ${settings.style.surface.shadow}px ` +
        `color-mix(in srgb, ${settings.style.surface.shadowColor} 32%, transparent))`;

  return {
    position: 'fixed',
    left: calloutPos.x,
    top: calloutPos.y,
    zIndex: effectiveZIndex,
    pointerEvents: 'auto',
    filter: calloutShadow,
  };
}

function getCalloutCloudStyle(
  settings: CalloutSettings,
  isEditing: boolean,
  connector:
    | ReturnType<typeof getDynamicTailState>
    | ReturnType<typeof getLineConnectorState>
    | null
): CSSProperties {
  const { surface, typography } = settings.style;
  const hasWedgeOutline = connector?.kind === 'wedge' && surface.borderWidth > 0;
  return {
    position: 'relative',
    minWidth: 'min-content',
    width: 'max-content',
    maxWidth: typography.maxWidth,
    backgroundColor: hasWedgeOutline ? 'transparent' : surface.backgroundColor,
    color: surface.textColor,
    border: `${surface.borderWidth}px ${surface.borderStyle} ${
      hasWedgeOutline ? 'transparent' : surface.borderColor
    }`,
    borderRadius: surface.radius,
    padding: `${surface.paddingY}px ${surface.paddingX}px`,
    fontFamily: FONT_FAMILY_MAP[typography.fontFamily],
    fontSize: typography.fontSize,
    fontStyle: typography.fontStyle,
    fontWeight: typography.fontWeight,
    textAlign: typography.textAlign,
    // Text decorations propagate through descendants and cannot be cancelled by a child.
    // Keep the card neutral so body underline never reaches the title or badge.
    textDecoration: 'none',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    cursor: isEditing ? 'text' : 'pointer',
    isolation: 'isolate',
    zIndex: 1,
    overflow: 'visible',
    transition: 'transform 0.1s ease-out',
  };
}

function getCalloutEditableStyle(settings: CalloutSettings): CSSProperties {
  const typography = settings.style.typography;
  return {
    outline: 'none',
    minHeight: 'auto',
    minWidth: MIN_CALLOUT_CONTENT_WIDTH,
    unicodeBidi: 'plaintext',
    hyphens: typography.hyphens,
    overflowWrap: typography.wordBreak === 'break-word' ? 'anywhere' : 'normal',
    wordBreak: typography.wordBreak === 'break-word' ? 'break-word' : 'normal',
    whiteSpace: 'pre-wrap',
    textDecoration: typography.textDecoration,
  };
}
