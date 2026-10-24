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

async function detectVideoAudioPresence(blob: Blob): Promise<boolean> {
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    return (await input.getAudioTracks()).length > 0;
  } finally {
    input.dispose();
  }
}

export async function loadVideoMetadata(blob: Blob): Promise<LoadedVideoMetadata> {
  const { inspectReviewVideo } = await import('../../../workflows/video-review/source');
  const file = blob instanceof File ? blob : new File([blob], 'video', { type: blob.type });
  const { source } = await inspectReviewVideo(file, new AbortController().signal);
  const hasAudio = await detectVideoAudioPresence(blob);
  const audioPeaks = hasAudio ? await loadAudioPeaks(blob, source.duration) : null;
  return { ...source, hasAudio, audioPeaks };
}

async function resolveWaveDuration(blob: Blob, fallbackDuration: number): Promise<number> {
  const { Input, BlobSource, WAVE } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: [WAVE] });
  try {
    const track = await input.getPrimaryAudioTrack();
    const duration = await track?.computeDuration();
    // Element metadata rounds WAV frame durations; retained takes use sample precision.
    return duration !== undefined && Number.isFinite(duration) && duration > 0
      ? duration
      : fallbackDuration;
  } catch {
    return fallbackDuration;
  } finally {
    input.dispose();
  }
}

async function reconcileReviewAudioDuration(
  blob: Blob,
  duration: number,
  requiredSourceEnd: number | undefined
): Promise<number> {
  if (
    typeof requiredSourceEnd !== 'number' ||
    !Number.isFinite(requiredSourceEnd) ||
    requiredSourceEnd <= duration
  )
    return duration;
  try {
    const { inspectReviewAudio } = await import('../../../workflows/video-review/audio-import');
    // Gallery admission measures decoded samples; element metadata can round that end down.
    const decodedDuration = await inspectReviewAudio(blob, new AbortController().signal);
    return Math.max(duration, decodedDuration);
  } catch {
    // Failed admission cannot extend the source; transfer validation retains its refusal.
    return duration;
  }
}

/** Reconciles a retained source end through Gallery admission only when metadata is shorter. */
export function loadAudioMetadata(
  blob: Blob,
  options?: { requiredSourceEnd: number }
): Promise<LoadedAudioMetadata> {
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
        const sourceDuration = durationResult.isAuthoritative
          ? await resolveWaveDuration(blob, durationResult.duration)
          : durationResult.duration;
        const duration = durationResult.isAuthoritative
          ? await reconcileReviewAudioDuration(blob, sourceDuration, options?.requiredSourceEnd)
          : sourceDuration;
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
      image.onload = null;
      image.onerror = null;
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
