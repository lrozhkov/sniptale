import type { createReviewDecodedSampleSink } from './decoded-video-sample';

type Sink = ReturnType<typeof createReviewDecodedSampleSink>;
type PlannedSample = { tick: number; time: number };

/** One repeatable frozen schedule feeds both source timestamps and requested candidate identity. */
export function createPresentationDecoder(
  sink: Sink,
  schedule: () => Iterable<PlannedSample>,
  signal: AbortSignal
) {
  const entries = schedule()[Symbol.iterator]();
  let planned = entries.next();
  let samples: ReturnType<Sink['samplesAtTimestamps']> | null = null;
  let disposed = false;
  const times = function* () {
    for (const entry of schedule()) yield entry.time;
  };
  const next = async () => {
    signal.throwIfAborted();
    samples ??= sink.samplesAtTimestamps(times());
    const result = await samples.next();
    if (result.done) {
      signal.throwIfAborted();
      throw new Error('Main source frame is unavailable');
    }
    if (signal.aborted || disposed) {
      result.value?.close();
      signal.throwIfAborted();
      throw new Error('Presentation decoder disposed');
    }
    return result.value;
  };
  return {
    async read(tick: number | undefined, time: number) {
      signal.throwIfAborted();
      if (disposed) throw new Error('Presentation decoder disposed');
      // Endpoint and held poses can revisit an earlier tick without disturbing forward decoding.
      if (tick === undefined || planned.done || tick < planned.value.tick)
        return sink.getSample(time);
      while (!planned.done && planned.value.tick < tick) {
        (await next())?.close();
        planned = entries.next();
      }
      if (planned.done || planned.value.tick !== tick || planned.value.time !== time)
        return sink.getSample(time);
      const sample = await next();
      planned = entries.next();
      return sample;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      entries.return?.();
      await samples?.return(undefined);
      samples = null;
    },
  };
}
