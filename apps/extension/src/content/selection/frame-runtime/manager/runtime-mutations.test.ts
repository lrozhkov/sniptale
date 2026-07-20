import { describe, expect, it, vi } from 'vitest';
import { createRuntimeHistoryWrappedMutations } from './runtime-mutations';
import type { FrameMutations, WithHistoryCommit } from './types';

function createMutations(): FrameMutations {
  return {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
  } as FrameMutations;
}

describe('frame-manager-runtime-mutations', () => {
  it('routes interactive-frame mutations through history-aware wrappers', () => {
    const mutations = createMutations();
    const withHistoryCommitSpy = vi.fn(
      ((action: (...args: never[]) => unknown) => action) as WithHistoryCommit
    );
    const withHistoryCommit = withHistoryCommitSpy as unknown as WithHistoryCommit;

    const runtimeMutations = createRuntimeHistoryWrappedMutations(mutations, withHistoryCommit);

    expect(withHistoryCommitSpy).toHaveBeenCalledTimes(6);
    expect(runtimeMutations.updateFrame).toBe(mutations.updateFrame);
    expect(runtimeMutations.updateFrameEffect).toBe(mutations.updateFrameEffect);
    expect(runtimeMutations.removeFrame).toBe(mutations.removeFrame);
    expect(runtimeMutations.addAutoBlurFrames).toBe(mutations.addAutoBlurFrames);
    expect(runtimeMutations.clearAutoBlurFrames).toBe(mutations.clearAutoBlurFrames);
    expect(runtimeMutations.syncAutoBlurFrames).toBe(mutations.syncAutoBlurFrames);
    expect(runtimeMutations.addFrame).toBe(mutations.addFrame);
    expect(runtimeMutations.clearFrames).toBe(mutations.clearFrames);
  });
});
