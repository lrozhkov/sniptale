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

export const SYSTEM_CALLOUT_PRESET_CATALOG_REVISION = 3;

const DEFAULT_PRESET_PLACEMENT = { anchor: 'top-center', side: 'top' } as const;

const baseStyle: CalloutVisualStyle = {
  connector: {
    blockMarker: 'none',
    blockMarkerSize: 10,
    color: '#334155',
    frameMarker: 'none',
    frameMarkerSize: 10,
    kind: 'none',
    routing: 'straight',
    wedgeSize: 8,
    width: 2,
  },
  surface: {
    backgroundColor: '#1F2937',
    borderColor: 'transparent',
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
    enabled: false,
    fontSize: 13,
    fontWeight: 'bold',
    textColor: '#FFFFFF',
  },
  typography: {
    fontFamily: 'sans',
    fontSize: 14,
    fontStyle: 'normal',
    fontWeight: 'normal',
    maxWidth: 220,
    textAlign: 'left',
    textDecoration: 'none',
  },
};

export function cloneCalloutVisualStyle(style: CalloutVisualStyle): CalloutVisualStyle {
  return {
    connector: { ...style.connector },
    surface: { ...style.surface },
    title: { ...style.title },
    typography: { ...style.typography },
  };
}

export function cloneCalloutPreset(preset: CalloutPreset): CalloutPreset {
  return {
    ...preset,
    placement: { ...preset.placement },
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
      color: '#2563EB',
      frameMarker: 'ring-dot',
      frameMarkerSize: 12,
      kind: 'line',
    },
    surface: {
      ...baseStyle.surface,
      backgroundColor: 'transparent',
      paddingX: 6,
      paddingY: 4,
      radius: 0,
      shadow: 0,
      textColor: '#1E3A8A',
    },
    title: { ...baseStyle.title, enabled: true, textColor: '#1D4ED8' },
    typography: { ...baseStyle.typography, fontSize: 13, maxWidth: 200 },
  }),
  createSystemPreset('system-callout-header-card', 4, {
    ...cloneCalloutVisualStyle(baseStyle),
    connector: {
      ...baseStyle.connector,
      color: '#2563EB',
      frameMarker: 'circle',
      kind: 'line',
      routing: 'elbow',
    },
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#EFF6FF',
      borderColor: '#93C5FD',
      borderWidth: 1,
      radius: 8,
      shadow: 10,
      textColor: '#1E3A8A',
    },
    title: {
      ...baseStyle.title,
      backgroundColor: '#2563EB',
      enabled: true,
      textColor: '#FFFFFF',
    },
  }),
  createSystemPreset('system-callout-framed-note', 5, {
    ...cloneCalloutVisualStyle(baseStyle),
    connector: {
      ...baseStyle.connector,
      color: '#D97706',
      frameMarker: 'arrow',
      frameMarkerSize: 12,
      kind: 'line',
    },
    surface: {
      ...baseStyle.surface,
      backgroundColor: '#FFFBEB',
      borderColor: '#F59E0B',
      borderWidth: 1,
      radius: 8,
      shadow: 8,
      textColor: '#78350F',
    },
    title: {
      ...baseStyle.title,
      backgroundColor: '#F59E0B',
      enabled: true,
      textColor: '#451A03',
    },
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
