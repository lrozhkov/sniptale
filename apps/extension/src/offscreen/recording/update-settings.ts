import { recordingContext } from './context';
import { hasActiveMultiSourceRecording, updateMultiSourceRecordingSettings } from './multi-source';
import { setActiveSidecarWebcamEnabled } from './sidecar';

export function updateRecordingSettings(patch: {
  microphoneEnabled?: boolean;
  webcamEnabled?: boolean;
}): void {
  if (hasActiveMultiSourceRecording()) {
    updateMultiSourceRecordingSettings(patch);
    return;
  }

  if (patch.microphoneEnabled !== undefined) {
    setSingleSourceMicrophoneEnabled(patch.microphoneEnabled);
  }
  if (patch.webcamEnabled !== undefined) {
    setActiveSidecarWebcamEnabled(patch.webcamEnabled);
  }
}

function setSingleSourceMicrophoneEnabled(enabled: boolean): void {
  if (recordingContext.audioMixer) {
    recordingContext.audioMixer.setMicrophoneEnabled(enabled);
    return;
  }

  recordingContext.videoStream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}
