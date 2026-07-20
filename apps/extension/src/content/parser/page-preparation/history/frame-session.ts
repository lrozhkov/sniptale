import { findElementBySelector } from '../../../platform/frame';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import type {
  BlurSettings,
  CalloutSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { FrameSessionSnapshot, SerializableFrameData } from './types';

function cloneFrameSettings(frame: FrameData): SerializableFrameData {
  const { linkedElement, ...rest } = frame;
  const linkedElementSelector =
    frame.linkedElementSelector ??
    (linkedElement?.isConnected
      ? (() => {
          const selector = createCompositeSelector(linkedElement);
          return selector.iframeSelector
            ? `${selector.iframeSelector} => ${selector.elementSelector}`
            : selector.elementSelector;
        })()
      : undefined);

  return {
    ...rest,
    ...(frame.blurSettings ? { blurSettings: { ...frame.blurSettings } } : {}),
    ...(frame.borderSettings
      ? {
          borderSettings: {
            ...frame.borderSettings,
            padding: { ...frame.borderSettings.padding },
          },
        }
      : {}),
    ...(frame.callout ? { callout: { ...frame.callout } } : {}),
    ...(frame.focusSettings ? { focusSettings: { ...frame.focusSettings } } : {}),
    ...(linkedElementSelector === undefined ? {} : { linkedElementSelector }),
    ...(frame.offset ? { offset: { ...frame.offset } } : {}),
    ...(frame.stepBadge
      ? {
          stepBadge: {
            ...frame.stepBadge,
            offsetDirections: [...(frame.stepBadge.offsetDirections ?? [])],
          },
        }
      : {}),
  };
}

export function captureFrameSessionSnapshot(args: {
  frames: FrameData[];
  globalEffectMode: EffectMode;
  globalStepBadgeSettings: GlobalStepBadgeSettings;
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
    sessionBlurSettings: { ...args.sessionBlurSettings },
    sessionCalloutStyle: args.sessionCalloutStyle ? { ...args.sessionCalloutStyle } : null,
    sessionFocusSettings: { ...args.sessionFocusSettings },
    sessionStepBadgeTemplate: args.sessionStepBadgeTemplate
      ? {
          ...args.sessionStepBadgeTemplate,
          offsetDirections: [...(args.sessionStepBadgeTemplate.offsetDirections ?? [])],
        }
      : null,
    stepBadgeOrder: Array.from(args.stepBadgeOrder.entries()),
  };
}

export function hydrateFrameSessionSnapshot(snapshot: FrameSessionSnapshot): {
  frames: FrameData[];
  linkedElements: Map<string, HTMLElement>;
  stepBadgeOrder: Map<string, number>;
} {
  const linkedElements = new Map<string, HTMLElement>();
  const frames = snapshot.frames.map((frame) => {
    const linkedElement = frame.linkedElementSelector
      ? findElementBySelector(frame.linkedElementSelector)
      : null;

    if (linkedElement) {
      linkedElements.set(frame.id, linkedElement);
    }

    return {
      ...frame,
      ...(linkedElement === null ? {} : { linkedElement }),
    };
  });

  return {
    frames,
    linkedElements,
    stepBadgeOrder: new Map(snapshot.stepBadgeOrder),
  };
}
