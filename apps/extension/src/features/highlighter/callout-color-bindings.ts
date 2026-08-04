import type {
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
  return {
    ...style,
    accentEdge: {
      ...style.accentEdge,
      color: resolveCalloutBoundColor(colorBindings.accent, style.accentEdge.color, frameColors),
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
