import { useCallback } from 'react';
import { toggleWebcam } from '../../recording/webcam-flow';
import type { PopupRuntimeStateSlice } from './state';

export function useToggleWebcamHandler(state: PopupRuntimeStateSlice) {
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
