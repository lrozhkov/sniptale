import type {
  CalloutBadgeColorSource,
  CalloutColorSource,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { hasVisibleColor } from '@sniptale/foundation/color';
import {
  clonePaint,
  createSolidPaint,
  getRepresentativeColor,
  type Paint,
} from '@sniptale/foundation/paint';

export type CalloutFrameColors = {
  borderColor?: string | undefined;
  fillColor?: string | undefined;
  fillPaint?: Paint | undefined;
};

export function getCalloutFrameColors(
  frameStyle: { color: string; fillPaint: Paint } | null | undefined
): CalloutFrameColors {
  return {
    borderColor: frameStyle?.color,
    fillPaint: frameStyle ? clonePaint(frameStyle.fillPaint) : undefined,
    fillColor:
      frameStyle && hasVisibleColor(getRepresentativeColor(frameStyle.fillPaint))
        ? getRepresentativeColor(frameStyle.fillPaint)
        : undefined,
  };
}

function resolveCalloutBoundPaint(
  source: CalloutColorSource,
  customPaint: Paint,
  frameColors: CalloutFrameColors
): Paint {
  if (source === 'frame-fill' && frameColors.fillPaint) return clonePaint(frameColors.fillPaint);
  if (source === 'frame-fill' && frameColors.fillColor) {
    return createSolidPaint(frameColors.fillColor);
  }
  if (source === 'frame-border' && frameColors.borderColor) {
    return createSolidPaint(frameColors.borderColor);
  }
  return clonePaint(customPaint);
}

function resolveBadgeColor(
  source: CalloutBadgeColorSource,
  customColor: string,
  frameColors: CalloutFrameColors,
  accentColor: string
) {
  return source === 'accent'
    ? accentColor
    : resolveCalloutBoundColor(source, customColor, frameColors);
}

export function resolveCalloutBoundColor(
  source: CalloutColorSource,
  customColor: string,
  frameColors: CalloutFrameColors
) {
  if (source === 'frame-border') return frameColors.borderColor ?? customColor;
  if (source === 'frame-fill') return frameColors.fillColor ?? customColor;
  return customColor;
}

export function resolveCalloutColorBindings(
  style: CalloutVisualStyle,
  frameColors: CalloutFrameColors
): CalloutVisualStyle {
  const colorBindings = style.colorBindings ?? {
    accent: 'custom',
    connector: 'custom',
    shadow: 'custom',
    surfaceBackground: 'custom',
    surfaceBorder: 'custom',
  };
  const accentColor = resolveCalloutBoundColor(
    colorBindings.accent,
    style.accentEdge.color,
    frameColors
  );
  const surfaceFillPaint = resolveCalloutBoundPaint(
    colorBindings.surfaceBackground,
    style.surface.fillPaint,
    frameColors
  );
  const surfaceBackgroundColor = getRepresentativeColor(surfaceFillPaint);
  const surfaceBorderColor = resolveCalloutBoundColor(
    colorBindings.surfaceBorder,
    style.surface.borderColor,
    frameColors
  );
  const shadowColor =
    colorBindings.shadow === 'surface-background'
      ? surfaceBackgroundColor
      : colorBindings.shadow === 'surface-border'
        ? surfaceBorderColor
        : style.surface.shadowColor;
  return {
    ...style,
    accentEdge: {
      ...style.accentEdge,
      color: accentColor,
    },
    badge: {
      ...style.badge,
      backgroundColor: resolveBadgeColor(
        style.badge.backgroundColorSource,
        style.badge.backgroundColor,
        frameColors,
        accentColor
      ),
      borderColor: resolveBadgeColor(
        style.badge.borderColorSource,
        style.badge.borderColor,
        frameColors,
        accentColor
      ),
      textColor: resolveBadgeColor(
        style.badge.textColorSource,
        style.badge.textColor,
        frameColors,
        accentColor
      ),
    },
    colorBindings,
    connector: {
      ...style.connector,
      color: resolveCalloutBoundColor(colorBindings.connector, style.connector.color, frameColors),
    },
    surface: {
      ...style.surface,
      fillPaint: surfaceFillPaint,
      borderColor: surfaceBorderColor,
      shadowColor,
    },
  };
}
