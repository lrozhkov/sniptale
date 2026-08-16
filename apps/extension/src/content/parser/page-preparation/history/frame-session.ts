import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type {
  CalloutSettings,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameSessionSnapshot, SerializableFrameData } from './types';
import { cloneCalloutVisualStyle } from '../../../../features/highlighter/callout-presets/visual-style';
import {
  cloneAppliedBorderSettings,
  normalizeAppliedBorderSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';

function cloneHistoryCalloutSettings(settings: CalloutSettings): CalloutSettings {
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
    style: cloneCalloutVisualStyle(settings.style),
  };
}

function cloneFrameSettings(frame: FrameData): SerializableFrameData {
  return {
    ...frame,
    ...(frame.blurSettings ? { blurSettings: { ...frame.blurSettings } } : {}),
    ...(frame.borderSettings
      ? {
          borderSettings: cloneAppliedBorderSettings(frame.borderSettings),
        }
      : {}),
    ...(frame.callout
      ? {
          callout: cloneHistoryCalloutSettings(frame.callout),
        }
      : {}),
    ...(frame.additionalCallouts
      ? { additionalCallouts: frame.additionalCallouts.map(cloneHistoryCalloutSettings) }
      : {}),
    ...(frame.focusSettings ? { focusSettings: { ...frame.focusSettings } } : {}),
    ...(frame.offset ? { offset: { ...frame.offset } } : {}),
    ...(frame.pagePlacement
      ? {
          pagePlacement: {
            ...frame.pagePlacement,
            iframePath: [...frame.pagePlacement.iframePath],
          },
        }
      : {}),
    ...(frame.stepBadge
      ? {
          stepBadge: {
            ...frame.stepBadge,
            offsetDirections: [...(frame.stepBadge.offsetDirections ?? [])],
            ...(frame.stepBadge.style ? { style: { ...frame.stepBadge.style } } : {}),
            ...(frame.stepBadge.manualPlacement
              ? { manualPlacement: { ...frame.stepBadge.manualPlacement } }
              : {}),
          },
        }
      : {}),
  };
}

export function captureFrameSessionSnapshot(args: {
  frames: FrameData[];
  globalEffectMode: EffectMode;
  globalStepBadgeSettings: GlobalStepBadgeSettings;
  sessionBorderPreset: AppliedBorderSettings;
  sessionBlurSettings: BlurSettings;
  sessionCalloutStyle: CalloutVisualStyle | null;
  sessionFocusSettings: FocusSettings;
  sessionStepBadgeTemplate: StepBadgeSettings | null;
  stepBadgeOrder: Map<string, number>;
}): FrameSessionSnapshot {
  return {
    frames: args.frames.map(cloneFrameSettings),
    globalEffectMode: args.globalEffectMode,
    globalStepBadgeSettings: { ...args.globalStepBadgeSettings },
    sessionBorderPreset: cloneAppliedBorderSettings(args.sessionBorderPreset),
    sessionBlurSettings: { ...args.sessionBlurSettings },
    sessionCalloutStyle: args.sessionCalloutStyle
      ? cloneCalloutVisualStyle(args.sessionCalloutStyle)
      : null,
    sessionFocusSettings: { ...args.sessionFocusSettings },
    sessionStepBadgeTemplate: args.sessionStepBadgeTemplate
      ? {
          ...args.sessionStepBadgeTemplate,
          offsetDirections: [...(args.sessionStepBadgeTemplate.offsetDirections ?? [])],
          ...(args.sessionStepBadgeTemplate.style
            ? { style: { ...args.sessionStepBadgeTemplate.style } }
            : {}),
          ...(args.sessionStepBadgeTemplate.manualPlacement
            ? { manualPlacement: { ...args.sessionStepBadgeTemplate.manualPlacement } }
            : {}),
        }
      : null,
    stepBadgeOrder: Array.from(args.stepBadgeOrder.entries()),
  };
}

export function hydrateFrameSessionSnapshot(snapshot: FrameSessionSnapshot): {
  frames: FrameData[];
  stepBadgeOrder: Map<string, number>;
} {
  return {
    frames: snapshot.frames.map((frame) => ({
      ...cloneFrameSettings(frame),
      ...(frame.borderSettings
        ? { borderSettings: normalizeAppliedBorderSettings(frame.borderSettings) }
        : {}),
    })),
    stepBadgeOrder: new Map(snapshot.stepBadgeOrder),
  };
}
