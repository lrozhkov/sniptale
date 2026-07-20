import { AudioMixer } from '../stream/audio-mixer';
import { normalizeRecordingStreamDimensions } from '../stream';
import { recordingContext } from '../context';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  buildMicrophoneAudioConstraints,
  resolveMicrophoneGain,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import { createDerivedRecordingStream, resolveViewportSizeInPixels } from './video-derived';
import type { RecordingViewport } from './video.types';
export type { RecordingViewport } from './video.types';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });
type RecordingVideoStreamParams = {
  fullStream: MediaStream;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  targetResolution?: { width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
  viewport?: RecordingViewport;
};

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
  if (!videoTracks || videoTracks.length === 0) {
    return;
  }

  if (resolveMicrophoneGain(settings) !== 1) {
    await attachMixedMicrophoneTrack(settings, videoTracks);
    return;
  }

  const microphoneStream = await navigator.mediaDevices.getUserMedia({
    audio: buildMicrophoneAudioConstraints(settings),
  });
  const microphoneTracks = microphoneStream.getAudioTracks();
  if (microphoneTracks.length === 0) {
    logger.warn('Direct microphone stream returned no audio tracks');
    return;
  }

  recordingContext.videoStream = new MediaStream([...videoTracks, ...microphoneTracks]);
  logger.debug('Direct microphone attached to recording stream', {
    audioTrackCount: microphoneTracks.length,
  });
}

async function attachMixedMicrophoneTrack(
  settings: Pick<
    VideoRecordingSettings,
    | 'autoGainControl'
    | 'echoCancellation'
    | 'microphoneDeviceId'
    | 'microphoneGain'
    | 'noiseSuppression'
  >,
  videoTracks: MediaStreamTrack[]
): Promise<void> {
  recordingContext.audioMixer = new AudioMixer();
  await recordingContext.audioMixer.initialize();
  await recordingContext.audioMixer.addMicrophone(settings);
  recordingContext.videoStream = new MediaStream([
    ...videoTracks,
    ...recordingContext.audioMixer.getMixedStream().getAudioTracks(),
  ]);
}

export async function createRecordingVideoStream(params: RecordingVideoStreamParams) {
  return createRecordingVideoStreamForMode(params);
}

async function createRecordingVideoStreamForMode(params: RecordingVideoStreamParams) {
  const {
    fullStream,
    settings,
    captureMode,
    cropRegion,
    targetResolution,
    emulatedViewportCssSize,
    viewport,
  } = params;
  const viewportSizeInPixels = resolveViewportSizeInPixels(viewport);
  const derivedStream = createDerivedRecordingStream({
    fullStream,
    quality: settings.quality,
    ...(captureMode === undefined ? {} : { captureMode }),
    ...(cropRegion === undefined ? {} : { cropRegion }),
    ...(emulatedViewportCssSize === undefined ? {} : { emulatedViewportCssSize }),
    ...(targetResolution === undefined ? {} : { targetResolution }),
    ...(viewportSizeInPixels === undefined ? {} : { viewportSizeInPixels }),
  });
  if (derivedStream) {
    return derivedStream;
  }

  if (captureMode === CaptureMode.TAB || captureMode === undefined) {
    return normalizeRecordingStreamDimensions(fullStream, settings.quality);
  }

  return fullStream;
}

export async function attachMicrophoneAudioIfEnabled(settings: VideoRecordingSettings) {
  if (!settings.microphoneEnabled) {
    return;
  }

  if (!settings.systemAudioEnabled) {
    try {
      await attachDirectMicrophoneTrack(settings);
    } catch (error) {
      logger.warn('Failed to attach direct microphone track', error);
    }
    return;
  }

  logger.debug('Setting up audio mixer');
  recordingContext.audioMixer = new AudioMixer();
  await recordingContext.audioMixer.initialize();
  if (settings.systemAudioEnabled && recordingContext.sourceStream) {
    try {
      await recordingContext.audioMixer.addTabAudio(recordingContext.sourceStream);
    } catch (error) {
      logger.warn('Failed to add tab audio to mixer', error);
    }
  }

  try {
    await recordingContext.audioMixer.addMicrophone(settings);
  } catch (error) {
    logger.warn('Failed to add microphone', error);
  }

  const mixedAudioStream = recordingContext.audioMixer.getMixedStream();
  const videoTracks = recordingContext.videoStream?.getVideoTracks();
  if (!videoTracks || videoTracks.length === 0) {
    return;
  }

  recordingContext.videoStream = new MediaStream([
    ...videoTracks,
    ...mixedAudioStream.getAudioTracks(),
  ]);
  logger.debug('Audio mixer attached to recording stream', {
    audioTrackCount: mixedAudioStream.getAudioTracks().length,
  });
}
