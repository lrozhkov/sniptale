/** Accumulate finite PCM amplitudes into an existing bounded [start, end) peak window. */
export function accumulateAudioPeaks(
  peaks: number[],
  pcm: Float32Array,
  timestamp: number,
  sampleRate: number,
  start: number,
  end: number
): void {
  for (let frame = 0; frame < pcm.length; frame++) {
    const at = timestamp + frame / sampleRate;
    if (at < start || at >= end) continue;
    const index = Math.min(
      peaks.length - 1,
      Math.floor(((at - start) / (end - start)) * peaks.length)
    );
    const amplitude = Math.abs(pcm[frame]!);
    if (Number.isFinite(amplitude)) peaks[index] = Math.max(peaks[index]!, Math.min(1, amplitude));
  }
}
