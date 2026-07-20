import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import type { CaptureProgress, TabCaptureSettings } from './types';
import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';

export async function createMixedCaptureStream(props: {
  captureStream: MediaStream;
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
}) {
  if (!props.microphoneEnabled) {
    return {
      audioContext: null as AudioContext | null,
      micStream: null as MediaStream | null,
      stream: props.captureStream,
    };
  }

  let audioContext: AudioContext | null = null;
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    if (props.systemAudioEnabled && props.captureStream.getAudioTracks().length > 0) {
      const systemSource = audioContext.createMediaStreamSource(
        new MediaStream(props.captureStream.getAudioTracks())
      );
      systemSource.connect(destination);
    }

    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);
    const videoTrack = props.captureStream.getVideoTracks()[0];
    const mixedAudioTrack = destination.stream.getAudioTracks()[0];

    if (!videoTrack || !mixedAudioTrack) {
      throw new Error('Failed to build mixed capture stream');
    }

    return {
      audioContext,
      micStream,
      stream: new MediaStream([videoTrack, mixedAudioTrack]),
    };
  } catch (error) {
    void audioContext?.close().catch(() => undefined);
    throw error;
  }
}

export function createRecorderHandlers(props: {
  onProgress: ((progress: CaptureProgress) => void) | null;
  onSaveRecording: () => void;
  recordedChunks: Blob[];
}) {
  return {
    ondataavailable: (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        props.recordedChunks.push(event.data);
        props.onProgress?.({
          type: 'CHUNK',
          size: event.data.size,
        });
      }
    },
    onerror: (event: Event | Error) => {
      props.onProgress?.({
        type: 'ERROR',
        error: event instanceof Error ? event.message : String(event),
      });
    },
    onstop: () => {
      props.onSaveRecording();
    },
  };
}

export function resolveRecorderOptions(settings: TabCaptureSettings) {
  const qualityConfig =
    VIDEO_QUALITY_CONFIGS[settings.quality] ?? VIDEO_QUALITY_CONFIGS[VideoQuality.MEDIUM];
  const mimeType = MediaRecorder.isTypeSupported(qualityConfig.mimeType)
    ? qualityConfig.mimeType
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

  return {
    mimeType,
    qualityConfig,
  };
}
