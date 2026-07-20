import type { BorderPreset, FrameData } from '../../../../features/highlighter/contracts';
import { createFrameDataFromElement } from '../manager/coords';
import { buildFrameForAdd } from './frame-build';
import { applyAddedFrameSideEffects } from './frame-post-add';
import type { UseFrameMutationActionHelperOptions } from './types';

type CreateAddFrameHandlerArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'setFrames'
  | 'framesRef'
  | 'linkedElementsRef'
  | 'globalEffectModeRef'
  | 'globalStepBadgeAutoModeRef'
  | 'sessionBlurSettingsRef'
  | 'sessionFocusSettingsRef'
  | 'sessionStepBadgeTemplateRef'
  | 'highlighterSettingsCacheRef'
  | 'recalculateStepBadgesRef'
> & {
  calculateFrameCoords: (element: HTMLElement, borderSettings?: BorderPreset) => FrameData;
};

export function createGenerateFrameId() {
  return () => `sniptale-frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createCalculateFrameCoords(generateFrameId: () => string) {
  return (element: HTMLElement, borderSettings?: BorderPreset): FrameData =>
    createFrameDataFromElement(generateFrameId(), element, borderSettings);
}

export function createAddFrameHandler({
  setFrames,
  framesRef,
  linkedElementsRef,
  globalEffectModeRef,
  globalStepBadgeAutoModeRef,
  sessionBlurSettingsRef,
  sessionFocusSettingsRef,
  sessionStepBadgeTemplateRef,
  highlighterSettingsCacheRef,
  recalculateStepBadgesRef,
  calculateFrameCoords,
}: CreateAddFrameHandlerArgs) {
  return (element: HTMLElement) => {
    const frameData = buildFrameForAdd({
      calculateFrameCoords,
      element,
      framesRef,
      globalEffectModeRef,
      globalStepBadgeAutoModeRef,
      highlighterSettingsCacheRef,
      sessionBlurSettingsRef,
      sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef,
    });

    setFrames((prev) => [...prev, frameData]);
    applyAddedFrameSideEffects({
      element,
      frameData,
      isAutoMode: globalStepBadgeAutoModeRef.current,
      linkedElementsRef,
      recalculateStepBadgesRef,
    });
    return frameData;
  };
}
