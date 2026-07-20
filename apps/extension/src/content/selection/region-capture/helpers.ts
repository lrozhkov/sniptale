import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type VideoQuality as VideoQualityRole,
} from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { CaptureProgress, RegionCaptureSettings } from './types';

const logger = createLogger({ namespace: 'ContentRegionCapture' });

export type ViewportCropTarget = object | null;

export interface RegionCaptureRecorderConfig {
  finalStream: MediaStream;
  onProgress: ((progress: CaptureProgress) => void) | null;
  onSaveRecording: () => void;
  recordedChunks: Blob[];
  quality: VideoQualityRole;
}

type MediaDevicesWithRegionCapture = MediaDevices & {
  produceCropTarget?: (element: HTMLElement) => Promise<object>;
};

export function createViewportCropTarget(getViewportMarker: () => HTMLElement) {
  return async (): Promise<ViewportCropTarget> => {
    const mediaDevices = navigator.mediaDevices as MediaDevicesWithRegionCapture;

    if (typeof mediaDevices.produceCropTarget !== 'function') {
      logger.debug('produceCropTarget is unavailable; falling back to full-tab capture');
      return null;
    }

    try {
      return await mediaDevices.produceCropTarget(getViewportMarker());
    } catch (error) {
      logger.warn('Failed to create viewport CropTarget; falling back to full-tab capture', error);
      return null;
    }
  };
}

export async function getRegionCaptureDisplayStream(
  systemAudioEnabled: boolean
): Promise<MediaStream> {
  const displayMediaOptions = {
    video: {
      displaySurface: 'browser',
      frameRate: { ideal: 30, max: 60 },
    },
    audio: systemAudioEnabled,
    preferCurrentTab: true,
    surfaceSwitching: 'include',
  } satisfies DisplayMediaStreamOptions & {
    preferCurrentTab: boolean;
    surfaceSwitching: 'include';
  };

  logger.debug('Requesting display media', displayMediaOptions);
  return navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
}

export async function applyViewportCrop(
  videoTrack: MediaStreamTrack,
  cropTarget: ViewportCropTarget
): Promise<void> {
  if (
    !cropTarget ||
    typeof (videoTrack as MediaStreamTrack & { cropTo?: unknown }).cropTo !== 'function'
  ) {
    logger.debug('cropTo is unavailable; keeping full-tab capture');
    return;
  }

  try {
    await (videoTrack as MediaStreamTrack & { cropTo: (target: object) => Promise<void> }).cropTo(
      cropTarget
    );
  } catch (cropError) {
    logger.warn('Failed to apply cropTo; continuing with full-tab capture', cropError);
  }
}

export function applyVideoTrackHints(videoTrack: MediaStreamTrack): void {
  logger.debug('Applying video track hints', {
    frameRate: videoTrack.getSettings().frameRate,
    height: videoTrack.getSettings().height,
    width: videoTrack.getSettings().width,
  });

  if ('contentHint' in videoTrack) {
    (videoTrack as MediaStreamTrack & { contentHint: string }).contentHint = 'detail';
  }
}

export async function resolveRegionCaptureStream(
  settings: RegionCaptureSettings,
  displayStream: MediaStream
): Promise<{
  audioContext: AudioContext | null;
  finalStream: MediaStream;
  micStream: MediaStream | null;
}> {
  if (!settings.microphoneEnabled) {
    return { audioContext: null, finalStream: displayStream, micStream: null };
  }

  let audioContext: AudioContext | null = null;
  try {
    const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    if (settings.systemAudioEnabled) {
      const systemAudioTrack = displayStream.getAudioTracks()[0];
      if (systemAudioTrack) {
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream([systemAudioTrack])
        );
        systemSource.connect(destination);
      }
    }

    audioContext.createMediaStreamSource(microphoneStream).connect(destination);

    const videoTrack = displayStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('Display stream does not contain a video track');
    }
    const mixedAudioTrack = destination.stream.getAudioTracks()[0];
    const finalStream = mixedAudioTrack
      ? new MediaStream([videoTrack, mixedAudioTrack])
      : new MediaStream([videoTrack]);

    return { audioContext, finalStream, micStream: microphoneStream };
  } catch (micError) {
    void audioContext?.close().catch(() => undefined);
    logger.warn('Failed to attach microphone; continuing without mic', micError);
    return { audioContext: null, finalStream: displayStream, micStream: null };
  }
}

function createMediaRecorderMimeType(quality: VideoQuality): {
  mimeType: string;
  qualityConfig: (typeof VIDEO_QUALITY_CONFIGS)[VideoQualityRole];
} {
  const qualityConfig =
    VIDEO_QUALITY_CONFIGS[quality] ?? VIDEO_QUALITY_CONFIGS[VideoQuality.MEDIUM];
  const mimeType = MediaRecorder.isTypeSupported(qualityConfig.mimeType)
    ? qualityConfig.mimeType
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

  return { mimeType, qualityConfig };
}

export function configureRegionCaptureRecorder(props: RegionCaptureRecorderConfig): MediaRecorder {
  const { mimeType, qualityConfig } = createMediaRecorderMimeType(props.quality);
  const mediaRecorder = new MediaRecorder(props.finalStream, {
    mimeType,
    videoBitsPerSecond: qualityConfig.videoBitsPerSecond,
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      props.recordedChunks.push(event.data);
      props.onProgress?.({ size: event.data.size, type: 'CHUNK' });
    }
  };

  mediaRecorder.onstop = () => {
    logger.debug('MediaRecorder stopped');
    props.onSaveRecording();
  };

  mediaRecorder.onerror = (event) => {
    logger.error('MediaRecorder error', event);
    props.onProgress?.({
      error: resolveRecorderErrorMessage(event),
      type: 'ERROR',
    });
  };

  return mediaRecorder;
}

function resolveRecorderErrorMessage(event: Event) {
  if (event instanceof ErrorEvent) {
    if (event.error instanceof Error) {
      return event.error.message;
    }

    if (event.message) {
      return event.message;
    }
  }

  return event instanceof Error ? event.message : String(event);
}
