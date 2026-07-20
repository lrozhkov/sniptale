import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
  FrameData,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import { resolveDefaultBorderPreset } from '../../../../features/editor/document/public';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import { DEFAULT_BORDER_PRESET } from '../../../../composition/persistence/highlighter';
import { resolveSessionFrameDefaults } from './session-defaults.helpers';
import type { UseFrameMutationActionHelperOptions } from './types';

type BuildFrameForAddArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'framesRef'
  | 'globalEffectModeRef'
  | 'globalStepBadgeAutoModeRef'
  | 'sessionBlurSettingsRef'
  | 'sessionFocusSettingsRef'
  | 'sessionStepBadgeTemplateRef'
  | 'highlighterSettingsCacheRef'
> & {
  calculateFrameCoords: (element: HTMLElement, borderSettings?: BorderPreset) => FrameData;
  element: HTMLElement;
};

export function buildFrameForAdd(args: BuildFrameForAddArgs) {
  const sessionDefaults = resolveSessionFrameDefaults({
    existingFrames: args.framesRef.current,
    fallbackEffectMode: args.globalEffectModeRef.current,
    fallbackBlurSettings: args.sessionBlurSettingsRef.current,
    fallbackFocusSettings: args.sessionFocusSettingsRef.current,
  });

  return createFrameWithSessionSettings(args.element, {
    borderSettings: resolveDefaultBorderPreset(
      args.highlighterSettingsCacheRef.current,
      DEFAULT_BORDER_PRESET
    ),
    blurSettings: sessionDefaults.blurSettings,
    focusSettings: sessionDefaults.focusSettings,
    effectMode: sessionDefaults.effectMode,
    template: args.sessionStepBadgeTemplateRef.current,
    isAutoMode: args.globalStepBadgeAutoModeRef.current,
    calculateFrameCoords: args.calculateFrameCoords,
  });
}

function createFrameWithSessionSettings(
  element: HTMLElement,
  params: {
    borderSettings: BorderPreset;
    blurSettings: BlurSettings;
    focusSettings: FocusSettings;
    effectMode: EffectMode;
    template: StepBadgeSettings | null;
    isAutoMode: boolean;
    calculateFrameCoords: (element: HTMLElement, borderSettings?: BorderPreset) => FrameData;
  }
) {
  const baseFrameData = params.calculateFrameCoords(element, params.borderSettings);
  const selector = createCompositeSelector(element);
  const stepBadge = buildStepBadgeSettings(params.template, params.isAutoMode);

  return {
    ...baseFrameData,
    effectMode: params.effectMode,
    borderSettings: params.borderSettings,
    blurSettings: params.blurSettings,
    focusSettings: params.focusSettings,
    linkedElementSelector: selector.iframeSelector
      ? `${selector.iframeSelector} => ${selector.elementSelector}`
      : selector.elementSelector,
    ...(stepBadge === undefined ? {} : { stepBadge }),
  } satisfies FrameData;
}

function buildStepBadgeSettings(template: StepBadgeSettings | null, isAutoMode: boolean) {
  if (!template) {
    return undefined;
  }

  if (template.auto === false) {
    return { ...template };
  }

  return {
    ...template,
    value: isAutoMode ? '' : template.value,
  };
}
