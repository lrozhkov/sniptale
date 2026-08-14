import { useCallback } from 'react';
import { toggleWebcam } from '../../recording/webcam-flow';
import type { PopupVideoRuntimeStateSlice } from './types/internal-state';

export function useToggleWebcamHandler(state: PopupVideoRuntimeStateSlice) {
  const { videoSettings, setVideoSettings, setStartError } = state.recording;
  const { refreshWebcams } = state.actions;

  return useCallback(() => {
    void toggleWebcam({
      videoSettings,
      setVideoSettings,
      setStartError,
      refreshWebcams,
    });
  }, [videoSettings, setVideoSettings, setStartError, refreshWebcams]);
}
