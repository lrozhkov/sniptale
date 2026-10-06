import { prepareDecodedVideoSample } from '../../features/video/composition/draw/decoded-sample';
import type { VideoSampleSink } from 'mediabunny';

type ReviewSampleSink = Pick<VideoSampleSink, 'getSample' | 'samples' | 'samplesAtTimestamps'>;

/** Normalizes moving and transition endpoint frames at the shared export decode boundary. */
export function createReviewDecodedSampleSink(sink: ReviewSampleSink, signal: AbortSignal) {
  return {
    async getSample(time: number) {
      const sample = await sink.getSample(time);
      return sample ? prepareDecodedVideoSample(sample, signal) : null;
    },
    async *samples(start: number, end: number) {
      for await (const sample of sink.samples(start, end))
        yield await prepareDecodedVideoSample(sample, signal);
    },
    async *samplesAtTimestamps(times: Iterable<number> | AsyncIterable<number>) {
      for await (const sample of sink.samplesAtTimestamps(times))
        yield sample ? await prepareDecodedVideoSample(sample, signal) : null;
    },
  };
}
