import type { CSSProperties } from 'react';
import type { CalloutSettings, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import { FONT_FAMILY_MAP } from './constants';
import { getAnchorPosition, getCalloutPosition, getPreferredSideFromAnchor } from './geometry';
import { getDynamicTailState, type ConnectorSide } from './dynamic-tail';
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
  const anchorPos = getAnchorPosition(args.settings.anchor, args.frameRect);
  const effectiveDimensions =
    args.dimensions.width > 0 && args.dimensions.height > 0
      ? args.dimensions
      : {
          width: Math.min(args.settings.maxWidth, 200),
          height: Math.max(24, args.settings.fontSize * 2.5),
        };
  const preferredSide = getPreferredSideFromAnchor(args.settings.anchor);
  const resolvedSide: Exclude<CalloutSide, 'auto'> =
    args.settings.side === 'auto' ? (preferredSide ?? 'top') : args.settings.side;
  const positionDimensions =
    args.dimensions.width > 0 && args.dimensions.height > 0 ? args.dimensions : effectiveDimensions;
  const calloutPos = args.settings.manualPlacement
    ? getManualCalloutPosition(args.frameRect, positionDimensions, args.settings.manualPlacement)
    : getCalloutPosition(resolvedSide, anchorPos, positionDimensions, args.settings.tailSize);
  const effectiveZIndex = args.isEditing
    ? Z_INDEX_CALLOUT_EDITING
    : Math.min(args.zIndex, Z_INDEX_CALLOUT_VIEWING);
  const dynamicTail =
    args.settings.variant === 'bubble'
      ? getDynamicTailState({
          anchorPoint: anchorPos,
          bubbleRect: { ...calloutPos, ...positionDimensions },
          frameRect: args.frameRect,
          ...(args.settings.tailBasePosition === undefined
            ? {}
            : { tailBasePosition: args.settings.tailBasePosition }),
          ...(args.settings.tailBaseWidth === undefined
            ? {}
            : { tailBaseWidth: args.settings.tailBaseWidth }),
          ...(args.settings.tailFramePosition === undefined
            ? {}
            : { tailFramePosition: args.settings.tailFramePosition }),
          tailSize: args.settings.tailSize,
          ...(args.settings.manualPlacement ? {} : { preferredSide: resolvedSide }),
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
  placement: NonNullable<CalloutSettings['manualPlacement']>
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
    settings.variant === 'text-only'
      ? 'none'
      : 'drop-shadow(0 4px 12px color-mix(in srgb, var(--sniptale-color-overlay) 32%, transparent))';

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
  return {
    position: 'relative',
    minWidth: 40,
    maxWidth: settings.maxWidth,
    backgroundColor: settings.variant === 'text-only' ? 'transparent' : settings.bgColor,
    color: settings.textColor,
    borderRadius: settings.variant === 'bubble' ? 12 : 4,
    padding: settings.variant === 'text-only' ? 0 : '8px 12px',
    fontFamily: FONT_FAMILY_MAP[settings.fontFamily],
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
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
