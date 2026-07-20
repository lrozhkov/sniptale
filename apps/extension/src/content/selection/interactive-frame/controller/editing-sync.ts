import { useEffect } from 'react';
import { syncInteractiveFrameContainer } from '../editing/helpers';
import type { InteractiveFrameSyncConfig } from './types';

export function useInteractiveFrameEditingSync(params: InteractiveFrameSyncConfig) {
  const { tempFrame, effectMode, state, tempFrameRef, effectModeRef, stateRef, containerRef } =
    params;

  useEffect(() => {
    tempFrameRef.current = tempFrame;
  }, [tempFrameRef, tempFrame]);

  useEffect(() => {
    effectModeRef.current = effectMode;
  }, [effectModeRef, effectMode]);

  useEffect(() => {
    stateRef.current = state;
  }, [stateRef, state]);

  useEffect(() => {
    if (state === 'editing') {
      syncInteractiveFrameContainer(containerRef.current, tempFrame);
    }
  }, [containerRef, state, tempFrame]);
}
