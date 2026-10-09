import { expect, it } from 'vitest';
import {
  encodeReviewProvenance,
  parseReviewProvenance,
  type ReviewExportProvenance,
  createPresentationReviewProvenance,
} from './provenance';

const provenance: ReviewExportProvenance = {
  format: 'sniptale.video-edit.v1',
  timeUnit: 'seconds',
  revision: 3,
  exportedAt: 1000,
  source: {
    filename: 'original.webm',
    duration: 12,
    width: 160,
    height: 90,
    mimeType: 'video/webm',
    size: 1200,
  },
  edits: [
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
      rate: 2,
      audio: 'mute',
    },
  ],
  audioReencoded: true,
};

it('preserves exact source edits but drops unrelated container fields', () => {
  expect(parseReviewProvenance(encodeReviewProvenance(provenance))).toEqual(provenance);
  expect(parseReviewProvenance(JSON.stringify({ ...provenance, draft: 'private' }))).toEqual(
    provenance
  );
});

it('ignores hostile, future, overlapping and oversized container metadata', () => {
  for (const value of [
    null,
    {},
    '{broken',
    'x'.repeat(1_048_577),
    JSON.stringify({ ...provenance, format: 'future' }),
    JSON.stringify({ ...provenance, revision: -1 }),
    JSON.stringify({
      ...provenance,
      edits: [provenance.edits[0], { ...provenance.edits[0], id: 'overlap' }],
    }),
    JSON.stringify({ ...provenance, edits: [{ ...provenance.edits[0], rate: 7 }] }),
  ])
    expect(parseReviewProvenance(value)).toBeNull();
  expect(() =>
    encodeReviewProvenance({
      ...provenance,
      source: { ...provenance.source, filename: 'x'.repeat(1_048_577) },
    })
  ).toThrow();
});

import { createNeutralPresentationSettings } from './advanced/presentation';
import { planReviewPresentationSequence } from './presentation-sequence';
function presentation() {
  const settings = createNeutralPresentationSettings();
  settings.intro = {
    mode: 'video',
    video: {
      assetId: 'PRIVATE-ASSET',
      source: { duration: 5, width: 160, height: 90, mimeType: 'video/webm', size: 20 },
      trim: { start: 2, end: 2.1 },
      audio: { muted: false, gain: 1 },
      fit: 'contain',
      fillColor: '#000',
      crop: { panX: 0, panY: 0 },
    },
  };
  settings.fadeIn = { enabled: true, duration: 0.4 };
  settings.fadeOut = { enabled: true, duration: 0.4 };
  settings.audioFade = true;
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: 11,
    fragmentOffset: 0.5,
    includeBookends: true,
    rate: { numerator: 30000, denominator: 1001 },
  });
  if (!result.ok) throw new Error('Invalid fixture plan');
  return createPresentationReviewProvenance({
    base: provenance,
    plan: result.plan,
    output: {
      format: 'webm',
      videoCodec: 'vp9',
      width: 160,
      height: 90,
      frameRateMode: 'constant',
    },
    includeBookends: true,
    watermarkBaked: true,
  });
}
it('roundtrips baked v2 with exact cumulative placement, trims and envelopes without resource identities', () => {
  const value = presentation();
  const encoded = encodeReviewProvenance(value);
  expect(parseReviewProvenance(encoded)).toEqual(value);
  expect(value.presentation.segments[0]).toMatchObject({
    startUs: 0,
    endUs: 100100,
    audioStart: 0,
    audioEnd: 4805,
    sourceTrim: { start: 2, end: 2.1 },
  });
  expect(value.presentation.fragmentOffset).toBe(0.5);
  expect(value.presentation.rate).toEqual({ numerator: 30000, denominator: 1001 });
  expect(encoded).not.toContain('PRIVATE-ASSET');
  expect(encoded).not.toContain('assetId');
  const contaminated = {
    ...value,
    privateBytes: 'HIDDEN',
    presentation: { ...value.presentation, assetId: 'HIDDEN' },
  };
  expect(encodeReviewProvenance(contaminated)).not.toContain('HIDDEN');
});

it('rejects changed quantized joins, audio indices, source trim, ordering and main edit duration', () => {
  const value = presentation();
  const intro = value.presentation.segments[0]!;
  const main = value.presentation.segments[1]!;
  for (const segments of [
    [{ ...intro, endUs: intro.endUs + 1 }, main],
    [{ ...intro, audioEnd: intro.audioEnd + 1 }, main],
    [{ ...intro, contentDuration: 0.11 }, main],
    [{ ...intro, sourceTrim: { start: 2, end: 2.2 } }, main],
    [main, intro],
    [intro, main, main],
    [intro],
    [intro, { ...main, contentDuration: 10 }],
  ])
    expect(
      parseReviewProvenance(
        JSON.stringify({ ...value, presentation: { ...value.presentation, segments } })
      )
    ).toBeNull();
});
it('rejects invalid output/rate/fade and future v2 shapes without falling back to v1', () => {
  const value = presentation();
  for (const invalid of [
    { baked: false },
    { includeBookends: false },
    { totalDurationUs: 1 },
    { rate: { numerator: 0, denominator: 1 } },
    { rate: { numerator: 30000, denominator: 0 } },
    { output: { ...value.presentation.output, videoCodec: 'avc' } },
    { output: { ...value.presentation.output, width: 0 } },
    { visualEnvelope: { ...value.presentation.visualEnvelope, span: 1 } },
    { audioEnvelope: { ...value.presentation.audioEnvelope, fadeIn: 999 } },
    { color: '#00000000' },
    { fragmentOffset: -1 },
  ])
    expect(
      parseReviewProvenance(
        JSON.stringify({ ...value, presentation: { ...value.presentation, ...invalid } })
      )
    ).toBeNull();
  expect(
    parseReviewProvenance(JSON.stringify({ ...value, format: 'sniptale.video-edit.v3' }))
  ).toBeNull();
  expect(parseReviewProvenance(JSON.stringify({ ...value, presentation: null }))).toBeNull();
});
it('bounds UTF-8 metadata bytes rather than only JavaScript string length', () => {
  expect(
    parseReviewProvenance(JSON.stringify({ ...provenance, extra: '界'.repeat(400000) }))
  ).toBeNull();
});

it('preserves a valid one-microsecond visual tail with zero rounded audio samples', () => {
  const plan = planReviewPresentationSequence({
    settings: createNeutralPresentationSettings(),
    mainDuration: 0.000001,
    fragmentOffset: 0,
    includeBookends: false,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!plan.ok) throw new Error('Invalid tiny plan');
  const value = createPresentationReviewProvenance({
    base: { ...provenance, edits: [], source: { ...provenance.source, duration: 0.000001 } },
    plan: plan.plan,
    output: { format: 'mp4', videoCodec: 'vp9', width: 160, height: 90, frameRateMode: 'adaptive' },
    includeBookends: false,
    watermarkBaked: false,
  });
  expect(value.presentation.segments[0]).toMatchObject({
    startUs: 0,
    endUs: 1,
    audioStart: 0,
    audioEnd: 0,
  });
  expect(parseReviewProvenance(encodeReviewProvenance(value))).toEqual(value);
});

it('admits historical v2 colored fragments with baked edge fades', () => {
  const legacy = {
    ...provenance,
    format: 'sniptale.video-edit.v2',
    presentation: {
      baked: true,
      includeBookends: false,
      watermarkBaked: false,
      output: {
        format: 'webm',
        videoCodec: 'vp9',
        width: 160,
        height: 90,
        frameRateMode: 'constant',
      },
      rate: { numerator: 1, denominator: 1 },
      totalDurationUs: 11000000,
      fragmentOffset: 0.5,
      color: '#ff0000ff',
      endColor: '#ff0000ff',
      visualEnvelope: { span: 10, fadeIn: 0.4, fadeOut: 0.4 },
      audioEnvelope: { span: 10.999979166666666, fadeIn: 0.4, fadeOut: 0.4 },
      segments: [
        {
          name: 'main',
          kind: 'main',
          startUs: 0,
          endUs: 11000000,
          audioStart: 0,
          audioEnd: 528000,
          contentDuration: 11,
        },
      ],
    },
  };
  expect(parseReviewProvenance(JSON.stringify(legacy))).toEqual(legacy);
});
