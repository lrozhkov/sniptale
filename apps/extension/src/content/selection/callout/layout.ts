import type { CSSProperties } from 'react';
import type { CalloutSettings, CalloutSide } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  FONT_FAMILY_MAP,
  getAnchorPosition,
  getCalloutPosition,
  getPreferredSideFromAnchor,
  getTailOffset,
  pickBestSide,
} from './utils';

type RegionRect = { x: number; y: number; width: number; height: number };

export function getCalloutLayoutState(args: {
  dimensions: { width: number; height: number };
  frameRect: RegionRect;
  isEditing: boolean;
  settings: CalloutSettings;
  zIndex: number;
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
    args.settings.side === 'auto'
      ? pickBestSide(anchorPos, effectiveDimensions, args.settings.tailSize, preferredSide)
      : args.settings.side;
  const calloutPos =
    args.dimensions.width > 0 && args.dimensions.height > 0
      ? getCalloutPosition(resolvedSide, anchorPos, args.dimensions, args.settings.tailSize)
      : getCalloutPosition(resolvedSide, anchorPos, effectiveDimensions, args.settings.tailSize);
  const dimensionsForTail =
    args.dimensions.width > 0 && args.dimensions.height > 0 ? args.dimensions : effectiveDimensions;
  const tailOffset =
    args.settings.variant === 'bubble'
      ? getTailOffset(
          resolvedSide,
          anchorPos,
          calloutPos,
          dimensionsForTail,
          args.settings.tailSize
        )
      : 0;
  const effectiveZIndex = args.isEditing ? 2147483647 : args.zIndex;

  return {
    effectiveZIndex,
    resolvedSide,
    tailOffset,
    wrapperStyle: getCalloutWrapperStyle(args.settings, calloutPos, effectiveZIndex),
    cloudStyle: getCalloutCloudStyle(args.settings, args.isEditing),
    editableStyle: getCalloutEditableStyle(args.isEditing),
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
    overflow: 'visible',
    transition: 'transform 0.1s ease-out',
  };
}

function getCalloutEditableStyle(isEditing: boolean): CSSProperties {
  return {
    outline: 'none',
    minHeight: isEditing ? 24 : 'auto',
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };
}
