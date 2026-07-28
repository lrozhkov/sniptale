import { AudioMixer } from '../stream/audio-mixer';
import { recordingContext } from '../context';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildMicrophoneAudioConstraints,
  resolveMicrophoneGain,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

async function attachDirectMicrophoneTrack(
  settings: Pick<
    VideoRecordingSettings,
    | 'autoGainControl'
    | 'echoCancellation'
    | 'microphoneDeviceId'
    | 'microphoneGain'
    | 'noiseSuppression'
  >
): Promise<void> {
  const videoTracks = recordingContext.videoStream?.getVideoTracks();
  if (!videoTracks?.length) return;
  if (resolveMicrophoneGain(settings) !== 1) {
    recordingContext.audioMixer = new AudioMixer();
    await recordingContext.audioMixer.initialize();
    await recordingContext.audioMixer.addMicrophone(settings);
    recordingContext.videoStream = new MediaStream([
      ...videoTracks,
      ...recordingContext.audioMixer.getMixedStream().getAudioTracks(),
    ]);
    return;
  }
  const microphoneStream = await navigator.mediaDevices.getUserMedia({
    audio: buildMicrophoneAudioConstraints(settings),
  });
  recordingContext.videoStream = new MediaStream([
    ...videoTracks,
    ...microphoneStream.getAudioTracks(),
  ]);
}

export async function attachMicrophoneAudioIfEnabled(settings: VideoRecordingSettings) {
  if (!settings.microphoneEnabled) return;
  if (!settings.systemAudioEnabled) {
    try {
      await attachDirectMicrophoneTrack(settings);
    } catch (error) {
      logger.warn('Failed to attach direct microphone track', error);
    }
    return;
  }
  recordingContext.audioMixer = new AudioMixer();
  await recordingContext.audioMixer.initialize();
  if (recordingContext.sourceStream) {
    await recordingContext.audioMixer
      .addTabAudio(recordingContext.sourceStream)
      .catch((error) => logger.warn('Failed to add source audio', error));
  }
  await recordingContext.audioMixer
    .addMicrophone(settings)
    .catch((error) => logger.warn('Failed to add microphone', error));
  const videoTracks = recordingContext.videoStream?.getVideoTracks();
  if (!videoTracks?.length) return;
  recordingContext.videoStream = new MediaStream([
    ...videoTracks,
    ...recordingContext.audioMixer.getMixedStream().getAudioTracks(),
  ]);
}
