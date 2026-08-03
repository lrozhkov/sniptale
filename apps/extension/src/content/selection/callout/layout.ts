import type { CSSProperties } from 'react';
import type { CalloutSettings, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { FONT_FAMILY_MAP } from './constants';
import { getAnchorPosition, getCalloutPosition, getPreferredSideFromAnchor } from './geometry';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';
import { getLineConnectorState } from './line-connector';
import {
  Z_INDEX_CALLOUT_EDITING,
  Z_INDEX_CALLOUT_VIEWING,
} from '../interactive-frame/layout/portal';

type RegionRect = { x: number; y: number; width: number; height: number };

export function getCalloutLayoutState(args: {
  dimensions: { width: number; height: number };
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
  const calloutPos = placement.manualPlacement
    ? getManualCalloutPosition(args.frameRect, positionDimensions, placement.manualPlacement)
    : getCalloutPosition(
        resolvedSide,
        anchorPos,
        positionDimensions,
        style.connector.kind === 'wedge' ? style.connector.wedgeSize : 0
      );
  const effectiveZIndex = args.isEditing
    ? Z_INDEX_CALLOUT_EDITING
    : Math.min(args.zIndex, Z_INDEX_CALLOUT_VIEWING);
  const dynamicTail =
    style.connector.kind === 'wedge'
      ? getDynamicTailState({
          anchorPoint: anchorPos,
          bubbleRect: { ...calloutPos, ...positionDimensions },
          frameRect: args.frameRect,
          ...(placement.connectorBasePosition === undefined
            ? {}
            : { tailBasePosition: placement.connectorBasePosition }),
          ...(placement.connectorBaseWidth === undefined
            ? {}
            : { tailBaseWidth: placement.connectorBaseWidth }),
          ...(placement.connectorFramePosition === undefined
            ? {}
            : { tailFramePosition: placement.connectorFramePosition }),
          tailSize: style.connector.wedgeSize,
          ...(placement.manualPlacement ? {} : { preferredSide: resolvedSide }),
          ...(args.previousConnectorSide ? { previousSide: args.previousConnectorSide } : {}),
        })
      : style.connector.kind === 'line'
        ? getLineConnectorState({
            anchorPoint: anchorPos,
            bubbleRect: { ...calloutPos, ...positionDimensions },
            frameRect: args.frameRect,
            placement,
            routing: style.connector.routing,
            wedgeSize: style.connector.wedgeSize,
            ...(placement.manualPlacement ? {} : { preferredSide: resolvedSide }),
            ...(args.previousConnectorSide ? { previousSide: args.previousConnectorSide } : {}),
          })
        : null;

  return {
    effectiveZIndex,
    resolvedSide,
    dynamicTail,
    calloutPos,
    calloutDimensions: positionDimensions,
    wrapperStyle: getCalloutWrapperStyle(args.settings, calloutPos, effectiveZIndex),
    cloudStyle: getCalloutCloudStyle(args.settings, args.isEditing),
    editableStyle: getCalloutEditableStyle(args.isEditing),
  };
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
        'color-mix(in srgb, var(--sniptale-color-overlay) 32%, transparent))';

  return {
    position: 'fixed',
    left: calloutPos.x,
    top: calloutPos.y,
    zIndex: effectiveZIndex,
    pointerEvents: 'auto',
    filter: calloutShadow,
  };
}

function getCalloutCloudStyle(settings: CalloutSettings, isEditing: boolean): CSSProperties {
  const { surface, typography } = settings.style;
  return {
    position: 'relative',
    minWidth: 40,
    maxWidth: typography.maxWidth,
    backgroundColor: surface.backgroundColor,
    color: surface.textColor,
    border: `${surface.borderWidth}px solid ${surface.borderColor}`,
    borderRadius: surface.radius,
    padding: `${surface.paddingY}px ${surface.paddingX}px`,
    fontFamily: FONT_FAMILY_MAP[typography.fontFamily],
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    lineHeight: 1.4,
    cursor: isEditing ? 'text' : 'pointer',
    isolation: 'isolate',
    zIndex: 1,
    overflow: 'visible',
    transition: 'transform 0.1s ease-out',
  };
}

function getCalloutEditableStyle(_isEditing: boolean): CSSProperties {
  return {
    outline: 'none',
    minHeight: 'auto',
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };
}
