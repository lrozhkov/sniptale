import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  FreeFrameInput,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import type { UseFrameMutationActionHelperOptions } from './types';
import { getFrameSessionBorderPreset } from '../session/border-preset';
import { getFutureFrameCallout } from '../session/future-callout';
import { cloneStepBadgeSettings } from '../session/step-badge-defaults';

type BuildFrameForAddArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'globalEffectModeRef'
  | 'globalStepBadgeAutoModeRef'
  | 'sessionBlurSettingsRef'
  | 'sessionFocusSettingsRef'
  | 'sessionStepBadgeTemplateRef'
> & {
  calculateFrameCoords: (element: HTMLElement, borderSettings?: AppliedBorderSettings) => FrameData;
  element: HTMLElement;
};

export function buildFrameForAdd(args: BuildFrameForAddArgs) {
  const settings = resolveFrameBuildSettings(args);

  const baseFrameData = args.calculateFrameCoords(args.element, settings.borderSettings);
  const selector = createCompositeSelector(args.element);
  return applyFrameBuildSettings(baseFrameData, settings, {
    linkedElementSelector: selector.iframeSelector
      ? `${selector.iframeSelector} => ${selector.elementSelector}`
      : selector.elementSelector,
  });
}

export function buildFreeFrameForAdd(
  args: Omit<BuildFrameForAddArgs, 'calculateFrameCoords' | 'element'> & {
    generateFrameId: () => string;
    input: FreeFrameInput;
  }
) {
  const settings = resolveFrameBuildSettings(args);
  return applyFrameBuildSettings(
    {
      id: args.generateFrameId(),
      x: args.input.x,
      y: args.input.y,
      width: args.input.width,
      height: args.input.height,
      pagePlacement: {
        ...args.input.pagePlacement,
        iframePath: [...args.input.pagePlacement.iframePath],
      },
    },
    settings
  );
}

function resolveFrameBuildSettings(
  args: Pick<
    BuildFrameForAddArgs,
    | 'globalEffectModeRef'
    | 'globalStepBadgeAutoModeRef'
    | 'sessionBlurSettingsRef'
    | 'sessionFocusSettingsRef'
    | 'sessionStepBadgeTemplateRef'
  >
) {
  return {
    borderSettings: getFrameSessionBorderPreset(),
    blurSettings: { ...args.sessionBlurSettingsRef.current },
    focusSettings: { ...args.sessionFocusSettingsRef.current },
    effectMode: args.globalEffectModeRef.current,
    template: args.sessionStepBadgeTemplateRef.current,
    isAutoMode: args.globalStepBadgeAutoModeRef.current,
    callout: getFutureFrameCallout(),
  };
}

function applyFrameBuildSettings(
  baseFrameData: FrameData,
  params: {
    borderSettings: AppliedBorderSettings;
    blurSettings: BlurSettings;
    focusSettings: FocusSettings;
    effectMode: EffectMode;
    template: StepBadgeSettings | null;
    isAutoMode: boolean;
    callout: import('@sniptale/runtime-contracts/highlighter/callout').CalloutSettings | null;
  },
  linked?: { linkedElementSelector: string }
) {
  const stepBadge = buildStepBadgeSettings(params.template, params.isAutoMode);

  return {
    ...baseFrameData,
    effectMode: params.effectMode,
    borderSettings: params.borderSettings,
    blurSettings: params.blurSettings,
    focusSettings: params.focusSettings,
    ...(linked ?? {}),
    ...(stepBadge === undefined ? {} : { stepBadge }),
    ...(params.callout === null ? {} : { callout: structuredClone(params.callout) }),
  } satisfies FrameData;
}

function buildStepBadgeSettings(template: StepBadgeSettings | null, isAutoMode: boolean) {
  if (!template) {
    return undefined;
  }

  if (template.auto === false) {
    return cloneStepBadgeSettings(template);
  }

  return {
    ...cloneStepBadgeSettings(template),
    value: isAutoMode ? '' : template.value,
  };
}
