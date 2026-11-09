/** Normalized source observations consumed by sed-window-v1, before wire encoding. */
export interface CursorTrajectoryObservation {
  readonly observationSeq: number;
  readonly segmentId: number;
  readonly activeTimeUs: number;
  readonly xQ8: number | null;
  readonly yQ8: number | null;
  readonly observed: boolean;
  readonly visible: boolean;
  readonly event: 'move' | 'down' | 'up' | 'click';
  readonly anchors: readonly string[];
}

const CURSOR_TRAJECTORY_WINDOW_MAX_OBSERVATIONS = 512;
const CURSOR_TRAJECTORY_WINDOW_MAX_DURATION_US = 250_000;

function isUnsignedInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateWindow(observations: readonly CursorTrajectoryObservation[]): void {
  if (observations.length > CURSOR_TRAJECTORY_WINDOW_MAX_OBSERVATIONS) {
    throw new RangeError('Cursor trajectory window exceeds 512 observations.');
  }
  const first = observations[0];
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    const previous = observations[index - 1];
    const coordinatesValid = observation.observed
      ? observation.xQ8 !== null &&
        observation.yQ8 !== null &&
        isUnsignedInteger(observation.xQ8) &&
        isUnsignedInteger(observation.yQ8)
      : observation.xQ8 === null && observation.yQ8 === null;
    if (
      !coordinatesValid ||
      !isUnsignedInteger(observation.activeTimeUs) ||
      !isUnsignedInteger(observation.observationSeq) ||
      !isUnsignedInteger(observation.segmentId) ||
      (previous &&
        (observation.activeTimeUs < previous.activeTimeUs ||
          observation.observationSeq <= previous.observationSeq))
    ) {
      throw new RangeError('Cursor trajectory observations have invalid coordinates or order.');
    }
    if (
      first &&
      observation.activeTimeUs - first.activeTimeUs > CURSOR_TRAJECTORY_WINDOW_MAX_DURATION_US
    ) {
      throw new RangeError('Cursor trajectory window exceeds 250000 microseconds.');
    }
  }
}

function mandatoryIndices(observations: readonly CursorTrajectoryObservation[]): Set<number> {
  const mandatory = new Set<number>([0, observations.length - 1]);
  let afterButton = false;
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    const previous = observations[index - 1];
    if (observation.anchors.length > 0 || !observation.observed) mandatory.add(index);
    if (observation.event !== 'move') {
      mandatory.add(index);
      if (index > 0) mandatory.add(index - 1);
      afterButton = true;
    } else if (afterButton) {
      mandatory.add(index);
      afterButton = false;
    }
    if (
      previous &&
      (observation.segmentId !== previous.segmentId ||
        observation.visible !== previous.visible ||
        observation.observed !== previous.observed ||
        observation.activeTimeUs === previous.activeTimeUs)
    ) {
      mandatory.add(index - 1);
      mandatory.add(index);
    }
  }
  return mandatory;
}

/**
 * Simplifies one bounded input window with exact time-synchronous distance comparisons.
 * Keeps source objects and ordering unchanged. The caller owns windowing, gaps, and storage.
 */
export function simplifyCursorTrajectoryWindow<T extends CursorTrajectoryObservation>(
  observations: readonly T[]
): T[] {
  validateWindow(observations);
  if (observations.length <= 2) return [...observations];
  const retained = mandatoryIndices(observations);
  const anchors = [...retained].sort((left, right) => left - right);
  const pending: [number, number][] = [];
  for (let index = 1; index < anchors.length; index += 1) {
    pending.push([anchors[index - 1]!, anchors[index]!]);
  }
  while (pending.length > 0) {
    const [start, end] = pending.pop()!;
    if (end <= start + 1) continue;
    const a = observations[start]!;
    const b = observations[end]!;
    if (a.xQ8 === null || a.yQ8 === null || b.xQ8 === null || b.yQ8 === null) {
      for (let index = start + 1; index < end; index += 1) retained.add(index);
      continue;
    }
    const duration = BigInt(b.activeTimeUs) - BigInt(a.activeTimeUs);
    // Equal-time pairs are mandatory neighbors; no zero-duration interpolation is performed.
    if (duration === 0n) continue;
    const ax = BigInt(a.xQ8);
    const ay = BigInt(a.yQ8);
    const dx = BigInt(b.xQ8) - ax;
    const dy = BigInt(b.yQ8) - ay;
    let maximumError = -1n;
    let split = start + 1;
    for (let index = start + 1; index < end; index += 1) {
      const point = observations[index]!;
      // Unobserved samples are mandatory and cannot be interior to this interval.
      if (point.xQ8 === null || point.yQ8 === null) continue;
      const elapsed = BigInt(point.activeTimeUs) - BigInt(a.activeTimeUs);
      const nx = (BigInt(point.xQ8) - ax) * duration - dx * elapsed;
      const ny = (BigInt(point.yQ8) - ay) * duration - dy * elapsed;
      const error = nx * nx + ny * ny;
      // Input sequence is strictly increasing, so the first equal maximum has the lower seq.
      if (error > maximumError) {
        maximumError = error;
        split = index;
      }
    }
    if (maximumError * 10_000n > (199n * 256n) ** 2n * duration * duration) {
      retained.add(split);
      pending.push([start, split], [split, end]);
    }
  }
  return observations.filter((_, index) => retained.has(index));
}

/** Stateful input window only. The caller persists each returned batch before discarding it. */
interface CursorTrajectoryWindowRecorder<T extends CursorTrajectoryObservation> {
  append(observation: T): T[];
  /** Flushes a lifecycle boundary without fabricating a source observation. */
  flush(): T[];
  pendingCount(): number;
}

/** Source-driven partitioning makes output independent of worker or timer scheduling. */
export function createCursorTrajectoryWindowRecorder<
  T extends CursorTrajectoryObservation,
>(): CursorTrajectoryWindowRecorder<T> {
  let pending: T[] = [];
  let previous: T | null = null;
  let emittedSequence: number | null = null;

  const flush = (): T[] => {
    const output = simplifyCursorTrajectoryWindow(pending).filter(
      (point) => emittedSequence === null || point.observationSeq > emittedSequence
    );
    if (output.length > 0) emittedSequence = output.at(-1)!.observationSeq;
    pending = [];
    return output;
  };

  return {
    append(observation) {
      validateWindow([observation]);
      if (
        previous &&
        (observation.observationSeq <= previous.observationSeq ||
          observation.activeTimeUs < previous.activeTimeUs)
      ) {
        throw new RangeError('Cursor trajectory observations have invalid coordinates or order.');
      }
      const first = pending[0];
      const exceedsSpan =
        first &&
        observation.activeTimeUs - first.activeTimeUs > CURSOR_TRAJECTORY_WINDOW_MAX_DURATION_US;
      const discontinuity =
        previous &&
        (observation.activeTimeUs === previous.activeTimeUs ||
          observation.segmentId !== previous.segmentId ||
          observation.observed !== previous.observed ||
          observation.visible !== previous.visible);
      const carry = previous;
      const output = exceedsSpan || discontinuity ? flush() : [];
      if (
        exceedsSpan &&
        !discontinuity &&
        carry &&
        observation.activeTimeUs - carry.activeTimeUs <= CURSOR_TRAJECTORY_WINDOW_MAX_DURATION_US
      ) {
        pending.push(carry);
      }
      pending.push(observation);
      previous = observation;
      if (pending.length === CURSOR_TRAJECTORY_WINDOW_MAX_OBSERVATIONS) {
        output.push(...flush());
        // A retained endpoint links count-bounded windows; it is emitted only once.
        pending.push(observation);
      }
      return output;
    },
    flush,
    pendingCount: () => pending.length,
  };
}
