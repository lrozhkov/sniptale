import type { FrameManagerPublicResultParams } from './public-result.types';

export function buildFrameManagerResult(params: FrameManagerPublicResultParams) {
  return {
    frames: params.frames,
    addAutoBlurFrames: params.addAutoBlurFrames,
    addFrame: params.addFrame,
    clearAutoBlurFrames: params.clearAutoBlurFrames,
    removeFrame: params.removeFrame,
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
