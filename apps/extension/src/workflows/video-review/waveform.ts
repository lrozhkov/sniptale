import { loadAudioPeaks } from '../../composition/library-preview/audio-peaks';

export interface ReviewWaveform {
  duration: number;
  peaks: readonly number[];
  /** Bounded, disposable refinement; never persisted with the review document. */
  loadWindow?(
    start: number,
    end: number,
    buckets: number,
    signal: AbortSignal
  ): Promise<ReviewWaveformWindow | null>;
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
  return peaks
    ? {
        duration,
        peaks,
        loadWindow: (start, end, buckets, signal) =>
          loadReviewWaveformWindow(blob, start, end, buckets, signal),
      }
    : null;
}

export interface ReviewWaveformWindow {
  start: number;
  end: number;
  peaks: readonly number[];
}

/** Streams only the visible interval into pixel-density peak buckets, with bounded memory. */
export async function loadReviewWaveformWindow(
  blob: Blob,
  start: number,
  end: number,
  buckets: number,
  signal: AbortSignal
): Promise<ReviewWaveformWindow | null> {
  if (![start, end, buckets].every(Number.isFinite) || start < 0 || end <= start || buckets < 1)
    return null;
  signal.throwIfAborted();
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const peaks = new Array<number>(Math.min(8192, Math.ceil(buckets))).fill(0);
    let decoded = false;
    for await (const sample of new AudioSampleSink(track).samples(start, end)) {
      try {
        signal.throwIfAborted();
        const pcm = new Float32Array(sample.numberOfFrames);
        for (let channel = 0; channel < sample.numberOfChannels; channel++) {
          sample.copyTo(pcm, { planeIndex: channel, format: 'f32-planar' });
          for (let frame = 0; frame < pcm.length; frame++) {
            const at = sample.timestamp + frame / sample.sampleRate;
            if (at < start || at >= end) continue;
            const index = Math.min(
              peaks.length - 1,
              Math.floor(((at - start) / (end - start)) * peaks.length)
            );
            const amplitude = Math.abs(pcm[frame]!);
            if (Number.isFinite(amplitude))
              peaks[index] = Math.max(peaks[index]!, Math.min(1, amplitude));
          }
        }
        decoded = true;
      } finally {
        sample.close();
      }
    }
    return decoded ? { start, end, peaks } : null;
  } finally {
    signal.removeEventListener('abort', abort);
    input.dispose();
  }
}
