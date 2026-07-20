const AUDIO_PEAK_BUCKETS = 160;
const AUDIO_PEAK_SAMPLES_PER_BUCKET = 96;
export const AUDIO_PEAK_MAX_DECODE_BLOB_SIZE = 24 * 1024 * 1024;
export const AUDIO_PEAK_MAX_DECODE_DURATION_SECONDS = 5 * 60;

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ??
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function getBucketPeak(channelData: Float32Array[], start: number, end: number): number {
  const stride = Math.max(1, Math.floor((end - start) / AUDIO_PEAK_SAMPLES_PER_BUCKET));
  let peak = 0;

  for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
    for (const channel of channelData) {
      peak = Math.max(peak, Math.abs(channel[sampleIndex] ?? 0));
    }
  }

  for (const channel of channelData) {
    peak = Math.max(peak, Math.abs(channel[end - 1] ?? 0));
  }

  return Math.min(1, peak);
}

function buildAudioPeaks(audioBuffer: AudioBuffer): number[] | null {
  if (audioBuffer.length <= 0 || audioBuffer.numberOfChannels <= 0) {
    return null;
  }

  const bucketCount = Math.max(24, AUDIO_PEAK_BUCKETS);
  const bucketSize = Math.max(1, Math.ceil(audioBuffer.length / bucketCount));
  const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );

  return Array.from({ length: bucketCount }, (_, bucketIndex) => {
    const start = bucketIndex * bucketSize;
    const end = Math.min(audioBuffer.length, start + bucketSize);
    return end <= start ? 0 : getBucketPeak(channelData, start, end);
  });
}

function canDecodeAudioPeaks(blob: Blob, durationSeconds: number): boolean {
  return (
    blob.size > 0 &&
    blob.size <= AUDIO_PEAK_MAX_DECODE_BLOB_SIZE &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds <= AUDIO_PEAK_MAX_DECODE_DURATION_SECONDS
  );
}

export async function loadAudioPeaks(
  blob: Blob,
  durationSeconds: number
): Promise<number[] | null> {
  if (!canDecodeAudioPeaks(blob, durationSeconds)) {
    return null;
  }

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return null;
  }

  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContextConstructor();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return buildAudioPeaks(audioBuffer);
  } catch {
    return null;
  } finally {
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
    }
  }
}
