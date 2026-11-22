import {
  RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY,
  waitForRecordingObservationDrain,
} from '../../../../../../contracts/video/observation-batches';

interface Delivery {
  key: string;
  source: string;
  outgoing: boolean;
  closing: boolean;
  endsSource: boolean;
  lastBatch: number;
  fingerprint: string;
  verify(): Promise<boolean>;
  isCurrent(): boolean;
  publish(): Promise<void>;
}
interface Source {
  id: string;
  verified: Promise<boolean>;
  tail: Promise<void>;
  ended: ReturnType<typeof Promise.withResolvers<void>>;
  pending: number;
  final: { fingerprint: string; lastBatch: number; completion: Promise<void> | null } | null;
}
// Retired incarnations must not regain admission when their native document returns from BFCache.

interface Stream {
  key: string;
  retiredSources: Set<string>;
  current: Source | null;
  reservations: Source[];
  admissions: Promise<void>;
  retired: boolean;
}

/** Orders native document admission after the predecessor's bounded terminal drain. */
export function createRecordingObservationForwarder() {
  let stream: Stream | null = null;
  return (
    delivery: Delivery
  ): { accepted: false; error: string } | { accepted: true; completion: Promise<void> } => {
    const refuse = (reason: string) => ({
      accepted: false as const,
      error: `RECORDING_OBSERVATIONS_${reason}`,
    });
    if (stream?.key !== delivery.key) {
      if (delivery.outgoing) return refuse('SOURCE_UNAVAILABLE');
      if (stream) {
        stream.retired = true;
        stream.current?.ended.resolve();
        for (const source of stream.reservations) source.ended.resolve();
      }
      stream = {
        key: delivery.key,
        retiredSources: new Set(),
        current: null,
        reservations: [],
        admissions: Promise.resolve(),
        retired: false,
      };
    }
    const state = stream;
    if (state.retiredSources.has(delivery.source)) return refuse('SOURCE_UNAVAILABLE');
    let source =
      state.current?.id === delivery.source
        ? state.current
        : state.reservations.find((item) => item.id === delivery.source);
    if (!source && delivery.outgoing) return refuse('SOURCE_UNAVAILABLE');
    let initial = false;
    if (!source) {
      if (state.retiredSources.size >= RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY)
        return refuse('SOURCE_UNAVAILABLE');
      if (state.reservations.length >= 2) return refuse('BACKPRESSURE');
      source = {
        id: delivery.source,
        verified: delivery.verify().catch(() => false),
        tail: Promise.resolve(),
        ended: Promise.withResolvers<void>(),
        pending: 0,
        final: null,
      };
      state.reservations.push(source);
      initial = true;
    }
    const bound = source;
    if (bound.final) {
      if (delivery.closing) {
        if (bound.final.fingerprint !== delivery.fingerprint) return refuse('SOURCE_UNAVAILABLE');
        if (bound.final.completion) return { accepted: true, completion: bound.final.completion };
      }
      if (delivery.lastBatch > bound.final.lastBatch) return refuse('SOURCE_UNAVAILABLE');
    }
    if (bound.pending >= 2) return refuse('BACKPRESSURE');
    bound.pending++;
    const previous = initial ? state.admissions : bound.tail;
    const work = previous.then(async () => {
      if (!(await bound.verified)) throw new Error('Source document is unavailable');
      if (initial) {
        const predecessor = state.current;
        if (predecessor && predecessor !== bound) {
          await waitForRecordingObservationDrain(
            predecessor.ended.promise.then(() => predecessor.tail)
          );
          if (predecessor.pending > 0) throw new Error('Source drain is unavailable');
        }
      }
      if (state.retired || !delivery.isCurrent()) throw new Error('Source binding is unavailable');
      if (initial) {
        if (state.current && state.current !== bound) {
          if (state.retiredSources.size >= RECORDING_OBSERVATION_RETIRED_SOURCE_CAPACITY)
            throw new Error('Source identity capacity is unavailable');
          state.retiredSources.add(state.current.id);
        }
        state.current = bound;
        state.reservations = state.reservations.filter((item) => item !== bound);
      }
      if (state.current !== bound) throw new Error('Source document is unavailable');
      await delivery.publish();
      if (delivery.endsSource) {
        bound.ended.resolve();
      }
    });
    const completion = work
      .catch((error: unknown) => {
        if (bound.final?.completion === completion) bound.final.completion = null;
        throw error;
      })
      .finally(() => {
        bound.pending--;
      });
    bound.tail = completion.catch(() => undefined);
    if (initial) {
      state.admissions = bound.tail;
      void bound.tail.then(() => {
        state.reservations = state.reservations.filter((item) => item !== bound);
      });
    }
    if (delivery.closing)
      bound.final = {
        fingerprint: delivery.fingerprint,
        lastBatch: delivery.lastBatch,
        completion,
      };
    return { accepted: true, completion };
  };
}
