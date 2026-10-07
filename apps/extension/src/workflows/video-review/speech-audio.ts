import { resolveReviewAssetBytes } from './asset-bytes';

const RATE = 16_000;
/** Encodes bounded mono PCM; no browser-dependent container headers. */
export function encodeReviewSpeechWav(samples: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) =>
    view.setInt16(
      44 + index * 2,
      Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)),
      true
    )
  );
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Decode only the authorized native interval, bounded to five minutes. */
export async function extractReviewSpeechWav(
  assetId: string,
  start: number,
  end: number,
  signal: AbortSignal
): Promise<Blob> {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end - start > 300
  )
    throw new Error('invalid-request');
  signal.throwIfAborted();
  const blob = await resolveReviewAssetBytes(assetId);
  if (!blob) throw new Error('missing-media');
  const { ALL_FORMATS, AudioSampleSink, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('invalid-response');
    const pcm = new Float32Array(Math.round((end - start) * RATE));
    let decoded = false;
    for await (const sample of new AudioSampleSink(track).samples(start, end)) {
      try {
        signal.throwIfAborted();
        const planes = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const plane = new Float32Array(sample.numberOfFrames);
          sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
          return plane;
        });
        const first = Math.max(0, Math.ceil((sample.timestamp - start) * RATE));
        const last = Math.min(
          pcm.length,
          Math.ceil((sample.timestamp + sample.numberOfFrames / sample.sampleRate - start) * RATE)
        );
        for (let frame = first; frame < last; frame++) {
          const position = (start + frame / RATE - sample.timestamp) * sample.sampleRate;
          const left = Math.max(0, Math.min(sample.numberOfFrames - 1, Math.floor(position)));
          const right = Math.min(sample.numberOfFrames - 1, left + 1);
          const fraction = Math.max(0, Math.min(1, position - left));
          pcm[frame] =
            planes.reduce(
              (sum, plane) => sum + plane[left]! * (1 - fraction) + plane[right]! * fraction,
              0
            ) / planes.length;
          decoded = true;
        }
      } finally {
        sample.close();
      }
    }
    signal.throwIfAborted();
    if (!decoded) throw new Error('invalid-response');
    return encodeReviewSpeechWav(pcm);
  } finally {
    input.dispose();
  }
}

export async function decodeReviewSpeechDuration(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > 300)
      throw new Error('invalid-response');
    return decoded.duration;
  } finally {
    await context.close();
  }
}

/** Select the latest quiet 100 ms window without treating ordinary speech as silence. */
export function reviewSpeechQuietBoundary(samples: Int16Array, sampleRate = RATE): number | null {
  const width = Math.max(1, Math.round(sampleRate * 0.1));
  for (let end = samples.length; end >= width; end -= width) {
    let energy = 0;
    for (let index = end - width; index < end; index++) energy += (samples[index]! / 32768) ** 2;
    if (Math.sqrt(energy / width) <= 0.008) return (end - width / 2) / sampleRate;
  }
  return null;
}

/** Read only a four-second local boundary window; nothing is staged or sent here. */
export async function planReviewSpeechChunks(
  assetId: string,
  ranges: readonly { start: number; end: number }[],
  signal: AbortSignal
): Promise<{ start: number; end: number }[]> {
  const result: { start: number; end: number }[] = [];
  for (const range of ranges) {
    let start = range.start;
    while (start < range.end - 1e-7) {
      signal.throwIfAborted();
      let end = Math.min(range.end, start + 60);
      if (end < range.end) {
        const windowStart = end - 4;
        const wav = await extractReviewSpeechWav(assetId, windowStart, end, signal);
        const boundary = reviewSpeechQuietBoundary(new Int16Array(await wav.arrayBuffer(), 44));
        if (boundary !== null) end = windowStart + boundary;
      }
      result.push({ start, end });
      start = end;
    }
  }
  return result;
}
