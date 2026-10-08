import { describe, expect, it } from 'vitest';
import {
  createNewWorkspacePresentationSettings,
  type QuickEditPresentationSettings,
} from './advanced/presentation';
import {
  iteratePresentationCandidates,
  planReviewPresentationSequence,
  presentationAudioGain,
  presentationColorOpacity,
  presentationMainHoldTime,
  presentationMainColorOpacity,
  type PresentationRate,
  type PresentationSequenceInput,
} from './presentation-sequence';

function slot(duration: number): QuickEditPresentationSettings['intro'] {
  return {
    mode: 'video',
    video: {
      assetId: 'project-asset:test',
      source: { duration: 10, width: 100, height: 100, mimeType: 'video/webm', size: 100 },
      trim: { start: 0, end: duration },
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
      audio: { muted: false, gain: 1 },
    },
  };
}
function input(
  durations: number[],
  rate: PresentationRate = { numerator: 30, denominator: 1 }
): PresentationSequenceInput {
  const settings = createNewWorkspacePresentationSettings();
  if (durations.length === 3) {
    settings.intro = slot(durations[0]!);
    settings.outro = slot(durations[2]!);
  }
  return {
    settings,
    mainDuration: durations.length === 3 ? durations[1]! : durations[0]!,
    fragmentOffset: 0,
    includeBookends: true,
    rate,
  };
}
function plan(request: PresentationSequenceInput) {
  const result = planReviewPresentationSequence(request);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.plan;
}
const ntsc = { numerator: 30000, denominator: 1001 };

describe('presentation sequence', () => {
  it.each([
    { durations: [0.105, 0.1, 0.105], rate: ntsc },
    { durations: [0.101, 0.051, 0.2], rate: { numerator: 60000, denominator: 1001 } },
    { durations: [0.1, 0.005, 0.1], rate: { numerator: 120, denominator: 1 } },
    { durations: [0.305], rate: { numerator: 30, denominator: 1 } },
  ])(
    'resolves the held composition independently of rendering order: $durations',
    ({ durations, rate }) => {
      const request = input(durations, rate);
      request.fragmentOffset = 17;
      const sequence = plan(request);
      const heldTime = presentationMainHoldTime(sequence);
      const valid = [...iteratePresentationCandidates(sequence)].filter(
        (candidate) => candidate.mapping.kind === 'main' && !candidate.mapping.holdLast
      );
      const last = valid.at(-1)!;
      expect(last.mapping.kind).toBe('main');
      if (last.mapping.kind !== 'main') throw new Error('Expected main frame.');
      expect(heldTime).toBe(last.mapping.mainLocalTime);
      expect(heldTime).toBeLessThan(request.mainDuration);
      expect(last.mapping.globalMainTime).toBe(17 + heldTime);
    }
  );

  it.each([
    {
      rate: ntsc,
      d: [0.1, 0.1, 0.1],
      ticks: [3, 6],
      bounds: [0, 100100, 200200, 300000],
      audio: [0, 4805, 9610, 14400],
      last: 266933,
      count: 9,
    },
    {
      rate: { numerator: 60000, denominator: 1001 },
      d: [0.1, 0.1, 0.1],
      ticks: [6, 12],
      bounds: [0, 100100, 200200, 300000],
      audio: [0, 4805, 9610, 14400],
      last: 283617,
      count: 18,
    },
    {
      rate: { numerator: 30, denominator: 1 },
      d: [0.1, 0.1, 0.105],
      ticks: [3, 6],
      bounds: [0, 100000, 200000, 305000],
      audio: [0, 4800, 9600, 14640],
      last: 300000,
      count: 10,
    },
    {
      rate: ntsc,
      d: [0.1, 1.25, 0.2],
      ticks: [3, 40],
      bounds: [0, 100100, 1334667, 1550000],
      audio: [0, 4805, 64064, 74400],
      last: 1534867,
      count: 47,
    },
  ])('matches reconciled cumulative table %#', ({ rate, d, ticks, bounds, audio, last, count }) => {
    const result = plan(input(d, rate));
    const frames = [...iteratePresentationCandidates(result)];
    expect([0, ...result.segments.map((s) => s.endUs)]).toEqual(bounds);
    expect([0, ...result.segments.map((s) => s.audioEnd)]).toEqual(audio);
    expect(result.segments.slice(0, -1).map((s) => s.endTick)).toEqual(ticks);
    expect(result.candidateCount).toBe(count);
    expect(frames).toHaveLength(count);
    expect(frames.at(-1)?.timestampUs).toBe(last);
    expect(frames.at(-1)!.timestampUs + frames.at(-1)!.durationUs).toBe(result.totalDurationUs);
    frames.forEach((frame, index) => {
      expect(frame.durationUs).toBeGreaterThan(0);
      if (index)
        expect(frames[index - 1]!.timestampUs + frames[index - 1]!.durationUs).toBe(
          frame.timestampUs
        );
    });
    expect(frames.filter((frame) => frame.retainEndpoint).map((frame) => frame.tick)).toEqual([
      0,
      count - 1,
    ]);
  });
  it.each([
    { d: [0.001, 0.1, 0.1], segment: 'intro' },
    { d: [0.01, 0.01, 0.01], segment: 'main' },
    { d: [0.1, 0.109, 0.001], segment: 'outro' },
  ])('rejects unrepresentable $segment without dropping it', ({ d, segment }) => {
    expect(planReviewPresentationSequence(input(d, { numerator: 60, denominator: 1 }))).toEqual({
      ok: false,
      reason: 'unrepresentable-segment',
      segment,
    });
  });
  it('rejects positive duration that rounds to zero', () => {
    expect(planReviewPresentationSequence(input([1e-8]))).toEqual({
      ok: false,
      reason: 'unrepresentable-segment',
      segment: 'main',
    });
  });
  it.each([NaN, Infinity, 0, -1, 86401])('rejects invalid main duration %s', (duration) => {
    expect(planReviewPresentationSequence(input([duration]))).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });
  it.each([
    { numerator: 0, denominator: 1 },
    { numerator: 30, denominator: 0 },
    { numerator: 121, denominator: 1 },
    { numerator: 1, denominator: 2 },
    { numerator: Infinity, denominator: 1 },
    { numerator: 29.97, denominator: 1 },
  ])('rejects invalid lattice %#', (rate) => {
    expect(planReviewPresentationSequence(input([1], rate))).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });
  it('normalizes equivalent rational rates', () => {
    expect(plan(input([1], { numerator: 60000, denominator: 2002 }))).toEqual(
      plan(input([1], ntsc))
    );
  });
  it.each([
    { duration: 0.049999999999999996, tick: 1 },
    { duration: 0.05, tick: 2 },
    { duration: 0.05000000000000001, tick: 2 },
  ])('rounds decimal half ticks upward without epsilon %#', ({ duration, tick }) => {
    expect(plan(input([duration, 1, 0.1])).segments[0]?.endTick).toBe(tick);
  });
  it('rounds the cumulative total once and subtracts decimal trim endpoints exactly', () => {
    const request = input([0.1000004, 0.1000004, 0.1000004]);
    expect(plan(request).totalDurationUs).toBe(300001);
    request.settings.intro = slot(0.3);
    if (request.settings.intro.mode === 'video') request.settings.intro.video.trim.start = 0.1;
    expect(plan(request).segments[0]?.contentDuration).toBe(0.2);
  });
  it('assigns joins to the next segment and keeps main fragment clocks independent', () => {
    const request = input([0.1, 1.25, 0.2], ntsc);
    request.fragmentOffset = 12;
    const result = plan(request);
    const frames = [...iteratePresentationCandidates(result)];
    expect(frames[3]).toMatchObject({
      timestampUs: 100100,
      segment: 'main',
      segmentLocalTimeUs: 0,
      mapping: { kind: 'main', mainLocalTime: 0, globalMainTime: 12 },
    });
    expect(frames[40]?.segment).toBe('outro');
    const omitted = plan({ ...request, includeBookends: false });
    expect(omitted.totalDurationUs).toBe(1250000);
    expect(omitted.segments).toHaveLength(1);
    expect(presentationColorOpacity(omitted, 0)).toBe(1);
    expect(request.settings.intro.mode).toBe('video');
  });
  it('clips video ranges and exposes an exclusive-end hold without inventing decode time', () => {
    const request = input([0.025, 0.05, 0.1]);
    request.settings.intro = slot(2.025);
    if (request.settings.intro.mode === 'video') request.settings.intro.video.trim.start = 2;
    const frames = [...iteratePresentationCandidates(plan(request))];
    expect(frames[0]?.mapping).toEqual({
      kind: 'video',
      assetId: 'project-asset:test',
      range: { start: 2, end: 2.025 },
      holdLast: false,
    });
    // Main starts early after quantization; its last interval is clipped to content.
    const holdRequest = input([0.041, 0.024, 0.1], { numerator: 60, denominator: 1 });
    const held = [...iteratePresentationCandidates(plan(holdRequest))].filter(
      (f) => f.segment === 'main'
    );
    expect(held.at(-1)?.mapping).toEqual({
      kind: 'main',
      mainLocalTime: 0.016667,
      globalMainTime: 0.016667,
      range: { start: 0.016667, end: 0.024 },
      holdLast: false,
    });
  });
  it('holds the final outro frame when cumulative placement extends beyond its content', () => {
    const request = input([0.041]);
    request.settings.outro = slot(0.03);
    const result = plan(request);
    const frames = [...iteratePresentationCandidates(result)];
    expect(result.totalDurationUs).toBe(71000);
    expect(frames.at(-1)?.mapping).toEqual({
      kind: 'video',
      assetId: 'project-asset:test',
      range: { start: 0.03, end: 0.03 },
      holdLast: true,
    });
    expect(result.segments.at(-1)?.contentDuration).toBe(0.03);
  });
  it('clips decimal source endpoints without floating-point overshoot', () => {
    const request = input([0.1]);
    request.settings.outro = slot(0.3);
    if (request.settings.outro.mode === 'video') request.settings.outro.video.trim.start = 0.1;
    const last = [...iteratePresentationCandidates(plan(request))].at(-1)!;
    expect(last.mapping).toMatchObject({ kind: 'video', range: { end: 0.3 } });
  });
  it('counts candidates by rounded timestamps and preserves tiny partial final intervals', () => {
    const result = plan(input([0.0333335]));
    expect(result.totalDurationUs).toBe(33334);
    expect([...iteratePresentationCandidates(result)].map((frame) => frame.durationUs)).toEqual([
      33333, 1,
    ]);
    const before = plan(input([0.0333334]));
    expect(before.candidateCount).toBe(1);
  });
  it.each([-1, Infinity, NaN, 86400])('rejects invalid fragment clock %s', (fragmentOffset) => {
    expect(planReviewPresentationSequence({ ...input([1]), fragmentOffset })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });
  it('emits images without a source clock', () => {
    const request = input([0.1, 0.1, 0.1]);
    request.settings.intro = {
      mode: 'image',
      image: {
        assetId: 'image',
        width: 100,
        height: 100,
        duration: 0.1,
        fit: 'cover',
        fillColor: '#000000ff',
        crop: { panX: 1, panY: -1 },
      },
    };
    expect([...iteratePresentationCandidates(plan(request))][0]?.mapping).toEqual({
      kind: 'image',
      assetId: 'image',
    });
  });
  it('iterates a bounded prefix of a day-long sequence', () => {
    const result = plan(input([86400], { numerator: 120, denominator: 1 }));
    const iterator = iteratePresentationCandidates(result)[Symbol.iterator]();
    expect(result.candidateCount).toBe(10368000);
    expect(iterator.next().value?.tick).toBe(0);
    expect(iterator.next().value?.tick).toBe(1);
  });
});

describe('presentation envelopes', () => {
  it.each([
    { rate: ntsc, duration: 0.1334665 },
    { rate: { numerator: 60000, denominator: 1001 }, duration: 0.1418085 },
  ])('constrains fades to emitted NTSC endpoints %#', ({ rate, duration }) => {
    const result = plan(input([0.1, 0.1, 0.1], rate));
    expect(result.visualEnvelope.fadeIn).toBe(duration);
    expect(result.visualEnvelope.fadeOut).toBe(duration);
    expect(presentationColorOpacity(result, 0)).toBe(1);
    expect(presentationColorOpacity(result, result.visualEnvelope.span * 1e6)).toBe(1);
    expect(presentationColorOpacity(result, result.visualEnvelope.span * 0.5e6)).toBe(0);
    expect(presentationColorOpacity(result, -Infinity)).toBe(1);
    expect(presentationColorOpacity(result, Infinity)).toBe(1);
  });
  it('disables one-frame visual fades but preserves the independent audio sample envelope', () => {
    const request = input([0.02]);
    request.settings.audioFade = true;
    const result = plan(request);
    expect(result.visualFeedback).toBe('single-frame');
    expect(result.visualEnvelope.fadeIn).toBe(0);
    expect(presentationColorOpacity(result, 0)).toBe(0);
    expect(presentationAudioGain(result, 0)).toBe(0);
    expect(presentationAudioGain(result, 959)).toBe(0);
    expect(presentationAudioGain(result, 479)).toBeGreaterThan(0.99);
  });
  it('scales unequal edges proportionally and honors disabled edges and audio off', () => {
    const request = input([0.3]);
    request.settings.fadeIn.duration = 0.2;
    request.settings.fadeOut.duration = 0.4;
    let result = plan(request);
    expect(result.visualEnvelope.fadeOut).toBe(result.visualEnvelope.fadeIn * 2);
    expect(presentationAudioGain(result, 0)).toBe(1);
    request.settings.fadeOut.enabled = false;
    request.settings.audioFade = true;
    result = plan(request);
    expect(presentationColorOpacity(result, Infinity)).toBe(0);
    expect(presentationAudioGain(result, Infinity)).toBe(1);
    request.settings.fadeIn.enabled = false;
    result = plan(request);
    expect(presentationColorOpacity(result, 0)).toBe(0);
    expect(presentationAudioGain(result, 0)).toBe(1);
    expect(() => presentationColorOpacity(result, NaN)).toThrow('Invalid');
  });
});

describe('main preview outer color', () => {
  it.each([{ numerator: 30, denominator: 1 }, ntsc, { numerator: 60, denominator: 1 }])(
    'uses main fragment offset and clamps to emitted endpoints at %j',
    (rate) => {
      const request = input([2], rate);
      request.fragmentOffset = 7;
      const sequence = plan(request);
      expect(presentationMainColorOpacity(sequence, 7)).toBe(1);
      expect(presentationMainColorOpacity(sequence, 7.2)).toBeCloseTo(0.5);
      const last = [...iteratePresentationCandidates(sequence)].at(-1)!;
      expect(presentationMainColorOpacity(sequence, 9)).toBe(
        presentationColorOpacity(sequence, last.timestampUs)
      );
      expect(presentationMainColorOpacity(sequence, -10)).toBe(1);
    }
  );
  it('keeps intro/outro outer fades outside the main scene boundaries', () => {
    const sequence = plan(input([1, 2, 1]));
    expect(presentationMainColorOpacity(sequence, 0)).toBe(0);
    expect(presentationMainColorOpacity(sequence, 2)).toBe(0);
    expect(() => presentationMainColorOpacity(sequence, NaN)).toThrow();
  });
});

describe('bounded presentation candidate lookup', () => {
  it('preserves complete original candidate geometry across joins and fractional endpoints', () => {
    const sequence = plan(input([0.5, 2.105, 0.5], ntsc));
    const all = [...iteratePresentationCandidates(sequence)];
    for (const candidate of all)
      expect([
        ...iteratePresentationCandidates(sequence, {
          startTick: candidate.tick,
          endTick: candidate.tick + 1,
        }),
      ]).toEqual([candidate]);
    expect([...iteratePresentationCandidates(sequence, { startTick: 4, endTick: 4 })]).toEqual([]);
  });
  it('directly yields the final tick of an hour without scanning earlier candidates', () => {
    const sequence = plan(input([3600], ntsc));
    const iterator = iteratePresentationCandidates(sequence, {
      startTick: sequence.candidateCount - 1,
      endTick: sequence.candidateCount,
    });
    const frames = [...iterator];
    expect(frames).toHaveLength(1);
    expect(frames[0]!.retainEndpoint).toBe(true);
    expect(frames[0]!.timestampUs + frames[0]!.durationUs).toBe(sequence.totalDurationUs);
  });
  it.each([
    { startTick: -1, endTick: 1 },
    { startTick: 1, endTick: 0 },
    { startTick: 0.5, endTick: 1 },
    { startTick: 0, endTick: Infinity },
    { startTick: 0, endTick: 10000 },
  ])('rejects invalid range %j', (range) => {
    expect(() => [...iteratePresentationCandidates(plan(input([1])), range)]).toThrow(
      'Invalid presentation candidate range'
    );
  });
});
