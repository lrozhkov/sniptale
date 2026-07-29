import type {
  BlurSettings,
  BorderPreset,
  CalloutSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { FrameSessionSnapshot, SerializableFrameData } from './types';
import { cloneBorderPreset } from '../../../../features/highlighter/presets/catalog';

function cloneFrameSettings(frame: FrameData): SerializableFrameData {
  return {
    ...frame,
    ...(frame.blurSettings ? { blurSettings: { ...frame.blurSettings } } : {}),
    ...(frame.borderSettings
      ? {
          borderSettings: {
            ...frame.borderSettings,
            padding: { ...frame.borderSettings.padding },
          },
        }
      : {}),
    ...(frame.callout
      ? {
          callout: {
            ...frame.callout,
            ...(frame.callout.manualPlacement
              ? { manualPlacement: { ...frame.callout.manualPlacement } }
              : {}),
          },
        }
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
  sessionBorderPreset: BorderPreset;
  sessionBlurSettings: BlurSettings;
  sessionCalloutStyle: Partial<CalloutSettings> | null;
  sessionFocusSettings: FocusSettings;
  sessionStepBadgeTemplate: StepBadgeSettings | null;
  stepBadgeOrder: Map<string, number>;
}): FrameSessionSnapshot {
  return {
    frames: args.frames.map(cloneFrameSettings),
    globalEffectMode: args.globalEffectMode,
    globalStepBadgeSettings: { ...args.globalStepBadgeSettings },
    sessionBorderPreset: cloneBorderPreset(args.sessionBorderPreset),
    sessionBlurSettings: { ...args.sessionBlurSettings },
    sessionCalloutStyle: args.sessionCalloutStyle ? { ...args.sessionCalloutStyle } : null,
    sessionFocusSettings: { ...args.sessionFocusSettings },
    sessionStepBadgeTemplate: args.sessionStepBadgeTemplate
      ? {
          ...args.sessionStepBadgeTemplate,
          offsetDirections: [...(args.sessionStepBadgeTemplate.offsetDirections ?? [])],
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
    frames: snapshot.frames.map((frame) => cloneFrameSettings(frame)),
    stepBadgeOrder: new Map(snapshot.stepBadgeOrder),
  };
}
