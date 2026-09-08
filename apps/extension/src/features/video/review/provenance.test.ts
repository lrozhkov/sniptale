import { expect, it } from 'vitest';
import {
  encodeReviewProvenance,
  parseReviewProvenance,
  type ReviewExportProvenance,
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
