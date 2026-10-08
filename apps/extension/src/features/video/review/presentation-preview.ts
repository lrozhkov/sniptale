import type { QuickPreviewPreferences } from '../preview/quick-preferences';
import { resolvePreviewRasterSize } from '../preview/raster';
import type { PresentationSequencePlan } from './presentation-sequence';

/** A disposable window keeps source/effect clocks absolute until the container adapter. */
export interface PresentationPreviewWindow {
  name: 'start' | 'join' | 'end';
  requestedStartUs: number;
  requestedEndUs: number;
  startUs: number;
  endUs: number;
  audioStart: number;
  audioEnd: number;
  frames: readonly PresentationPreviewFrame[];
}
/** Original sample identity is independent of its held/rebased preview interval. */
interface PresentationPreviewFrame {
  tick: number;
  sequenceTimeUs: number;
  sequenceDurationUs: number;
  containerTimeUs: number;
  durationUs: number;
}
/** Raster is bounded independently of canonical output geometry. */
interface PresentationPreviewPlan {
  width: number;
  height: number;
  windows: readonly PresentationPreviewWindow[];
}
function time(plan: PresentationSequencePlan, tick: number): number {
  const n = BigInt(tick) * BigInt(plan.rate.denominator) * 1_000_000n;
  const d = BigInt(plan.rate.numerator);
  return Number((2n * n + d) / (2n * d));
}
function firstTick(plan: PresentationSequencePlan, startUs: number): number {
  let low = 0;
  let high = plan.candidateCount;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (time(plan, middle) < startUs) low = middle + 1;
    else high = middle;
  }
  return low;
}
function selectedTicks(
  plan: PresentationSequencePlan,
  startUs: number,
  endUs: number,
  cap: number
) {
  const n = BigInt(plan.rate.numerator);
  const d = BigInt(plan.rate.denominator);
  const minimumStep = Number((n + 30n * d - 1n) / (30n * d));
  // Near-60 fractional output cannot admit occasional one-tick intervals at a 30fps ceiling.
  const cadenceN = n < BigInt(cap * minimumStep) * d ? BigInt(minimumStep) : n;
  const cadenceD = n < BigInt(cap * minimumStep) * d ? 1n : BigInt(cap) * d;
  const first = firstTick(plan, startUs);
  let index = (BigInt(first) * cadenceD) / cadenceN;
  const ticks: number[] = [];
  while (true) {
    const tick = Number((index * cadenceN) / cadenceD);
    if (tick >= plan.candidateCount || time(plan, tick) >= endUs) break;
    if (tick >= first && ticks.at(-1) !== tick) ticks.push(tick);
    index++;
  }
  if (ticks.length === 0 && first < plan.candidateCount && time(plan, first) < endUs)
    ticks.push(first);
  const last = plan.candidateCount - 1;
  if (endUs === plan.totalDurationUs && last >= first) {
    while (ticks.length && last - ticks.at(-1)! < minimumStep) ticks.pop();
    ticks.push(last);
  }
  return ticks;
}
function window(
  plan: PresentationSequencePlan,
  name: PresentationPreviewWindow['name'],
  requestedStartUs: number,
  requestedEndUs: number,
  cap: number
): PresentationPreviewWindow {
  const ticks = selectedTicks(plan, requestedStartUs, requestedEndUs, cap);
  const startUs = ticks.length ? time(plan, ticks[0]!) : requestedEndUs;
  const endUs = requestedEndUs;
  const frames = ticks.map((tick, index) => {
    const sequenceTimeUs = time(plan, tick);
    return {
      tick,
      sequenceTimeUs,
      sequenceDurationUs: Math.min(time(plan, tick + 1), plan.totalDurationUs) - sequenceTimeUs,
      containerTimeUs: sequenceTimeUs - startUs,
      durationUs:
        (index + 1 < ticks.length ? time(plan, ticks[index + 1]!) : endUs) - sequenceTimeUs,
    };
  });
  return {
    name,
    requestedStartUs,
    requestedEndUs,
    startUs,
    endUs,
    audioStart: Math.round((startUs * 48_000) / 1_000_000),
    audioEnd: Math.round((endUs * 48_000) / 1_000_000),
    frames,
  };
}
/** Selects bounded Start/Join or Join/End views without rebuilding quantized sequence joins. */
export function planPresentationPreview(input: {
  sequence: PresentationSequencePlan;
  edge: 'beginning' | 'ending';
  width: number;
  height: number;
  preferences: Pick<QuickPreviewPreferences, 'frameRate' | 'rasterPreset'>;
}): PresentationPreviewPlan {
  const { sequence, preferences, width, height } = input;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    throw new RangeError('Preview dimensions must be finite and positive.');
  const raster =
    preferences.rasterPreset === 'current'
      ? { width, height }
      : resolvePreviewRasterSize({ width, height }, preferences.rasterPreset);
  const scale = Math.min(
    1,
    640 / raster.width,
    640 / raster.height,
    width / raster.width,
    height / raster.height
  );
  const cap =
    preferences.frameRate === 'current' ? 30 : Math.min(30, Number(preferences.frameRate));
  const total = sequence.totalDurationUs;
  const main = sequence.segments.find((segment) => segment.name === 'main');
  if (!main) throw new Error('Missing main presentation segment.');
  const beginning = input.edge === 'beginning';
  const edgeWindow = window(
    sequence,
    beginning ? 'start' : 'end',
    beginning ? 0 : Math.max(0, total - 3_000_000),
    beginning ? Math.min(total, 3_000_000) : total,
    cap
  );
  const join = beginning ? main.startUs : main.endUs;
  const windows = [edgeWindow];
  if (join > 0 && join < total) {
    const joinWindow = window(
      sequence,
      'join',
      Math.max(0, join - 2_000_000),
      Math.min(total, join + 2_000_000),
      cap
    );
    if (
      joinWindow.requestedStartUs < edgeWindow.requestedStartUs ||
      joinWindow.requestedEndUs > edgeWindow.requestedEndUs
    ) {
      if (beginning) windows.push(joinWindow);
      else windows.unshift(joinWindow);
    }
  }
  return {
    width: Math.max(2, Math.floor((raster.width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((raster.height * scale) / 2) * 2),
    windows,
  };
}
