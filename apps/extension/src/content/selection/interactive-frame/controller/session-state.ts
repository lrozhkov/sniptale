import { useRef } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { useInteractiveFramePointerSession } from './pointer-session';

export function useInteractiveFrameSessionState(
  tempFrame: FrameData,
  effectMode: EffectMode,
  state: FrameState
) {
  return {
    ...useInteractiveFramePointerSession(tempFrame, effectMode),
    stateRef: useRef(state),
  };
}
