import { recordingContext } from './context';
import { hasActiveMultiSourceRecording, updateMultiSourceRecordingSettings } from './multi-source';
import { setActiveSidecarWebcamEnabled } from './sidecar';
import { setCameraSourceEnabled, switchCameraSourceInput } from './camera-source/session';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

type LiveSettingsPatch = Partial<
  Pick<
    VideoRecordingSettings,
    | 'autoGainControl'
    | 'echoCancellation'
    | 'microphoneDeviceId'
    | 'microphoneEnabled'
    | 'microphoneGain'
    | 'noiseSuppression'
    | 'webcamDeviceId'
    | 'webcamEnabled'
  >
>;

export async function updateRecordingSettings(patch: LiveSettingsPatch): Promise<void> {
  if (patch.webcamDeviceId !== undefined) {
    await switchCameraSourceInput(patch.webcamDeviceId);
  }
  if (patch.microphoneDeviceId !== undefined) {
    if (hasActiveMultiSourceRecording() || !recordingContext.audioMixer) {
      throw new Error('Live microphone device switching is unavailable for this recording');
    }
    await recordingContext.audioMixer.switchMicrophone({
      ...(patch.autoGainControl === undefined ? {} : { autoGainControl: patch.autoGainControl }),
      ...(patch.echoCancellation === undefined ? {} : { echoCancellation: patch.echoCancellation }),
      microphoneDeviceId: patch.microphoneDeviceId,
      ...(patch.microphoneGain === undefined ? {} : { microphoneGain: patch.microphoneGain }),
      ...(patch.noiseSuppression === undefined ? {} : { noiseSuppression: patch.noiseSuppression }),
    });
  }
  if (patch.webcamEnabled !== undefined) {
    setCameraSourceEnabled(patch.webcamEnabled);
  }
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
