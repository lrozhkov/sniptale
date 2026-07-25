import type {
  BorderPreset,
  FrameData,
  FreeFrameInput,
} from '../../../../features/highlighter/contracts';
import { createFrameDataFromElement } from '../manager/coords';
import { buildFrameForAdd, buildFreeFrameForAdd } from './frame-build';
import { applyAddedFrameSideEffects } from './frame-post-add';
import type { UseFrameMutationActionHelperOptions } from './types';
import { useFrameUIStore } from '../state/frame-ui.store';

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

export function createAddFreeFrameHandler(
  args: Omit<CreateAddFrameHandlerArgs, 'calculateFrameCoords'> & {
    generateFrameId: () => string;
  }
) {
  return (input: FreeFrameInput) => {
    const frameData = buildFreeFrameForAdd({
      framesRef: args.framesRef,
      globalEffectModeRef: args.globalEffectModeRef,
      globalStepBadgeAutoModeRef: args.globalStepBadgeAutoModeRef,
      sessionBlurSettingsRef: args.sessionBlurSettingsRef,
      sessionFocusSettingsRef: args.sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
      highlighterSettingsCacheRef: args.highlighterSettingsCacheRef,
      generateFrameId: args.generateFrameId,
      input,
    });
    args.setFrames((prev) => [...prev, frameData]);
    applyAddedFrameSideEffects({
      frameData,
      isAutoMode: args.globalStepBadgeAutoModeRef.current,
      linkedElementsRef: args.linkedElementsRef,
      recalculateStepBadgesRef: args.recalculateStepBadgesRef,
    });
    useFrameUIStore.getState().selectFrame(frameData.id);
    return frameData;
  };
}
