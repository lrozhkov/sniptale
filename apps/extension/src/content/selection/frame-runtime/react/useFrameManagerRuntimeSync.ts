import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import type { useFrameManagerRefs } from './useFrameManagerRefs';
import type { useFrameMutationActions } from '../mutation-actions';
import { useFrameEffectOverlays } from './useFrameEffectOverlays';
import { useFrameRootsRenderer } from './useFrameRootsRenderer';
import { useFrameScrollSync } from './useFrameScrollSync';

interface FrameManagerRuntimeSyncState {
  frames: FrameData[];
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  setFrameStates: Dispatch<SetStateAction<Map<string, FrameState>>>;
}

interface FrameManagerRuntimeSyncRefs {
  containerRef: ReturnType<typeof useFrameManagerRefs>['containerRef'];
  framesRef: ReturnType<typeof useFrameManagerRefs>['framesRef'];
  frameStatesRef: ReturnType<typeof useFrameManagerRefs>['frameStatesRef'];
  globalEffectModeRef: ReturnType<typeof useFrameManagerRefs>['globalEffectModeRef'];
  isClearingRef: ReturnType<typeof useFrameManagerRefs>['isClearingRef'];
  linkedElementsRef: ReturnType<typeof useFrameManagerRefs>['linkedElementsRef'];
  rootsRef: ReturnType<typeof useFrameManagerRefs>['rootsRef'];
}

interface FrameManagerRuntimeSyncEffects {
  getOrCreateContainer: () => HTMLDivElement;
  InteractiveFrameComponent: InteractiveFrameComponent;
  mutations: ReturnType<typeof useFrameMutationActions>;
}

/**
 * Runtime sync contract split by state authority, mutable refs, and effect adapters.
 */
export interface FrameManagerRuntimeSyncParams {
  state: FrameManagerRuntimeSyncState;
  refs: FrameManagerRuntimeSyncRefs;
  effects: FrameManagerRuntimeSyncEffects;
}

/**
 * Wires frame scroll/effect/root sync side effects.
 */
export function useFrameManagerRuntimeSync(params: FrameManagerRuntimeSyncParams) {
  const updateFrameState = useFrameStateUpdater(params.state.setFrameStates);

  useFrameScrollSync({
    framesRef: params.refs.framesRef,
    frameStatesRef: params.refs.frameStatesRef,
    linkedElementsRef: params.refs.linkedElementsRef,
    setFrames: params.state.setFrames,
  });
  useFrameEffectOverlays({ frames: params.state.frames, framesRef: params.refs.framesRef });
  useFrameRootsRenderer({
    containerRef: params.refs.containerRef,
    frames: params.state.frames,
    framesRef: params.refs.framesRef,
    frameStatesRef: params.refs.frameStatesRef,
    InteractiveFrameComponent: params.effects.InteractiveFrameComponent,
    rootsRef: params.refs.rootsRef,
    isClearingRef: params.refs.isClearingRef,
    getOrCreateContainer: params.effects.getOrCreateContainer,
    globalEffectModeRef: params.refs.globalEffectModeRef,
    updateFrameState,
    updateFrame: params.effects.mutations.updateFrame,
    removeFrame: params.effects.mutations.removeFrame,
    updateFrameEffect: params.effects.mutations.updateFrameEffect,
  });
}

function useFrameStateUpdater(setFrameStates: Dispatch<SetStateAction<Map<string, FrameState>>>) {
  return useCallback(
    (frameId: string, newState: FrameState) => {
      setFrameStates((prev) => {
        const next = new Map(prev);
        next.set(frameId, newState);
        return next;
      });
    },
    [setFrameStates]
  );
}
