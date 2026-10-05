import { VideoSample, type VideoSampleSink } from 'mediabunny';

type ReviewSampleSink = Pick<VideoSampleSink, 'getSample' | 'samples' | 'samplesAtTimestamps'>;

/** Takes ownership of a decoded sample and transfers a drawable sample to its caller. */
async function prepareSample(sample: VideoSample, signal: AbortSignal): Promise<VideoSample> {
  let frame: VideoFrame | undefined;
  let packed: VideoFrame | undefined;
  try {
    signal.throwIfAborted();
    if (sample.format !== 'NV12') return sample;
    frame = sample.toVideoFrame();
    const visible = frame.visibleRect;
    if (
      !visible ||
      (visible.x === 0 &&
        visible.y === 0 &&
        visible.width === frame.codedWidth &&
        visible.height === frame.codedHeight)
    )
      return sample;
    // Windows GPU NV12 conversion can read chroma outside visibleRect even at 1:1.
    // Copy native visible planes before conversion; a canvas/bitmap copy is already contaminated.
    const bytes = new Uint8Array(frame.allocationSize());
    const layout = await frame.copyTo(bytes);
    signal.throwIfAborted();
    packed = new VideoFrame(bytes, {
      format: 'NV12',
      layout,
      codedWidth: visible.width,
      codedHeight: visible.height,
      displayWidth: frame.displayWidth,
      displayHeight: frame.displayHeight,
      colorSpace: frame.colorSpace,
      timestamp: frame.timestamp,
    });
    const prepared = new VideoSample(packed, {
      timestamp: sample.timestamp,
      duration: sample.duration,
      rotation: sample.rotation,
    });
    packed = undefined;
    sample.close();
    return prepared;
  } catch (error) {
    sample.close();
    throw error;
  } finally {
    packed?.close();
    frame?.close();
  }
}

/** Normalizes moving and transition endpoint frames at the shared export decode boundary. */
export function createReviewDecodedSampleSink(sink: ReviewSampleSink, signal: AbortSignal) {
  return {
    async getSample(time: number) {
      const sample = await sink.getSample(time);
      return sample ? prepareSample(sample, signal) : null;
    },
    async *samples(start: number, end: number) {
      for await (const sample of sink.samples(start, end))
        yield await prepareSample(sample, signal);
    },
    async *samplesAtTimestamps(times: Iterable<number> | AsyncIterable<number>) {
      for await (const sample of sink.samplesAtTimestamps(times))
        yield sample ? await prepareSample(sample, signal) : null;
    },
  };
}
