import { translate } from '../../../platform/i18n';
import { loadAudioPeaks, resolveMediaDuration } from './helpers';

interface LoadedVideoMetadata {
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
  hasAudio: boolean;
  audioPeaks: number[] | null;
}

interface LoadedAudioMetadata {
  duration: number;
  mimeType: string;
  size: number;
  hasAudio: true;
  audioPeaks: number[] | null;
}

interface LoadedImageMetadata {
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

function detectVideoAudioPresence(video: HTMLVideoElement) {
  const extendedVideo = video as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };
  return Boolean(
    extendedVideo.audioTracks?.length ||
    extendedVideo.mozHasAudio ||
    (extendedVideo.webkitAudioDecodedByteCount ?? 0) > 0
  );
}

export function loadVideoMetadata(blob: Blob): Promise<LoadedVideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = '';
    };

    resolveMediaDuration(video, 1)
      .then(async (durationResult) => {
        const { duration } = durationResult;
        const hasAudio = detectVideoAudioPresence(video);
        const audioPeaks =
          hasAudio && durationResult.isAuthoritative ? await loadAudioPeaks(blob, duration) : null;

        resolve({
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720,
          duration,
          mimeType: blob.type || 'video/webm',
          size: blob.size,
          hasAudio,
          audioPeaks,
        });
        cleanup();
      })
      .catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export function loadAudioMetadata(blob: Blob): Promise<LoadedAudioMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.src = '';
    };

    resolveMediaDuration(audio, 1)
      .then(async (durationResult) => {
        const { duration } = durationResult;
        const audioPeaks = durationResult.isAuthoritative
          ? await loadAudioPeaks(blob, duration)
          : null;
        resolve({
          duration,
          mimeType: blob.type || 'audio/webm',
          size: blob.size,
          hasAudio: true,
          audioPeaks,
        });
        cleanup();
      })
      .catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export function loadImageMetadata(blob: Blob): Promise<LoadedImageMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(url);
      image.src = '';
    };

    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1920,
        height: image.naturalHeight || 1080,
        mimeType: blob.type || 'image/png',
        size: blob.size,
      });
      cleanup();
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(translate('shared.mediaMetadata.imageMetadataReadError')));
    };

    image.src = url;
  });
}
