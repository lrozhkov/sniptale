import { expect, it } from 'vitest';
import { exportReviewSubtitles, reviewSubtitleMainOffset } from './subtitle-export';
import { buildReviewTimeMap } from './timeline';
import type { ReviewTextFragment } from './text-types';
import { planReviewPresentationSequence } from './presentation-sequence';
import { createNeutralPresentationSettings } from './advanced/presentation';

const fragment = (patch: Partial<ReviewTextFragment> = {}): ReviewTextFragment => ({
  id: 'first',
  text: 'Привет Łukasz 中文',
  originalText: '',
  start: 1,
  end: 3,
  timeDomain: 'result',
  revision: 0,
  timingRevision: 0,
  alignment: 'manual',
  showInVideo: false,
  ...patch,
});
const output = (
  fragments: ReviewTextFragment[],
  options: Partial<Parameters<typeof exportReviewSubtitles>[0]> = {}
) =>
  exportReviewSubtitles({
    fragments,
    ids: fragments.map((entry) => entry.id),
    segments: buildReviewTimeMap(10, []),
    format: 'vtt',
    language: null,
    onlyShown: false,
    normalizeOverlaps: false,
    mainOffset: 0,
    ...options,
  });

it('exports hidden Unicode text without changing document or voice snapshots', () => {
  const fragments = [fragment()];
  const before = structuredClone(fragments);
  expect(output(fragments)).toMatchObject({
    ok: true,
    count: 1,
    approximate: 0,
    text: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nПривет Łukasz 中文\n\n',
  });
  expect(output(fragments, { onlyShown: true })).toMatchObject({ ok: true, count: 0 });
  expect(fragments).toEqual(before);
});

it('uses the reconciled fractional-rate intro offset and refuses unavailable bookend timing', () => {
  const settings = createNeutralPresentationSettings();
  settings.intro = {
    mode: 'image',
    image: {
      assetId: 'project-asset:intro',
      width: 100,
      height: 100,
      duration: 0.105,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  const sequence = planReviewPresentationSequence({
    settings,
    mainDuration: 10,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 30000, denominator: 1001 },
  });
  if (!sequence.ok) throw new Error('Valid presentation plan refused');
  const mainOffset = reviewSubtitleMainOffset(sequence.plan, true);
  expect(mainOffset).toBe(0.1001);
  expect(mainOffset).not.toBe(settings.intro.image.duration);
  expect(output([fragment()], { mainOffset: mainOffset! })).toMatchObject({
    ok: true,
    text: expect.stringContaining('00:00:01.101 --> 00:00:03.100'),
  });
  expect(reviewSubtitleMainOffset(null, true)).toBeNull();
  expect(reviewSubtitleMainOffset(undefined, false)).toBe(0);
});

it('projects retained source slices through Cut/Speed once and adds exact sequence offset', () => {
  const segments = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 4, end: 6, requestedStart: 4, requestedEnd: 6 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 8,
      requestedStart: 6,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const result = output([fragment({ timeDomain: 'source', start: 2, end: 8 })], {
    segments,
    mainOffset: 0.033367,
    format: 'srt',
  });
  expect(result).toMatchObject({
    ok: true,
    count: 2,
    excluded: 1,
    text: expect.stringContaining('00:00:02,034 --> 00:00:04,033'),
  });
  if (result.ok) expect(result.text).toContain('00:00:04,034 --> 00:00:05,033');
  expect(
    output([fragment({ timeDomain: 'source', start: 4, end: 6 })], { segments })
  ).toMatchObject({ ok: true, count: 0, excluded: 1 });
});

it('keeps result anchors fixed and preserves silence and chronological numbering', () => {
  const result = output(
    [fragment({ id: 'late', start: 7.5, end: 8.125 }), fragment({ start: 0.05, end: 1.2 })],
    { format: 'srt' }
  );
  expect(result).toMatchObject({
    ok: true,
    count: 2,
    overlaps: false,
    text:
      [
        '1\n00:00:00,050 --> 00:00:01,200\nПривет Łukasz 中文',
        '2\n00:00:07,500 --> 00:00:08,125\nПривет Łukasz 中文',
      ].join('\n\n') + '\n\n',
  });
});

it('escapes markup, cue delimiters and CRLF while preserving authored multiline content', () => {
  const result = output([fragment({ text: '<b>& hi -->\r\n\r\nnext\n' })]);
  expect(result).toMatchObject({
    ok: true,
    blankLines: true,
    text: expect.stringContaining('&lt;b&gt;&amp; hi --&gt;\n\u00a0\nnext\n\u00a0\n\n'),
  });
  expect(output([fragment({ text: 'unsafe\0value' })])).toEqual({ ok: false, reason: 'text' });
});

it('filters exact language and selected IDs independently from burn-in visibility', () => {
  const fragments = [
    fragment({ id: 'ru', language: 'ru' }),
    fragment({ id: 'en', language: 'en' }),
    fragment({ id: 'unknown' }),
  ];
  expect(output(fragments, { ids: ['ru', 'unknown'], language: 'en' })).toMatchObject({
    ok: true,
    count: 0,
  });
  expect(output(fragments, { language: '' })).toMatchObject({ ok: true, count: 1 });
  expect(output(fragments, { language: 'ru' })).toMatchObject({ ok: true, count: 1 });
});

it('preserves WebVTT overlaps and warns on default SRT without changing anchors', () => {
  const fragments = [
    fragment({ text: 'A', start: 1, end: 4 }),
    fragment({ id: 'other', text: 'B', start: 2, end: 3, alignment: 'range' }),
  ];
  const before = structuredClone(fragments);
  expect(output(fragments, { normalizeOverlaps: true })).toMatchObject({
    ok: true,
    count: 2,
    overlaps: true,
    normalized: false,
    approximate: 1,
  });
  expect(output(fragments, { format: 'srt' })).toMatchObject({
    ok: true,
    count: 2,
    overlaps: true,
    normalized: false,
  });
  expect(fragments).toEqual(before);
});

it('explicit SRT normalization splits simultaneous payload without losing later or touching cues', () => {
  const fragments = [
    fragment({ text: 'A', start: 1, end: 4 }),
    fragment({ id: 'b', text: 'B', start: 2, end: 3 }),
    fragment({ id: 'c', text: 'C', start: 4, end: 5 }),
  ];
  expect(output(fragments, { format: 'srt', normalizeOverlaps: true })).toMatchObject({
    ok: true,
    count: 4,
    normalized: true,
    text:
      [
        '1\n00:00:01,000 --> 00:00:02,000\nA',
        '2\n00:00:02,000 --> 00:00:03,000\nA\nB',
        '3\n00:00:03,000 --> 00:00:04,000\nA',
        '4\n00:00:04,000 --> 00:00:05,000\nC',
      ].join('\n\n') + '\n\n',
  });
  expect(output([fragment(), fragment({ id: 'next', start: 3, end: 4 })])).toMatchObject({
    ok: true,
    overlaps: false,
  });
});

it('refuses sub-millisecond collapse or unsafe offsets rather than extending or dropping cues', () => {
  expect(output([fragment({ start: 1.0001, end: 1.0002 })])).toEqual({
    ok: false,
    reason: 'timing',
  });
  for (const mainOffset of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(output([fragment()], { mainOffset })).toEqual({ ok: false, reason: 'timing' });
});

it('bounds serialized text, markup expansion and overlap output without silent truncation', () => {
  expect(output([fragment({ text: '&'.repeat(3_300_000) })])).toEqual({
    ok: false,
    reason: 'budget',
  });
  const fragments = Array.from({ length: 150 }, (_, index) =>
    fragment({ id: String(index), start: 1 + index * 0.001, end: 3, text: 'A'.repeat(1500) })
  );
  expect(output(fragments, { format: 'srt', normalizeOverlaps: true })).toEqual({
    ok: false,
    reason: 'budget',
  });
});

it('refuses a retained-range expansion above the cue budget before serializing a partial file', () => {
  const segments = Array.from({ length: 20_001 }, (_, index) => ({
    sourceStart: index * 2,
    sourceEnd: index * 2 + 1,
    resultStart: index,
    resultEnd: index + 1,
    kind: 'keep' as const,
    rate: 1,
  }));
  expect(output([fragment({ timeDomain: 'source', start: 0, end: 40_001 })], { segments })).toEqual(
    { ok: false, reason: 'budget' }
  );
});

it('clips out-of-result tails and omits empty authored text with honest approximate counts', () => {
  expect(
    output([
      fragment({ text: '  \n ' }),
      fragment({ id: 'tail', start: 9, end: 12, alignment: 'segment' }),
    ])
  ).toMatchObject({
    ok: true,
    count: 1,
    excluded: 1,
    approximate: 1,
    text: expect.stringContaining('00:00:09.000 --> 00:00:10.000'),
  });
});

it('omits only unrepresentable positive ranges when montage clipping explicitly permits it', () => {
  const input = [
    fragment({ start: 1.0001, end: 1.0002 }),
    fragment({ id: 'valid', start: 2, end: 3 }),
  ];
  const result = output(input, { omitSubMillisecondRanges: true });
  expect(result).toMatchObject({ ok: true, count: 1, excluded: 1 });
  if (!result.ok) throw new Error(result.reason);
  expect(result.text).toContain('00:00:02.000 --> 00:00:03.000');
  expect(output([input[0]!])).toEqual({ ok: false, reason: 'timing' });
  for (const mainOffset of [NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(output(input, { omitSubMillisecondRanges: true, mainOffset })).toEqual({
      ok: false,
      reason: 'timing',
    });
});
