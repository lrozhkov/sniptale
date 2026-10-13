import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';

/** Native PCM source retained only for one export or unpublished preview job. */
export interface ReviewAudioClipSource {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  read(
    start: number,
    end: number,
    signal: AbortSignal
  ): Promise<{ start: number; planes: Float32Array[] }>;
  dispose(): void;
}
export type ReviewAudioClipInput = AudioBuffer | ReviewAudioClipSource;

/** Opens decoder ownership without decoding the full asset into memory. */
export async function openReviewAudioClipSource(
  blob: Blob,
  signal: AbortSignal
): Promise<ReviewAudioClipSource> {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  let closed = false;
  const dispose = () => {
    if (!closed) {
      closed = true;
      signal.removeEventListener('abort', dispose);
      input.dispose();
    }
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error('External audio cannot be decoded');
    const sampleRate = await track.getSampleRate();
    const numberOfChannels = await track.getNumberOfChannels();
    const duration = await track.computeDuration();
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isSafeInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !Number.isSafeInteger(numberOfChannels) ||
      numberOfChannels < 1 ||
      numberOfChannels > 8
    )
      throw new Error('Invalid external audio parameters');
    const frames = duration * sampleRate;
    const nativeFrames = Math.round(frames);
    // Native PCM durations can land one ULP above their integer frame count.
    const length =
      nativeFrames > 0 &&
      Math.abs(frames - nativeFrames) <= Number.EPSILON * Math.max(1, frames) * 4
        ? nativeFrames
        : Math.ceil(frames);
    if (!Number.isSafeInteger(length)) throw new Error('Invalid external audio duration');
    const sink = new AudioSampleSink(track);
    signal.throwIfAborted();
    return {
      sampleRate,
      numberOfChannels,
      length,
      dispose,
      async read(start, end, requestSignal) {
        signal.throwIfAborted();
        requestSignal.throwIfAborted();
        if (
          closed ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          end < start ||
          end - start > sampleRate * 5
        )
          throw new Error('Invalid bounded audio window');
        const planes = Array.from(
          { length: numberOfChannels },
          () => new Float32Array(end - start)
        );
        const first = Math.max(0, start);
        const last = Math.min(length, end);
        if (last > first)
          for await (const sample of sink.samples(
            Math.max(0, first / sampleRate - 0.08),
            last / sampleRate
          )) {
            try {
              signal.throwIfAborted();
              requestSignal.throwIfAborted();
              if (sample.sampleRate !== sampleRate || sample.numberOfChannels !== numberOfChannels)
                throw new Error('External audio parameters changed');
              const sampleStart = Math.round(sample.timestamp * sampleRate);
              if (
                !Number.isSafeInteger(sampleStart) ||
                !Number.isSafeInteger(sample.numberOfFrames) ||
                sample.numberOfFrames < 0
              )
                throw new Error('Invalid decoded audio interval');
              const from = Math.max(first, sampleStart);
              const to = Math.min(last, sampleStart + sample.numberOfFrames);
              if (to <= from) continue;
              for (let c = 0; c < numberOfChannels; c++)
                sample.copyTo(planes[c]!.subarray(from - start, to - start), {
                  planeIndex: c,
                  format: 'f32-planar',
                  frameOffset: from - sampleStart,
                  frameCount: to - from,
                });
            } finally {
              sample.close();
            }
          }
        signal.throwIfAborted();
        requestSignal.throwIfAborted();
        return { start, planes };
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Supplies the same absolute PCM reader to the existing tempo processor for either input kind. */
export async function readReviewAudioClipRange(
  source: ReviewAudioClipInput,
  start: number,
  end: number,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if ('read' in source) {
    const window = await source.read(start, end, signal);
    return (channel: number, frame: number) => window.planes[channel]?.[frame - window.start] ?? 0;
  }
  const planes = Array.from({ length: source.numberOfChannels }, (_, channel) =>
    source.getChannelData(channel)
  );
  return (channel: number, frame: number) => planes[channel]?.[frame] ?? 0;
}

/** Live playback caches native-rate PCM; decoding stays identical to export's bounded reader. */
export async function decodeReviewAudioClipBuffer(
  data: ArrayBuffer,
  signal: AbortSignal
): Promise<AudioBuffer> {
  const source = await openReviewAudioClipSource(new Blob([data]), signal);
  try {
    const buffer = new AudioBuffer({
      length: source.length,
      sampleRate: source.sampleRate,
      numberOfChannels: source.numberOfChannels,
    });
    for (let start = 0; start < source.length; start += source.sampleRate) {
      const end = Math.min(source.length, start + source.sampleRate);
      const window = await source.read(start, end, signal);
      window.planes.forEach((plane, channel) => buffer.getChannelData(channel).set(plane, start));
    }
    signal.throwIfAborted();
    return buffer;
  } finally {
    source.dispose();
  }
}
