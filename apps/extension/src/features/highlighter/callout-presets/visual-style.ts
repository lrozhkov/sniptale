import type {
  CalloutPreset,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { clonePaint, createSolidPaint } from '@sniptale/foundation/paint';

export const DEFAULT_CALLOUT_PRESET_PLACEMENT = {
  anchor: 'top-center',
  connectorAttachments: {
    block: { mode: 'auto' },
    frame: { mode: 'auto' },
  },
  side: 'top',
} as const;

export const BASE_CALLOUT_VISUAL_STYLE: CalloutVisualStyle = {
  accentEdge: {
    color: '#f97316',
    enabled: false,
    lineStyle: 'solid',
    side: 'left',
    width: 4,
  },
  badge: {
    backgroundColor: '#f97316',
    backgroundColorSource: 'accent',
    borderColor: 'transparent',
    borderColorSource: 'custom',
    borderWidth: 0,
    enabled: false,
    fontSize: 11,
    fontWeight: 'bold',
    placement: 'title-start',
    shape: 'rounded',
    size: 20,
    text: '',
    textColor: '#ffffff',
    textColorSource: 'custom',
  },
  colorBindings: {
    accent: 'custom',
    connector: 'custom',
    shadow: 'custom',
    surfaceBackground: 'custom',
    surfaceBorder: 'custom',
  },
  connector: {
    blockMarker: 'none',
    blockMarkerSize: 10,
    color: '#334155',
    cornerStyle: { kind: 'sharp', radius: 8 },
    curve: { curvature: 0.35, mode: 'auto' },
    frameMarker: 'none',
    frameMarkerSize: 10,
    kind: 'none',
    lineStyle: 'solid',
    routing: 'straight',
    spacing: {
      blockGap: 0,
      frameGap: 0,
      minimumEndSegment: 16,
      obstacleMargin: 0,
    },
    wedgeSize: 8,
    width: 2,
  },
  customCss: '',
  surface: {
    fillPaint: createSolidPaint('#1F2937'),
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: 0,
    paddingX: 12,
    paddingY: 8,
    radius: 8,
    shadow: 20,
    shadowColor: '#000000',
    textColor: '#FFFFFF',
  },
  title: {
    fillPaint: createSolidPaint('transparent'),
    fillMode: 'separate',
    dividerColor: 'transparent',
    dividerStyle: 'solid',
    dividerWidth: 0,
    enabled: false,
    direction: 'auto',
    fontFamily: 'sans',
    fontSize: 13,
    fontStyle: 'normal',
    fontWeight: 'bold',
    letterSpacing: 0,
    lineHeight: 1.2,
    textAlign: 'left',
    textDecoration: 'none',
    textColor: '#FFFFFF',
  },
  typography: {
    direction: 'auto',
    fontFamily: 'sans',
    fontSize: 14,
    fontStyle: 'normal',
    fontWeight: 'normal',
    hyphens: 'none',
    letterSpacing: 0,
    lineHeight: 1.4,
    maxWidth: 220,
    textAlign: 'left',
    textDecoration: 'none',
    wordBreak: 'normal',
  },
};

export function cloneCalloutVisualStyle(style: CalloutVisualStyle): CalloutVisualStyle {
  const baseStyle = BASE_CALLOUT_VISUAL_STYLE;
  return {
    accentEdge: { ...baseStyle.accentEdge, ...style.accentEdge },
    badge: { ...baseStyle.badge, ...style.badge },
    colorBindings: { ...baseStyle.colorBindings, ...style.colorBindings },
    connector: {
      ...baseStyle.connector,
      ...style.connector,
      cornerStyle: { ...baseStyle.connector.cornerStyle, ...style.connector?.cornerStyle },
      curve: {
        ...baseStyle.connector.curve,
        ...style.connector?.curve,
        ...(style.connector?.curve?.startHandle
          ? { startHandle: { ...style.connector.curve.startHandle } }
          : {}),
        ...(style.connector?.curve?.endHandle
          ? { endHandle: { ...style.connector.curve.endHandle } }
          : {}),
      },
      spacing: { ...baseStyle.connector.spacing, ...style.connector?.spacing },
    },
    customCss: style.customCss ?? baseStyle.customCss,
    surface: {
      ...baseStyle.surface,
      ...style.surface,
      fillPaint: clonePaint(style.surface?.fillPaint ?? baseStyle.surface.fillPaint),
    },
    title: {
      ...baseStyle.title,
      ...style.title,
      fillPaint: clonePaint(style.title?.fillPaint ?? baseStyle.title.fillPaint),
    },
    typography: { ...baseStyle.typography, ...style.typography },
  };
}

export function cloneCalloutPreset(preset: CalloutPreset): CalloutPreset {
  const connectorAttachments =
    preset.placement.connectorAttachments ?? DEFAULT_CALLOUT_PRESET_PLACEMENT.connectorAttachments;
  return {
    ...preset,
    content: { ...preset.content },
    placement: {
      ...preset.placement,
      connectorAttachments: {
        block: { ...connectorAttachments.block },
        frame: { ...connectorAttachments.frame },
      },
    },
    style: cloneCalloutVisualStyle(preset.style),
    tagIds: [...preset.tagIds],
  };
}
