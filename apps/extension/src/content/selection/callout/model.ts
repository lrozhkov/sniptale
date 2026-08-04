import type {
  CalloutPlacement,
  CalloutSettings,
  CalloutSettingsPatch,
  CalloutVisualStyle,
  LegacyCalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCanonicalSystemCalloutPreset } from '../../../features/highlighter/callout-presets/catalog';

export type { CalloutSettingsPatch } from '@sniptale/runtime-contracts/highlighter/callout';

const DEFAULT_STYLE = getCanonicalSystemCalloutPreset('system-callout-bubble').style;

const DEFAULT_PLACEMENT: CalloutPlacement = {
  anchor: 'top-center',
  side: 'auto',
};

export function cloneCalloutStyle(style: CalloutVisualStyle): CalloutVisualStyle {
  return {
    connector: { ...style.connector },
    surface: { ...DEFAULT_STYLE.surface, ...style.surface },
    title: { ...style.title },
    typography: { ...DEFAULT_STYLE.typography, ...style.typography },
  };
}

export function cloneCalloutSettings(settings: CalloutSettings): CalloutSettings {
  return {
    content: { ...settings.content },
    enabled: settings.enabled,
    placement: {
      ...settings.placement,
      ...(settings.placement.manualPlacement
        ? { manualPlacement: { ...settings.placement.manualPlacement } }
        : {}),
      ...(settings.placement.connectorWaypoint
        ? { connectorWaypoint: { ...settings.placement.connectorWaypoint } }
        : {}),
    },
    ...(settings.sourcePresetId === undefined ? {} : { sourcePresetId: settings.sourcePresetId }),
    style: cloneCalloutStyle(settings.style),
  };
}

export function createDefaultCalloutSettings(
  style?: CalloutVisualStyle,
  sourcePresetId?: string,
  placement?: Pick<CalloutPlacement, 'anchor' | 'side'>
): CalloutSettings {
  return {
    content: { bodyHtml: '', titleText: '' },
    enabled: true,
    placement: { ...(placement ?? DEFAULT_PLACEMENT) },
    ...(sourcePresetId ? { sourcePresetId } : {}),
    style: cloneCalloutStyle(style ?? DEFAULT_STYLE),
  };
}

export function applyCalloutSettingsPatch(
  settings: CalloutSettings,
  patch: CalloutSettingsPatch
): CalloutSettings {
  return {
    content: { ...settings.content, ...patch.content },
    enabled: patch.enabled ?? settings.enabled,
    placement: {
      ...settings.placement,
      ...patch.placement,
      ...(patch.placement?.manualPlacement
        ? { manualPlacement: { ...patch.placement.manualPlacement } }
        : {}),
      ...(patch.placement?.connectorWaypoint
        ? { connectorWaypoint: { ...patch.placement.connectorWaypoint } }
        : {}),
    },
    ...('sourcePresetId' in patch
      ? patch.sourcePresetId === undefined
        ? {}
        : { sourcePresetId: patch.sourcePresetId }
      : settings.sourcePresetId === undefined
        ? {}
        : { sourcePresetId: settings.sourcePresetId }),
    style: {
      connector: { ...settings.style.connector, ...patch.style?.connector },
      surface: { ...settings.style.surface, ...patch.style?.surface },
      title: { ...settings.style.title, ...patch.style?.title },
      typography: { ...settings.style.typography, ...patch.style?.typography },
    },
  };
}

function normalizeLegacyCallout(settings: LegacyCalloutSettings): CalloutSettings {
  const backgroundColor = settings.variant === 'text-only' ? 'transparent' : settings.bgColor;
  return {
    content: { bodyHtml: settings.htmlContent, titleText: '' },
    enabled: settings.enabled,
    placement: {
      anchor: settings.anchor,
      side: settings.side,
      ...(settings.manualPlacement ? { manualPlacement: { ...settings.manualPlacement } } : {}),
      ...(settings.tailBasePosition === undefined
        ? {}
        : { connectorBasePosition: settings.tailBasePosition }),
      ...(settings.tailBaseWidth === undefined
        ? {}
        : { connectorBaseWidth: settings.tailBaseWidth }),
      ...(settings.tailFramePosition === undefined
        ? {}
        : { connectorFramePosition: settings.tailFramePosition }),
    },
    style: {
      connector: {
        ...DEFAULT_STYLE.connector,
        color: settings.bgColor,
        kind: settings.variant === 'bubble' ? 'wedge' : 'none',
        wedgeSize: settings.tailSize,
      },
      surface: {
        ...DEFAULT_STYLE.surface,
        backgroundColor,
        radius: settings.variant === 'bubble' ? 12 : settings.variant === 'rect' ? 4 : 0,
        shadow: settings.variant === 'text-only' ? 0 : DEFAULT_STYLE.surface.shadow,
        textColor: settings.textColor,
        ...(settings.variant === 'text-only' ? { paddingX: 0, paddingY: 0 } : {}),
      },
      title: { ...DEFAULT_STYLE.title, textColor: settings.textColor },
      typography: {
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        fontStyle: 'normal',
        fontWeight: settings.fontWeight,
        maxWidth: settings.maxWidth,
        textAlign: 'left',
        textDecoration: 'none',
      },
    },
  };
}

export function normalizeCalloutSettings(
  settings?: CalloutSettings | LegacyCalloutSettings
): CalloutSettings {
  if (!settings) return createDefaultCalloutSettings();
  if ('content' in settings && 'placement' in settings && 'style' in settings) {
    return cloneCalloutSettings(settings);
  }
  return normalizeLegacyCallout(settings);
}

export function createCalloutStyleSnapshot(settings: CalloutSettings): CalloutVisualStyle {
  return cloneCalloutStyle(settings.style);
}

export function createCalloutRenderKey(settings: CalloutSettings | undefined): string {
  return settings ? JSON.stringify(settings) : '';
}
