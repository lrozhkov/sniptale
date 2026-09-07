import { usePlaybackSpaceShortcut } from '../../runtime/session/playback/shortcuts';
import { useAudioRecordingSession } from './session';
export type { AudioRecordingControllerState } from './session-types';

export function useAudioRecordingController(isOpen: boolean, playbackDisabled = false) {
  const controller = useAudioRecordingSession(isOpen);
  usePlaybackSpaceShortcut(() => {
    if (playbackDisabled || !controller.trim) return;
    if (controller.trim.audioRef.current?.paused === false) controller.trim.pauseSelection();
    else void controller.trim.playSelection();
  }, isOpen);
  return controller;
}
