import { useCallback } from 'react';
import { toggleMicrophone } from '../../recording/microphone-flow';
import type { PopupVideoRuntimeStateSlice } from './types/internal-state';

export function useToggleMicrophoneHandler(state: PopupVideoRuntimeStateSlice) {
  const { videoSettings, setVideoSettings, setStartError } = state.recording;
  const { refreshMicrophones } = state.actions;

  return useCallback(() => {
    void toggleMicrophone({
      videoSettings,
      setVideoSettings,
      setStartError,
      refreshMicrophones,
    });
  }, [videoSettings, setVideoSettings, setStartError, refreshMicrophones]);
}
