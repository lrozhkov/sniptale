import type { VideoProjectCursorTrack, VideoProjectCursorSample } from '../project/types';

/** Observed cursor runs use source intervals, never one marker per high-frequency sample. */
export function buildHistoryCursorRuns(
  track: VideoProjectCursorTrack | null,
  duration: number,
  dwellRanges: readonly { id?: string; startTime: number; endTime: number }[] = []
) {
  const samples = [...(track?.samples ?? [])].sort((a, b) => a.time - b.time);
  const masks = normalizeDwellMasks(dwellRanges, duration);
  const runs: CursorHistoryRun[] = [];
  let maskIndex = 0;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    const next = samples[index + 1];
    while (masks[maskIndex] && masks[maskIndex]!.endTime <= sample.time) maskIndex++;
    const activeMask = masks[maskIndex];
    const dwellEnd =
      activeMask && activeMask.startTime <= sample.time ? activeMask.endTime : sample.time;
    const end = Math.min(duration, next?.time ?? (sample.visible ? dwellEnd : duration));
    if (
      !Number.isFinite(sample.time) ||
      end <= sample.time ||
      sample.time < 0 ||
      sample.time > duration
    )
      continue;
    const intervalMasks = [];
    for (let cursor = maskIndex; masks[cursor] && masks[cursor]!.startTime < end; cursor++)
      intervalMasks.push(masks[cursor]!);
    const cuts = [
      ...new Set([
        sample.time,
        end,
        ...intervalMasks
          .flatMap((range) => [range.startTime, range.endTime])
          .filter((time) => time > sample.time && time < end),
      ]),
    ].sort((a, b) => a - b);
    for (let cut = 0; cut < cuts.length - 1; cut++) {
      const start = cuts[cut]!,
        finish = cuts[cut + 1]!;
      const confirmedDwell = intervalMasks.some(
        (range) => range.startTime <= start && range.endTime >= finish
      );
      const kind = cursorIntervalKind(sample, next, confirmedDwell);
      appendCursorHistoryRun(runs, sample, kind, confirmedDwell, { start, finish, cut });
    }
  }
  if (!samples.length)
    for (const range of masks)
      runs.push({
        id: `dwell:${range.id ?? range.startTime}`,
        sampleIds: [],
        start: range.startTime,
        end: range.endTime,
        visible: true,
        recordedDwell: true,
        kind: 'cursor-idle',
      });
  return runs;
}

type CursorDwellMask = { id?: string; startTime: number; endTime: number };
type CursorHistoryRun = {
  id: string;
  sampleIds: string[];
  start: number;
  end: number;
  visible: boolean;
  recordedDwell: boolean;
  kind: 'cursor' | 'cursor-idle' | 'cursor-gap';
};

function normalizeDwellMasks(
  dwellRanges: readonly CursorDwellMask[],
  duration: number
): CursorDwellMask[] {
  const masks: { id?: string; startTime: number; endTime: number }[] = [];
  for (const range of [...dwellRanges].sort((a, b) => a.startTime - b.startTime)) {
    if (
      !Number.isFinite(range.startTime) ||
      !Number.isFinite(range.endTime) ||
      range.startTime < 0 ||
      range.endTime <= range.startTime
    )
      continue;
    const previous = masks.at(-1);
    if (previous && range.startTime <= previous.endTime)
      previous.endTime = Math.max(previous.endTime, Math.min(duration, range.endTime));
    else masks.push({ ...range, endTime: Math.min(duration, range.endTime) });
  }
  return masks;
}

function cursorIntervalKind(
  sample: VideoProjectCursorSample,
  next: VideoProjectCursorSample | undefined,
  confirmedDwell: boolean
): CursorHistoryRun['kind'] {
  const observed =
    sample.visible && (sample.observation === undefined || sample.observation === 'observed');
  const sameSegment = !next || sample.captureSegment === next.captureSegment;
  const continuous =
    observed &&
    next?.visible &&
    (next.observation === undefined || next.observation === 'observed') &&
    sameSegment;
  const available = continuous || (observed && sameSegment && confirmedDwell);
  const kind = !available
    ? 'cursor-gap'
    : confirmedDwell || (next && sample.x === next.x && sample.y === next.y)
      ? 'cursor-idle'
      : 'cursor';
  return kind;
}

function appendCursorHistoryRun(
  runs: CursorHistoryRun[],
  sample: VideoProjectCursorSample,
  kind: CursorHistoryRun['kind'],
  confirmedDwell: boolean,
  interval: { start: number; finish: number; cut: number }
): void {
  const { start, finish, cut } = interval;
  const previous = runs.at(-1);
  if (
    previous &&
    previous.kind === kind &&
    previous.recordedDwell === (kind === 'cursor-idle' && confirmedDwell) &&
    previous.end === start &&
    kind !== 'cursor-gap'
  ) {
    previous.end = finish;
    if (previous.sampleIds.at(-1) !== sample.id) previous.sampleIds.push(sample.id);
  } else
    runs.push({
      id: cut === 0 ? sample.id : `${sample.id}:${cut}`,
      sampleIds: [sample.id],
      start,
      end: finish,
      visible: kind !== 'cursor-gap',
      recordedDwell: kind === 'cursor-idle' && confirmedDwell,
      kind,
    });
}
