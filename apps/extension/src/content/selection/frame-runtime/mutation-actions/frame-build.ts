import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
  FrameData,
  FreeFrameInput,
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
    | 'framesRef'
    | 'globalEffectModeRef'
    | 'globalStepBadgeAutoModeRef'
    | 'highlighterSettingsCacheRef'
    | 'sessionBlurSettingsRef'
    | 'sessionFocusSettingsRef'
    | 'sessionStepBadgeTemplateRef'
  >
) {
  const sessionDefaults = resolveSessionFrameDefaults({
    existingFrames: args.framesRef.current,
    fallbackEffectMode: args.globalEffectModeRef.current,
    fallbackBlurSettings: args.sessionBlurSettingsRef.current,
    fallbackFocusSettings: args.sessionFocusSettingsRef.current,
  });

  return {
    borderSettings: resolveDefaultBorderPreset(
      args.highlighterSettingsCacheRef.current,
      DEFAULT_BORDER_PRESET
    ),
    blurSettings: sessionDefaults.blurSettings,
    focusSettings: sessionDefaults.focusSettings,
    effectMode: sessionDefaults.effectMode,
    template: args.sessionStepBadgeTemplateRef.current,
    isAutoMode: args.globalStepBadgeAutoModeRef.current,
  };
}

function applyFrameBuildSettings(
  baseFrameData: FrameData,
  params: {
    borderSettings: BorderPreset;
    blurSettings: BlurSettings;
    focusSettings: FocusSettings;
    effectMode: EffectMode;
    template: StepBadgeSettings | null;
    isAutoMode: boolean;
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
