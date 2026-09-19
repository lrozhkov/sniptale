import { loadAudioPeaks } from '../../composition/library-preview/audio-peaks';

export interface ReviewWaveform {
  duration: number;
  peaks: readonly number[];
}

/** Reuses the bounded library decoder, with authoritative duration rather than trimmed clip length. */
export async function loadReviewWaveform(
  blob: Blob,
  knownDuration?: number
): Promise<ReviewWaveform | null> {
  let duration = knownDuration;
  if (duration === undefined) {
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) return null;
      duration = await track.computeDuration();
    } finally {
      input.dispose();
    }
  }
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const peaks = await loadAudioPeaks(blob, duration);
  return peaks ? { duration, peaks } : null;
}
