import { useMemo, useRef } from 'react';
import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FrameData,
  FocusSettings,
  GlobalStepBadgeSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { FrameMutations, RecalculateStepBadges } from '../contracts';

interface FrameManagerPublicResultParams {
  addAutoBlurFrames: FrameMutations['addAutoBlurFrames'];
  addFrame: FrameMutations['addFrame'];
  addFreeFrame: FrameMutations['addFreeFrame'];
  clearAutoBlurFrames: FrameMutations['clearAutoBlurFrames'];
  clearFrames: FrameMutations['clearFrames'];
  frames: FrameData[];
  getFutureFrameStyle: () => {
    blurSettings: BlurSettings;
    borderSettings: BorderPreset;
    effectMode: EffectMode;
    focusSettings: FocusSettings;
  };
  getGlobalStepBadgeSettings: () => GlobalStepBadgeSettings;
  hasFrameForElement: (element: HTMLElement) => boolean;
  recalculateStepBadges: RecalculateStepBadges;
  removeFrame: FrameMutations['removeFrame'];
  setFutureFrameEffectMode: (mode: EffectMode) => void;
  syncAutoBlurFrames: FrameMutations['syncAutoBlurFrames'];
  syncFocusOpacity: FrameMutations['syncFocusOpacity'];
  updateFrame: FrameMutations['updateFrame'];
  updateFrameEffect: FrameMutations['updateFrameEffect'];
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void;
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void;
}

export function useFrameManagerPublicResult(params: FrameManagerPublicResultParams) {
  const stableParams = useStablePublicResultParams(params);
  return useMemo(() => buildFrameManagerResult(stableParams), [stableParams]);
}

function useStablePublicResultParams(params: FrameManagerPublicResultParams) {
  const paramsRef = useRef(params);

  if (!arePublicResultParamsEqual(paramsRef.current, params)) {
    paramsRef.current = params;
  }

  return paramsRef.current;
}

function arePublicResultParamsEqual(
  prev: FrameManagerPublicResultParams,
  next: FrameManagerPublicResultParams
) {
  return (
    prev.addAutoBlurFrames === next.addAutoBlurFrames &&
    prev.addFrame === next.addFrame &&
    prev.addFreeFrame === next.addFreeFrame &&
    prev.clearAutoBlurFrames === next.clearAutoBlurFrames &&
    prev.clearFrames === next.clearFrames &&
    prev.frames === next.frames &&
    prev.getFutureFrameStyle === next.getFutureFrameStyle &&
    prev.getGlobalStepBadgeSettings === next.getGlobalStepBadgeSettings &&
    prev.hasFrameForElement === next.hasFrameForElement &&
    prev.recalculateStepBadges === next.recalculateStepBadges &&
    prev.removeFrame === next.removeFrame &&
    prev.setFutureFrameEffectMode === next.setFutureFrameEffectMode &&
    prev.syncFocusOpacity === next.syncFocusOpacity &&
    prev.syncAutoBlurFrames === next.syncAutoBlurFrames &&
    prev.updateFrame === next.updateFrame &&
    prev.updateFrameEffect === next.updateFrameEffect &&
    prev.updateFrameStepBadge === next.updateFrameStepBadge &&
    prev.updateGlobalStepBadgeSettings === next.updateGlobalStepBadgeSettings
  );
}

function buildFrameManagerResult(params: FrameManagerPublicResultParams) {
  return {
    frames: params.frames,
    getFutureFrameStyle: params.getFutureFrameStyle,
    addAutoBlurFrames: params.addAutoBlurFrames,
    addFrame: params.addFrame,
    addFreeFrame: params.addFreeFrame,
    clearAutoBlurFrames: params.clearAutoBlurFrames,
    removeFrame: params.removeFrame,
    setFutureFrameEffectMode: params.setFutureFrameEffectMode,
    clearFrames: params.clearFrames,
    syncAutoBlurFrames: params.syncAutoBlurFrames,
    updateFrame: params.updateFrame,
    updateFrameEffect: params.updateFrameEffect,
    syncFocusOpacity: params.syncFocusOpacity,
    hasFrameForElement: params.hasFrameForElement,
    updateFrameStepBadge: params.updateFrameStepBadge,
    updateGlobalStepBadgeSettings: params.updateGlobalStepBadgeSettings,
    recalculateStepBadges: params.recalculateStepBadges,
    getGlobalStepBadgeSettings: params.getGlobalStepBadgeSettings,
  };
}
