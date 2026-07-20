import type { FrameMutations, WithHistoryCommit } from './types';

export function createRuntimeHistoryWrappedMutations(
  mutations: FrameMutations,
  withHistoryCommit: WithHistoryCommit
) {
  return {
    ...mutations,
    addAutoBlurFrames: withHistoryCommit(mutations.addAutoBlurFrames),
    clearAutoBlurFrames: withHistoryCommit(mutations.clearAutoBlurFrames),
    removeFrame: withHistoryCommit(mutations.removeFrame),
    syncAutoBlurFrames: withHistoryCommit(mutations.syncAutoBlurFrames),
    updateFrame: withHistoryCommit(mutations.updateFrame),
    updateFrameEffect: withHistoryCommit(mutations.updateFrameEffect),
  };
}
