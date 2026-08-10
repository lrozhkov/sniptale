import type {
  CalloutPlacement,
  CalloutSettings,
  CalloutSettingsPatch,
  CalloutVisualStyle,
  LegacyCalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { getCanonicalSystemCalloutPreset } from '../../callout-presets/catalog';
import { clonePaint, createSolidPaint } from '@sniptale/foundation/paint';

export type { CalloutSettingsPatch } from '@sniptale/runtime-contracts/highlighter/callout';

const DEFAULT_STYLE = getCanonicalSystemCalloutPreset('system-callout-bubble').style;

const DEFAULT_PLACEMENT: CalloutPlacement = {
  anchor: 'top-center',
  connectorAttachments: {
    block: { mode: 'auto' },
    frame: { mode: 'auto' },
  },
  side: 'auto',
};

function cloneConnectorAttachments(placement: Partial<CalloutPlacement>) {
  const stored = placement.connectorAttachments;
  return {
    block: stored?.block
      ? { ...stored.block }
      : placement.connectorBasePosition === undefined
        ? { mode: 'auto' as const }
        : { mode: 'free' as const, perimeterPosition: placement.connectorBasePosition },
    frame: stored?.frame
      ? { ...stored.frame }
      : placement.connectorFramePosition === undefined
        ? { mode: 'auto' as const }
        : { mode: 'free' as const, perimeterPosition: placement.connectorFramePosition },
  };
}

export function cloneCalloutStyle(style: CalloutVisualStyle): CalloutVisualStyle {
  return {
    accentEdge: { ...DEFAULT_STYLE.accentEdge, ...style.accentEdge },
    badge: { ...DEFAULT_STYLE.badge, ...style.badge },
    colorBindings: { ...DEFAULT_STYLE.colorBindings, ...style.colorBindings },
    connector: {
      ...DEFAULT_STYLE.connector,
      ...style.connector,
      cornerStyle: {
        ...DEFAULT_STYLE.connector.cornerStyle,
        ...style.connector?.cornerStyle,
      },
      curve: {
        ...DEFAULT_STYLE.connector.curve,
        ...style.connector?.curve,
        ...(style.connector?.curve?.startHandle
          ? { startHandle: { ...style.connector.curve.startHandle } }
          : {}),
        ...(style.connector?.curve?.endHandle
          ? { endHandle: { ...style.connector.curve.endHandle } }
          : {}),
      },
      spacing: { ...DEFAULT_STYLE.connector.spacing, ...style.connector?.spacing },
    },
    customCss: style.customCss ?? DEFAULT_STYLE.customCss,
    surface: {
      ...DEFAULT_STYLE.surface,
      ...style.surface,
      fillPaint: clonePaint(style.surface?.fillPaint ?? DEFAULT_STYLE.surface.fillPaint),
    },
    title: { ...DEFAULT_STYLE.title, ...style.title },
    typography: { ...DEFAULT_STYLE.typography, ...style.typography },
  };
}

export function cloneCalloutSettings(settings: CalloutSettings): CalloutSettings {
  return {
    content: { ...settings.content },
    enabled: settings.enabled,
    ...(settings.instanceId === undefined ? {} : { instanceId: settings.instanceId }),
    placement: {
      ...settings.placement,
      connectorAttachments: cloneConnectorAttachments(settings.placement),
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
  placement?: Pick<CalloutPlacement, 'anchor' | 'side'> &
    Partial<Pick<CalloutPlacement, 'connectorAttachments'>>,
  content?: Pick<CalloutSettings['content'], 'titleText'>
): CalloutSettings {
  return {
    content: { bodyHtml: '', titleText: content?.titleText ?? '' },
    enabled: true,
    placement: {
      ...(placement ?? DEFAULT_PLACEMENT),
      connectorAttachments: cloneConnectorAttachments(placement ?? DEFAULT_PLACEMENT),
    },
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
    ...((patch.instanceId ?? settings.instanceId)
      ? { instanceId: patch.instanceId ?? settings.instanceId }
      : {}),
    placement: {
      ...settings.placement,
      ...patch.placement,
      connectorAttachments: patch.placement?.connectorAttachments
        ? {
            block: { ...patch.placement.connectorAttachments.block },
            frame: { ...patch.placement.connectorAttachments.frame },
          }
        : cloneConnectorAttachments(settings.placement),
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
      accentEdge: { ...settings.style.accentEdge, ...patch.style?.accentEdge },
      badge: { ...settings.style.badge, ...patch.style?.badge },
      colorBindings: { ...settings.style.colorBindings, ...patch.style?.colorBindings },
      connector: {
        ...settings.style.connector,
        ...patch.style?.connector,
        cornerStyle: {
          ...settings.style.connector.cornerStyle,
          ...patch.style?.connector?.cornerStyle,
        },
        curve: {
          ...settings.style.connector.curve,
          ...patch.style?.connector?.curve,
        },
        spacing: {
          ...settings.style.connector.spacing,
          ...patch.style?.connector?.spacing,
        },
      },
      customCss: patch.style?.customCss ?? settings.style.customCss,
      surface: {
        ...settings.style.surface,
        ...patch.style?.surface,
        fillPaint: clonePaint(patch.style?.surface?.fillPaint ?? settings.style.surface.fillPaint),
      },
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
      connectorAttachments: {
        block:
          settings.tailBasePosition === undefined
            ? { mode: 'auto' }
            : { mode: 'free', perimeterPosition: settings.tailBasePosition },
        frame:
          settings.tailFramePosition === undefined
            ? { mode: 'auto' }
            : { mode: 'free', perimeterPosition: settings.tailFramePosition },
      },
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
      accentEdge: { ...DEFAULT_STYLE.accentEdge },
      badge: { ...DEFAULT_STYLE.badge },
      colorBindings: { ...DEFAULT_STYLE.colorBindings },
      customCss: DEFAULT_STYLE.customCss,
      connector: {
        ...DEFAULT_STYLE.connector,
        color: settings.bgColor,
        kind: settings.variant === 'bubble' ? 'wedge' : 'none',
        wedgeSize: settings.tailSize,
      },
      surface: {
        ...DEFAULT_STYLE.surface,
        fillPaint: createSolidPaint(backgroundColor),
        radius: settings.variant === 'bubble' ? 12 : settings.variant === 'rect' ? 4 : 0,
        shadow: settings.variant === 'text-only' ? 0 : DEFAULT_STYLE.surface.shadow,
        textColor: settings.textColor,
        ...(settings.variant === 'text-only' ? { paddingX: 0, paddingY: 0 } : {}),
      },
      title: { ...DEFAULT_STYLE.title, textColor: settings.textColor },
      typography: {
        ...DEFAULT_STYLE.typography,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        fontStyle: 'normal',
        fontWeight: settings.fontWeight,
        maxWidth: settings.maxWidth,
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

export function createCalloutRenderKey(settings: CalloutSettings | undefined): string {
  return settings ? JSON.stringify(settings) : '';
}
