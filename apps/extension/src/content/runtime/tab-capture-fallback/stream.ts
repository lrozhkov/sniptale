import type { CaptureProgress, ResolvedTabCaptureStream, TabCaptureSettings } from './types';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createMixedCaptureStream,
  createRecorderHandlers,
  resolveRecorderOptions,
} from './helpers';

const logger = createLogger({ namespace: 'ContentTabCaptureFallbackStream' });

type ChromeTabCaptureTrackConstraints = MediaTrackConstraints & {
  mandatory: {
    chromeMediaSource: 'tab';
    chromeMediaSourceId: string;
  };
};

/**
 * Создаёт MediaStream из streamId.
 * Использует getUserMedia с chromeMediaSource constraint.
 */
async function createMediaStreamFromId(streamId: string): Promise<MediaStream> {
  logger.log('Creating MediaStream from streamId', streamId);

  const constraints: MediaStreamConstraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as ChromeTabCaptureTrackConstraints,
    audio: true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  logger.log('MediaStream created from streamId');
  return stream;
}

export async function resolveFinalCaptureStream(
  settings: TabCaptureSettings
): Promise<ResolvedTabCaptureStream> {
  const streamId = settings.streamId;
  logger.log('Stream ID obtained', streamId);

  const captureStream = await createMediaStreamFromId(streamId);
  logger.log('MediaStream created');

  if (!settings.microphoneEnabled) {
    return { audioContext: null, micStream: null, stream: captureStream };
  }

  logger.log('Adding microphone');
  try {
    const mixedStream = await createMixedCaptureStream({
      captureStream,
      microphoneEnabled: settings.microphoneEnabled,
      systemAudioEnabled: settings.systemAudioEnabled,
    });
    logger.log('Microphone added and mixed');
    return {
      audioContext: mixedStream.audioContext,
      micStream: mixedStream.micStream,
      stream: mixedStream.stream,
    };
  } catch (micError) {
    logger.warn('Failed to get microphone', micError);
    return { audioContext: null, micStream: null, stream: captureStream };
  }
}

export function configureTabCaptureRecorder(props: {
  settings: TabCaptureSettings;
  stream: MediaStream;
  onProgress: ((progress: CaptureProgress) => void) | null;
  onSaveRecording: () => void;
  recordedChunks: Blob[];
}): MediaRecorder {
  const { mimeType, qualityConfig } = resolveRecorderOptions(props.settings);
  logger.log('Resolved recorder options', {
    quality: props.settings.quality,
    mimeType,
    bitrate: qualityConfig.videoBitsPerSecond,
    fps: qualityConfig.frameRate,
  });

  const recorder = new MediaRecorder(props.stream, {
    mimeType,
    videoBitsPerSecond: qualityConfig.videoBitsPerSecond,
  });
  const recorderHandlers = createRecorderHandlers({
    onProgress: props.onProgress,
    onSaveRecording: props.onSaveRecording,
    recordedChunks: props.recordedChunks,
  });

  recorder.ondataavailable = recorderHandlers.ondataavailable;
  recorder.onstop = recorderHandlers.onstop;
  recorder.onerror = recorderHandlers.onerror;
  return recorder;
}
