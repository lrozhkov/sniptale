import type {
  CalloutPreset,
  CalloutVisualStyle,
  SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';

type SystemCalloutPreset = CalloutPreset & {
  basedOnRevision: number;
  customized: boolean;
  enabled: boolean;
  origin: 'system';
  systemPresetKey: SystemCalloutPresetKey;
};

export const SYSTEM_CALLOUT_PRESET_CATALOG_REVISION = 6;

const DEFAULT_PRESET_PLACEMENT = {
  anchor: 'top-center',
  connectorAttachments: {
    block: { mode: 'auto' },
    frame: { mode: 'auto' },
  },
  side: 'top',
} as const;

const baseStyle: CalloutVisualStyle = {
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
    text: '1',
    textColor: '#ffffff',
    textColorSource: 'custom',
  },
  colorBindings: {
    accent: 'custom',
    connector: 'custom',
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
    backgroundColor: '#1F2937',
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
    backgroundColor: 'transparent',
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
    surface: { ...baseStyle.surface, ...style.surface },
    title: { ...baseStyle.title, ...style.title },
    typography: { ...baseStyle.typography, ...style.typography },
  };
}

export function cloneCalloutPreset(preset: CalloutPreset): CalloutPreset {
  const connectorAttachments =
    preset.placement.connectorAttachments ?? DEFAULT_PRESET_PLACEMENT.connectorAttachments;
  return {
    ...preset,
    placement: {
      ...preset.placement,
      connectorAttachments: {
        block: { ...connectorAttachments.block },
        frame: { ...connectorAttachments.frame },
      },
    },
    style: cloneCalloutVisualStyle(preset.style),
  };
}

function createSystemPreset(
  systemPresetKey: SystemCalloutPresetKey,
  order: number,
  style: CalloutVisualStyle
): SystemCalloutPreset {
  return {
    basedOnRevision: SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
    customized: false,
    enabled: true,
    id: systemPresetKey,
    name: systemPresetKey,
    order,
    origin: 'system',
    placement: { ...DEFAULT_PRESET_PLACEMENT },
    style: cloneCalloutVisualStyle(style),
    systemPresetKey,
  };
}

const canonicalCatalog: readonly SystemCalloutPreset[] = [
  createSystemPreset('system-callout-bubble', 0, {
    ...cloneCalloutVisualStyle(baseStyle),
    connector: { ...baseStyle.connector, color: '#2b3038', kind: 'wedge' },
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#2b3038',
      radius: 12,
      shadow: 12,
      textColor: '#f8fafc',
    },
    title: { ...baseStyle.title, textColor: '#f8fafc' },
    typography: { ...baseStyle.typography, maxWidth: 200 },
  }),
  createSystemPreset('system-callout-card', 1, {
    ...cloneCalloutVisualStyle(baseStyle),
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#FFFFFF',
      borderColor: '#CBD5E1',
      borderWidth: 1,
      textColor: '#0F172A',
    },
    title: { ...baseStyle.title, textColor: '#0F172A' },
  }),
  createSystemPreset('system-callout-text', 2, {
    ...cloneCalloutVisualStyle(baseStyle),
    surface: {
      ...baseStyle.surface,
      backgroundColor: 'transparent',
      paddingX: 0,
      paddingY: 0,
      radius: 0,
      shadow: 0,
      textColor: '#0F172A',
    },
    title: { ...baseStyle.title, textColor: '#0F172A' },
  }),
  createSystemPreset('system-callout-pointer-note', 3, {
    ...cloneCalloutVisualStyle(baseStyle),
    connector: {
      ...baseStyle.connector,
      color: '#172033',
      frameMarker: 'ring-dot',
      frameMarkerSize: 11,
      kind: 'line',
      routing: 'polyline',
      width: 1,
    },
    customCss: [
      '[title]',
      'text-transform: uppercase;',
      'letter-spacing: 0.06em;',
      '[body]',
      'opacity: 0.82;',
    ].join('\n'),
    surface: {
      ...baseStyle.surface,
      backgroundColor: 'transparent',
      paddingX: 8,
      paddingY: 6,
      radius: 0,
      shadow: 0,
      textColor: '#334155',
    },
    title: {
      ...baseStyle.title,
      dividerColor: '#172033',
      dividerWidth: 1,
      enabled: true,
      fontSize: 14,
      textColor: '#172033',
    },
    typography: { ...baseStyle.typography, fontSize: 12, maxWidth: 210 },
  }),
  createSystemPreset('system-callout-header-card', 4, {
    ...cloneCalloutVisualStyle(baseStyle),
    connector: {
      ...baseStyle.connector,
      color: '#243B53',
      frameMarker: 'square',
      frameMarkerSize: 8,
      kind: 'line',
      routing: 'polyline',
      width: 2,
    },
    customCss: [
      '[card]',
      'outline-color: rgba(36, 59, 83, 0.22);',
      'outline-offset: 3px;',
      'outline-style: solid;',
      'outline-width: 1px;',
      '[title]',
      'text-transform: uppercase;',
      'letter-spacing: 0.05em;',
    ].join('\n'),
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#F8FAFC',
      borderColor: '#486581',
      borderWidth: 1,
      paddingX: 14,
      paddingY: 10,
      radius: 3,
      shadow: 8,
      textColor: '#334E68',
    },
    title: {
      ...baseStyle.title,
      backgroundColor: '#243B53',
      dividerColor: '#243B53',
      dividerWidth: 2,
      enabled: true,
      fontSize: 14,
      textColor: '#FFFFFF',
    },
    typography: { ...baseStyle.typography, fontSize: 13, maxWidth: 240 },
  }),
  createSystemPreset('system-callout-framed-note', 5, {
    ...cloneCalloutVisualStyle(baseStyle),
    accentEdge: {
      ...baseStyle.accentEdge,
      color: '#D99000',
      enabled: true,
      side: 'left',
      width: 5,
    },
    connector: {
      ...baseStyle.connector,
      color: '#8A5A00',
      frameMarker: 'diamond',
      frameMarkerSize: 9,
      kind: 'line',
      routing: 'polyline',
      width: 2,
    },
    customCss: [
      '[card]',
      'background-image: linear-gradient(135deg, rgba(217, 144, 0, 0.10), transparent 62%);',
      '[title]',
      'text-transform: uppercase;',
      'letter-spacing: 0.045em;',
    ].join('\n'),
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#FFF9E8',
      borderColor: '#E8C56A',
      borderWidth: 1,
      paddingX: 14,
      paddingY: 9,
      radius: 3,
      shadow: 10,
      textColor: '#553A00',
    },
    title: {
      ...baseStyle.title,
      dividerColor: '#D99000',
      dividerWidth: 2,
      enabled: true,
      fontSize: 14,
      textColor: '#5E3B00',
    },
    typography: { ...baseStyle.typography, fontSize: 13, maxWidth: 230 },
  }),
];

export function createSystemCalloutPresetCatalog(): CalloutPreset[] {
  return canonicalCatalog.map(cloneCalloutPreset);
}

export function getCanonicalSystemCalloutPreset(key: SystemCalloutPresetKey): SystemCalloutPreset {
  return cloneCalloutPreset(
    canonicalCatalog.find((preset) => preset.systemPresetKey === key)!
  ) as SystemCalloutPreset;
}
