import {
  parseQuickEditPresentationSettings,
  type QuickEditPresentationSettings,
} from './advanced/presentation';

/** Exact output lattice; Current adapters must preserve fractional source-rate identity. */
export interface PresentationRate {
  numerator: number;
  denominator: number;
}
/** Input seconds remain on the existing main result clock, after cuts and speed changes. */
export interface PresentationSequenceInput {
  settings: QuickEditPresentationSettings;
  mainDuration: number;
  fragmentOffset: number;
  includeBookends: boolean;
  rate: PresentationRate;
}
type SegmentName = 'intro' | 'main' | 'outro';
type Content =
  | { kind: 'image'; assetId: string }
  | { kind: 'video'; assetId: string; sourceStart: number; sourceEnd: number }
  | { kind: 'main'; fragmentOffset: number };
type Segment = {
  name: SegmentName;
  content: Content;
  contentDuration: number;
  startUs: number;
  endUs: number;
  startTick: number;
  endTick: number;
  audioStart: number;
  audioEnd: number;
};
type Envelope = { span: number; fadeIn: number; fadeOut: number };
/** Derived placement only; authored trim and main clocks are never retimed. */
export interface PresentationSequencePlan {
  rate: PresentationRate;
  totalDurationUs: number;
  candidateCount: number;
  segments: readonly Segment[];
  color: string;
  visualEnvelope: Envelope;
  audioEnvelope: Envelope;
  visualFeedback: 'single-frame' | null;
}
/** Source ranges are half-open; hold-last asks the decoder for its final valid frame, not an epsilon. */
export interface PresentationCandidate {
  tick: number;
  timestampUs: number;
  durationUs: number;
  segment: SegmentName;
  segmentLocalTimeUs: number;
  retainEndpoint: boolean;
  mapping:
    | { kind: 'image'; assetId: string }
    | { kind: 'video'; assetId: string; range: { start: number; end: number }; holdLast: boolean }
    | {
        kind: 'main';
        mainLocalTime: number;
        globalMainTime: number;
        range: { start: number; end: number };
        holdLast: boolean;
      };
}
/** Explicit admission failure; no segment is silently dropped or extended to repair the plan. */
export type PresentationPlanFailure = {
  ok: false;
  reason: 'invalid-input' | 'unrepresentable-segment';
  segment?: SegmentName;
};
type Rational = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}
function rational(n: bigint, d: bigint): Rational {
  const divisor = gcd(n < 0n ? -n : n, d);
  return { n: n / divisor, d: d / divisor };
}
// The shortest decimal representation is the exact meaning of a supplied JS number.
function decimal(value: number): Rational {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = mantissa!.split('.');
  const power = Number(exponent) - fraction.length;
  const digits = BigInt(whole! + fraction);
  return power >= 0
    ? rational(digits * 10n ** BigInt(power), 1n)
    : rational(digits, 10n ** BigInt(-power));
}
function add(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}
function subtract(a: Rational, b: Rational): Rational {
  return add(a, { n: -b.n, d: b.d });
}
function rounded(n: bigint, d: bigint): number {
  return Number((2n * n + d) / (2n * d));
}
function seconds(value: Rational): number {
  return Number(value.n) / Number(value.d);
}
function tickTime(tick: number, rate: PresentationRate) {
  return rounded(BigInt(tick) * BigInt(rate.denominator) * 1_000_000n, BigInt(rate.numerator));
}
function audioIndex(timeUs: number) {
  return rounded(BigInt(timeUs) * 48_000n, 1_000_000n);
}
function normalizedRate(rate: PresentationRate): PresentationRate | null {
  if (
    !Number.isSafeInteger(rate.numerator) ||
    !Number.isSafeInteger(rate.denominator) ||
    rate.numerator <= 0 ||
    rate.denominator <= 0
  )
    return null;
  const n = BigInt(rate.numerator),
    d = BigInt(rate.denominator);
  // Matches the existing media-index supported range without rounding fractional rates.
  if (n < d || n > 120n * d) return null;
  const divisor = gcd(n, d);
  return { numerator: Number(n / divisor), denominator: Number(d / divisor) };
}
function envelope(
  settings: QuickEditPresentationSettings,
  span: number,
  enabled: boolean
): Envelope {
  const fadeIn = enabled && settings.fadeIn.enabled ? settings.fadeIn.duration : 0;
  const fadeOut = enabled && settings.fadeOut.enabled ? settings.fadeOut.duration : 0;
  const scale = fadeIn + fadeOut > span ? span / (fadeIn + fadeOut) : 1;
  return { span, fadeIn: fadeIn * scale, fadeOut: fadeOut * scale };
}
function rawSegments(input: PresentationSequenceInput, settings: QuickEditPresentationSettings) {
  const result: { name: SegmentName; content: Content; duration: Rational }[] = [];
  const append = (name: 'intro' | 'outro') => {
    const slot = settings[name];
    if (!input.includeBookends || slot.mode === 'none') return;
    if (slot.mode === 'image')
      result.push({
        name,
        content: { kind: 'image', assetId: slot.image.assetId },
        duration: decimal(slot.image.duration),
      });
    else
      result.push({
        name,
        content: {
          kind: 'video',
          assetId: slot.video.assetId,
          sourceStart: slot.video.trim.start,
          sourceEnd: slot.video.trim.end,
        },
        duration: subtract(decimal(slot.video.trim.end), decimal(slot.video.trim.start)),
      });
  };
  append('intro');
  result.push({
    name: 'main',
    content: { kind: 'main', fragmentOffset: input.fragmentOffset },
    duration: decimal(input.mainDuration),
  });
  append('outro');
  return result;
}

/** Quantizes authored segment joins once while retaining exact total duration. */
function quantizeSegments(raw: ReturnType<typeof rawSegments>, rate: PresentationRate) {
  let cumulative = rational(0n, 1n);
  const ends = raw.map((segment) => {
    cumulative = add(cumulative, segment.duration);
    return rounded(cumulative.n * BigInt(rate.numerator), cumulative.d * BigInt(rate.denominator));
  });
  const totalDurationUs = rounded(cumulative.n * 1_000_000n, cumulative.d);
  if (totalDurationUs <= 0)
    return {
      ok: false as const,
      reason: 'unrepresentable-segment' as const,
      segment: raw[0]!.name,
    };
  // round(k*D*1e6/N) < T iff k < (2T-1)*N/(2D*1e6).
  const countN = BigInt(2 * totalDurationUs - 1) * BigInt(rate.numerator);
  const countD = 2n * BigInt(rate.denominator) * 1_000_000n;
  const candidateCount = Number((countN + countD - 1n) / countD);
  const segments: Segment[] = [];
  let startTick = 0,
    startUs = 0;
  for (const [index, segment] of raw.entries()) {
    const last = index === raw.length - 1;
    const endTick = last ? candidateCount : ends[index]!;
    const endUs = last ? totalDurationUs : tickTime(endTick, rate);
    if (!last && endUs >= totalDurationUs)
      return {
        ok: false as const,
        reason: 'unrepresentable-segment' as const,
        segment: raw[index + 1]!.name,
      };
    if (endTick <= startTick || endUs <= startUs)
      return {
        ok: false as const,
        reason: 'unrepresentable-segment' as const,
        segment: segment.name,
      };
    segments.push({
      name: segment.name,
      content: segment.content,
      contentDuration: seconds(segment.duration),
      startUs,
      endUs,
      startTick,
      endTick,
      audioStart: audioIndex(startUs),
      audioEnd: audioIndex(endUs),
    });
    startTick = endTick;
    startUs = endUs;
  }
  return { ok: true as const, segments, totalDurationUs, candidateCount };
}

/** Plans cumulative half-up joins and a lazy global lattice with a possibly partial final sample. */
export function planReviewPresentationSequence(
  input: PresentationSequenceInput
): { ok: true; plan: PresentationSequencePlan } | PresentationPlanFailure {
  const settings = parseQuickEditPresentationSettings(input.settings);
  const rate = normalizedRate(input.rate);
  if (
    !settings ||
    !rate ||
    !Number.isFinite(input.mainDuration) ||
    input.mainDuration <= 0 ||
    input.mainDuration > 86_400 ||
    !Number.isFinite(input.fragmentOffset) ||
    input.fragmentOffset < 0 ||
    input.fragmentOffset + input.mainDuration > 86_400 ||
    typeof input.includeBookends !== 'boolean'
  )
    return { ok: false, reason: 'invalid-input' };
  const quantized = quantizeSegments(rawSegments(input, settings), rate);
  if (!quantized.ok) return quantized;
  const { segments, totalDurationUs, candidateCount } = quantized;
  return {
    ok: true,
    plan: {
      rate,
      totalDurationUs,
      candidateCount,
      segments,
      color: settings.color,
      visualEnvelope: envelope(
        settings,
        tickTime(candidateCount - 1, rate) / 1_000_000,
        candidateCount > 1
      ),
      audioEnvelope: envelope(
        settings,
        Math.max(0, (audioIndex(totalDurationUs) - 1) / 48_000),
        settings.audioFade
      ),
      visualFeedback: candidateCount === 1 ? 'single-frame' : null,
    },
  };
}
function candidateMapping(
  segment: Segment,
  localUs: number,
  durationUs: number
): PresentationCandidate['mapping'] {
  const content = segment.content;
  if (content.kind === 'image') return content;
  const local = localUs / 1_000_000;
  const start = Math.min(local, segment.contentDuration);
  const end = Math.min((localUs + durationUs) / 1_000_000, segment.contentDuration);
  const holdLast = local >= segment.contentDuration;
  if (content.kind === 'video')
    return {
      kind: 'video',
      assetId: content.assetId,
      range: {
        start: Math.min(content.sourceEnd, content.sourceStart + start),
        end: Math.min(content.sourceEnd, content.sourceStart + end),
      },
      holdLast,
    };
  return {
    kind: 'main',
    mainLocalTime: start,
    globalMainTime: content.fragmentOffset + start,
    range: { start, end },
    holdLast,
  };
}

/** Constant working memory regardless of recording duration; joins belong to the next segment. */
export function* iteratePresentationCandidates(
  plan: PresentationSequencePlan,
  range: { startTick: number; endTick: number } = { startTick: 0, endTick: plan.candidateCount }
): Iterable<PresentationCandidate> {
  if (
    !Number.isSafeInteger(range.startTick) ||
    !Number.isSafeInteger(range.endTick) ||
    range.startTick < 0 ||
    range.endTick < range.startTick ||
    range.endTick > plan.candidateCount
  )
    throw new Error('Invalid presentation candidate range.');
  for (const segment of plan.segments) {
    for (
      let tick = Math.max(segment.startTick, range.startTick);
      tick < Math.min(segment.endTick, range.endTick);
      tick++
    ) {
      const timestampUs = tickTime(tick, plan.rate);
      const durationUs =
        Math.min(tickTime(tick + 1, plan.rate), plan.totalDurationUs) - timestampUs;
      const segmentLocalTimeUs = timestampUs - segment.startUs;
      yield {
        tick,
        timestampUs,
        durationUs,
        segment: segment.name,
        segmentLocalTimeUs,
        retainEndpoint: tick === 0 || tick === plan.candidateCount - 1,
        mapping: candidateMapping(segment, segmentLocalTimeUs, durationUs),
      };
    }
  }
}
/** Last complete main composition on the output lattice, also for sparse preview windows. */
export function presentationMainHoldTime(plan: PresentationSequencePlan): number {
  const segment = plan.segments.find((entry) => entry.name === 'main');
  if (!segment) throw new Error('Missing main presentation segment.');
  let low = segment.startTick;
  let high = segment.endTick;
  // Use the same rounded microsecond predicate as candidateMapping, not source frame cadence.
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const local = (tickTime(middle, plan.rate) - segment.startUs) / 1_000_000;
    if (local < segment.contentDuration) low = middle + 1;
    else high = middle;
  }
  if (low === segment.startTick) throw new Error('Missing valid main presentation frame.');
  return (tickTime(low - 1, plan.rate) - segment.startUs) / 1_000_000;
}

function opacity(envelope: Envelope, position: number) {
  if (Number.isNaN(position)) throw new Error('Invalid presentation envelope position.');
  const time = Math.max(0, Math.min(envelope.span, position));
  const incoming = envelope.fadeIn > 0 ? Math.max(0, 1 - time / envelope.fadeIn) : 0;
  const outgoing =
    envelope.fadeOut > 0 ? Math.max(0, 1 - (envelope.span - time) / envelope.fadeOut) : 0;
  return Math.max(incoming, outgoing);
}
/** Overlay applies after complete composition; queries beyond emitted endpoints clamp to them. */
export function presentationColorOpacity(
  plan: PresentationSequencePlan,
  timestampUs: number
): number {
  return opacity(plan.visualEnvelope, timestampUs / 1_000_000);
}
/** Gain is evaluated on absolute 48kHz output sample indices, independently of video endpoints. */
export function presentationAudioGain(plan: PresentationSequencePlan, sampleIndex: number): number {
  return 1 - opacity(plan.audioEnvelope, sampleIndex / 48_000);
}

/** Main preview shares the sequence envelope, including bookends and fragment-origin clocks. */
export function presentationMainColorOpacity(
  plan: PresentationSequencePlan,
  globalMainTime: number
): number {
  if (!Number.isFinite(globalMainTime)) throw new Error('Invalid main presentation time.');
  const main = plan.segments.find((segment) => segment.name === 'main');
  if (!main || main.content.kind !== 'main') throw new Error('Missing main presentation segment.');
  const timestampUs = main.startUs + (globalMainTime - main.content.fragmentOffset) * 1_000_000;
  const lastTimestampUs = tickTime(plan.candidateCount - 1, plan.rate);
  return presentationColorOpacity(plan, Math.max(0, Math.min(lastTimestampUs, timestampUs)));
}
