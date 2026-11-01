import type {
  CursorTrajectoryRecord,
  CursorTrajectorySample,
  CursorTrajectorySegment,
} from './types';
import { isTrajectoryInteger } from './records';

interface CursorTrajectoryPosition {
  segmentId: number;
  observationSeq: number;
  activeTimeUs: number;
  /** Normalized source-frame coordinates. */
  x: number;
  y: number;
}

function position(
  segment: CursorTrajectorySegment,
  sample: CursorTrajectorySample,
  activeTimeUs: number,
  next?: CursorTrajectorySample
): CursorTrajectoryPosition | null {
  if (!sample.observed || !sample.visible || sample.xQ8 === null || sample.yQ8 === null)
    return null;
  let x = sample.xQ8;
  let y = sample.yQ8;
  if (
    next?.observed &&
    next.visible &&
    next.xQ8 !== null &&
    next.yQ8 !== null &&
    next.activeTimeUs > sample.activeTimeUs
  ) {
    const progress =
      (activeTimeUs - sample.activeTimeUs) / (next.activeTimeUs - sample.activeTimeUs);
    x += (next.xQ8 - x) * progress;
    y += (next.yQ8 - y) * progress;
  }
  return {
    segmentId: segment.segmentId,
    observationSeq: sample.observationSeq,
    activeTimeUs,
    x: x / (segment.width * 256),
    y: y / (segment.height * 256),
  };
}

/** Evaluates validated canonical observations. An unfinished prefix grants no extrapolation. */
export function evaluateCursorTrajectory(
  records: readonly CursorTrajectoryRecord[],
  activeTimeUs: number,
  initialSegment: CursorTrajectorySegment | null = null
): CursorTrajectoryPosition | null {
  if (!isTrajectoryInteger(activeTimeUs)) throw new Error('Invalid cursor trajectory time');
  let active = initialSegment;
  let previous: CursorTrajectorySample | null = null;
  for (const record of records) {
    const time = record.kind === 'gap' ? record.fromTimeUs : record.activeTimeUs;
    if (time > activeTimeUs) {
      if (!active || !previous) return null;
      if (record.kind === 'sample' && record.segmentId === active.segmentId)
        return position(active, previous, activeTimeUs, record);
      if (
        record.kind === 'gap' ||
        (record.kind === 'boundary' && record.segmentId === active.segmentId)
      )
        return position(active, previous, activeTimeUs);
      return null;
    }
    if (record.kind === 'segment') {
      active = record;
      previous = null;
    } else if (record.kind === 'sample') {
      if (record.segmentId !== active?.segmentId) return null;
      previous = record;
    } else {
      active = null;
      previous = null;
    }
  }
  return active && previous?.activeTimeUs === activeTimeUs
    ? position(active, previous, activeTimeUs)
    : null;
}
