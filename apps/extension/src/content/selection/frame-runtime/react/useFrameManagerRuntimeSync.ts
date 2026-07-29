import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import type { useFrameManagerRefs } from './useFrameManagerRefs';
import type { FrameMutations } from '../contracts';
import { useFrameEffectOverlays } from './useFrameEffectOverlays';
import { useFrameRootsRenderer } from './useFrameRootsRenderer';
import { useFrameHostLayoutSync } from './useFrameHostLayoutSync';
import { useAnchorRecoveryNotice } from './anchor-recovery-notice';

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
  hostLayoutServiceRef: ReturnType<typeof useFrameManagerRefs>['hostLayoutServiceRef'];
  rootsRef: ReturnType<typeof useFrameManagerRefs>['rootsRef'];
}

interface FrameManagerRuntimeSyncEffects {
  getOrCreateContainer: () => HTMLDivElement;
  InteractiveFrameComponent: InteractiveFrameComponent;
  mutations: FrameMutations;
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
  const updateFrameState = useFrameStateUpdater(
    params.state.setFrameStates,
    params.refs.frameStatesRef
  );

  const hostLayoutSnapshot = useFrameHostLayoutSync({
    framesRef: params.refs.framesRef,
    frameStatesRef: params.refs.frameStatesRef,
    hostLayoutService: params.refs.hostLayoutServiceRef.current,
    setFrames: params.state.setFrames,
    setFrameStates: params.state.setFrameStates,
  });
  useAnchorRecoveryNotice({ mutations: params.effects.mutations, snapshot: hostLayoutSnapshot });
  useFrameEffectOverlays({
    frames: params.state.frames,
    framesRef: params.refs.framesRef,
    hostLayoutSnapshot,
  });
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
    hostLayoutSnapshot,
  });
}

function useFrameStateUpdater(
  setFrameStates: Dispatch<SetStateAction<Map<string, FrameState>>>,
  frameStatesRef: MutableRefObject<Map<string, FrameState>>
) {
  return useCallback(
    (frameId: string, newState: FrameState) => {
      const next = new Map(frameStatesRef.current);
      next.set(frameId, newState);
      frameStatesRef.current = next;
      setFrameStates(next);
    },
    [frameStatesRef, setFrameStates]
  );
}
