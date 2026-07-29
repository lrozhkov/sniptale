import type { FrameMutations, WithHistoryCommit } from '../contracts';

export function createRuntimeHistoryWrappedMutations(
  mutations: FrameMutations,
  withHistoryCommit: WithHistoryCommit
) {
  return {
    ...mutations,
    addAutoBlurFrames: withHistoryCommit(mutations.addAutoBlurFrames),
    clearAutoBlurFrames: withHistoryCommit(mutations.clearAutoBlurFrames),
    pinFrameAtLastPlacement: withHistoryCommit(mutations.pinFrameAtLastPlacement),
    removeFrame: withHistoryCommit(mutations.removeFrame),
    syncAutoBlurFrames: withHistoryCommit(mutations.syncAutoBlurFrames),
    updateFrame: withHistoryCommit(mutations.updateFrame),
    updateFrameEffect: withHistoryCommit(mutations.updateFrameEffect),
  };
}
