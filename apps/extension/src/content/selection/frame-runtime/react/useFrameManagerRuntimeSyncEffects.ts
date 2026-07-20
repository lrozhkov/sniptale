import type { FrameData } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import type {
  FrameManagerRefs,
  FrameMutations,
  FrameSetter,
  FrameStateSetter,
  WithHistoryCommit,
} from '../manager/types';
import { useFrameContainer } from './useFrameManagerRefs';
import { createRuntimeHistoryWrappedMutations } from '../manager/runtime-mutations';
import {
  useFrameManagerRuntimeSync,
  type FrameManagerRuntimeSyncParams,
} from './useFrameManagerRuntimeSync';

export function useFrameManagerRuntimeSyncEffects(params: {
  frames: FrameData[];
  InteractiveFrameComponent: InteractiveFrameComponent;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
  refs: FrameManagerRefs;
  mutations: FrameMutations;
  withHistoryCommit: WithHistoryCommit;
}) {
  const {
    frames,
    InteractiveFrameComponent,
    setFrames,
    setFrameStates,
    refs,
    mutations,
    withHistoryCommit,
  } = params;
  const runtimeMutations = createRuntimeHistoryWrappedMutations(mutations, withHistoryCommit);
  const getOrCreateContainer = useFrameContainer(refs.containerRef);

  useFrameManagerRuntimeSync(
    createFrameManagerRuntimeSyncParams({
      frames,
      getOrCreateContainer,
      InteractiveFrameComponent,
      refs,
      runtimeMutations,
      setFrames,
      setFrameStates,
    })
  );
}

function createFrameManagerRuntimeSyncParams(args: {
  frames: FrameData[];
  getOrCreateContainer: () => HTMLDivElement;
  InteractiveFrameComponent: InteractiveFrameComponent;
  refs: FrameManagerRefs;
  runtimeMutations: FrameMutations;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
}): FrameManagerRuntimeSyncParams {
  return {
    state: {
      frames: args.frames,
      setFrames: args.setFrames,
      setFrameStates: args.setFrameStates,
    },
    refs: {
      containerRef: args.refs.containerRef,
      framesRef: args.refs.framesRef,
      frameStatesRef: args.refs.frameStatesRef,
      globalEffectModeRef: args.refs.globalEffectModeRef,
      isClearingRef: args.refs.isClearingRef,
      linkedElementsRef: args.refs.linkedElementsRef,
      rootsRef: args.refs.rootsRef,
    },
    effects: {
      getOrCreateContainer: args.getOrCreateContainer,
      InteractiveFrameComponent: args.InteractiveFrameComponent,
      mutations: args.runtimeMutations,
    },
  };
}
