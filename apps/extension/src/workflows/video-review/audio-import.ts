import { saveProjectAssetSafely } from '../media-hub/store';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';

/** Imported audio becomes a library project asset; clips reference it by library id. */
const IMPORTED_AUDIO_MAX_SECONDS = 3600;
const IMPORTED_AUDIO_MIN_SECONDS = 0.05;

async function decodeAudioDuration(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    if (
      !Number.isFinite(audio.duration) ||
      audio.duration < IMPORTED_AUDIO_MIN_SECONDS ||
      audio.duration > IMPORTED_AUDIO_MAX_SECONDS
    )
      throw new Error('Unsupported audio duration.');
    return audio.duration;
  } finally {
    await context.close();
  }
}

/**
 * Imports one audio file: stores the bytes in the shared asset store, decodes the
 * duration, and returns the media-library reference the clip model persists.
 */
export async function importAudioAsset(file: File): Promise<{ assetId: string; duration: number }> {
  const id = crypto.randomUUID();
  const mimeType = file.type.startsWith('audio/') ? file.type : 'audio/mpeg';
  await saveProjectAssetSafely(id, file, mimeType, file.name);
  return { assetId: `project-asset:${id}`, duration: await decodeAudioDuration(file) };
}

/** Places an imported clip at the target time, bounded by the timeline end. */
export function importedAudioClip(
  assetId: string,
  duration: number,
  atTime: number,
  timelineDuration: number
): QuickEditAudioClip {
  return createQuickEditAudioClip({
    id: `audio-${crypto.randomUUID()}`,
    assetId,
    timelineStart: atTime,
    duration,
    endMax: timelineDuration,
  });
}
