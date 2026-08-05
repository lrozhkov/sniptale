import type {
  CalloutBadgeColorSource,
  CalloutColorSource,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';

export type CalloutFrameColors = {
  borderColor?: string | undefined;
  fillColor?: string | undefined;
};

export function getCalloutFrameColors(
  frameStyle: { color: string; fillColor: string; fillOpacity: number } | null | undefined
): CalloutFrameColors {
  return {
    borderColor: frameStyle?.color,
    fillColor: (frameStyle?.fillOpacity ?? 0) > 0 ? frameStyle?.fillColor : undefined,
  };
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
    surfaceBackground: 'custom',
    surfaceBorder: 'custom',
  };
  const accentColor = resolveCalloutBoundColor(
    colorBindings.accent,
    style.accentEdge.color,
    frameColors
  );
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
      backgroundColor: resolveCalloutBoundColor(
        colorBindings.surfaceBackground,
        style.surface.backgroundColor,
        frameColors
      ),
      borderColor: resolveCalloutBoundColor(
        colorBindings.surfaceBorder,
        style.surface.borderColor,
        frameColors
      ),
    },
  };
}
