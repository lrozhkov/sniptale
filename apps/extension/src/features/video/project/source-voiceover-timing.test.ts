import { expect, it } from 'vitest';
import { buildReviewTimeMap } from '../review/timeline';
import { parseReviewAudioClip } from '../review/audio-clip-validation';
import { anchorReviewVoiceoverAtSource, projectReviewVoiceover } from '../review/voiceover-edits';
import {
  editSourceVoiceoverTiming,
  getSourceVoiceoverTimingBounds,
} from './source-voiceover-timing';
import type { VideoProjectSourceVoiceoverDocument } from './source-voiceover';

function fixture(): VideoProjectSourceVoiceoverDocument {
  return {
    id: 'doc',
    trackId: 'track',
    enabled: false,
    binding: { kind: 'source', assetId: 'source', sourceInstanceId: 'instance' },
    reference: buildReviewTimeMap(20, []),
    take: {
      id: 'take',
      assetId: 'audio',
      timelineStart: 3,
      sourceOffset: 2,
      duration: 4,
      volume: 0.8,
      muted: true,
      tempo: 1,
      fadeIn: 1.5,
      fadeOut: 2,
      sourceAnchor: [
        { start: 3, end: 5, offset: 0, duration: 2 },
        { start: 8, end: 10, offset: 2, duration: 2 },
      ],
      transcript: { version: 1, phrases: [], replacements: [] },
      textSnapshot: {
        kind: 'microphone',
        textId: 'text',
        revision: 0,
        timingRevision: 0,
        text: 'Script',
        start: 3,
        end: 10,
        timeDomain: 'source',
      },
    },
  };
}

it('moves the complete source geometry without reflowing gaps or changing native data', () => {
  const doc = fixture();
  const before = structuredClone(doc);
  const next = editSourceVoiceoverTiming(doc, { kind: 'position', time: 5 }, 12)!;
  expect(next).toEqual({
    ...doc.take,
    timelineStart: 5,
    sourceAnchor: [
      { start: 5, end: 7, offset: 0, duration: 2 },
      { start: 10, end: 12, offset: 2, duration: 2 },
    ],
  });
  expect(parseReviewAudioClip(next)).toEqual(next);
  expect(doc).toEqual(before);
});

it('trims native samples across a source gap and retains whole-take metadata and fades', () => {
  const doc = fixture();
  const next = editSourceVoiceoverTiming(doc, { kind: 'start', time: 4.5 }, 12)!;
  expect(next).toMatchObject({
    timelineStart: 8.5,
    sourceOffset: 4.5,
    duration: 1.5,
    fadeIn: 1.5,
    fadeOut: 1.5,
    sourceAnchor: [{ start: 8.5, end: 10, offset: 0, duration: 1.5 }],
  });
  expect(next.transcript).toBe(doc.take.transcript);
  expect(next.textSnapshot).toBe(doc.take.textSnapshot);
  expect(next.tempo).toBe(doc.take.tempo);
  expect(parseReviewAudioClip(next)).toEqual(next);
  const right = editSourceVoiceoverTiming(doc, { kind: 'end', time: 5 }, 12)!;
  expect(right).toMatchObject({
    sourceOffset: 2,
    duration: 3,
    sourceAnchor: [
      { start: 3, end: 5, offset: 0, duration: 2 },
      { start: 8, end: 9, offset: 2, duration: 1 },
    ],
  });
});

it('extends file edges only inside source-zero and known native asset bounds', () => {
  const doc = fixture();
  const left = editSourceVoiceoverTiming(doc, { kind: 'start', time: 0 }, 12)!;
  expect(left).toMatchObject({ timelineStart: 1, sourceOffset: 0, duration: 6 });
  const right = editSourceVoiceoverTiming(doc, { kind: 'end', time: 12 }, 12)!;
  expect(right.sourceOffset + right.duration).toBe(12);
  expect(editSourceVoiceoverTiming(doc, { kind: 'end', time: 12.01 }, 12)).toBeNull();
  expect(editSourceVoiceoverTiming(doc, { kind: 'end', time: 6.01 }, null)).toBeNull();
  doc.take.timelineStart = 0.5;
  doc.take.sourceAnchor![0]!.start = 0.5;
  doc.take.sourceAnchor![0]!.end = 2.5;
  expect(getSourceVoiceoverTimingBounds(doc, 12).startMin).toBe(1.5);
  expect(editSourceVoiceoverTiming(doc, { kind: 'start', time: 1.49 }, 12)).toBeNull();
  expect(editSourceVoiceoverTiming(doc, { kind: 'start', time: 1.5 }, 12)?.timelineStart).toBe(0);
});

it.each([0.5, 1, 2, 4])(
  'keeps take tempo %s independent through capture Speed and native trim',
  (tempo) => {
    const doc = fixture();
    doc.reference = buildReviewTimeMap(20, [
      {
        id: 'speed',
        kind: 'speed',
        start: 2,
        end: 6,
        requestedStart: 2,
        requestedEnd: 6,
        rate: 2,
        audio: 'speed',
      },
    ]);
    const { sourceAnchor: _anchors, ...samples } = doc.take;
    doc.take = anchorReviewVoiceoverAtSource(
      { ...samples, timelineStart: 3, tempo },
      doc.reference
    );
    const next = editSourceVoiceoverTiming(doc, { kind: 'start', time: 3 }, 12)!;
    expect(next).toMatchObject({ sourceOffset: 3, duration: 3, tempo });
    expect(parseReviewAudioClip(next)).toEqual(next);
    const projected = projectReviewVoiceover([next], doc.reference);
    expect(projected.every((slice) => slice.playbackRate === tempo)).toBe(true);
    expect(projected.reduce((sum, slice) => sum + slice.duration, 0)).toBeCloseTo(3 / tempo, 7);
  }
);

it.each([true, false])('trims dormant samples without waking them; anchored=%s', (anchored) => {
  const doc = fixture();
  doc.take.dormant = true;
  if (!anchored) delete doc.take.sourceAnchor;
  const next = editSourceVoiceoverTiming(doc, { kind: 'start', time: 3 }, 12)!;
  expect(next).toMatchObject({ sourceOffset: 3, duration: 3, dormant: true });
  expect(parseReviewAudioClip(next)).toEqual(next);
  const placed = editSourceVoiceoverTiming(
    { ...doc, take: next },
    { kind: 'position', time: next.timelineStart },
    12
  )!;
  expect(placed.dormant).toBe(false);
  expect(placed.sourceAnchor).toBeDefined();
  expect(placed.sourceOffset).toBe(3);
  expect(placed.duration).toBe(3);
  expect(doc.enabled).toBe(false);
  expect(doc.take.dormant).toBe(true);
});

it('preserves identity for no-op edits and refuses invalid timing without mutation', () => {
  const doc = fixture();
  for (const [kind, time] of [
    ['position', 3],
    ['start', 2],
    ['end', 6],
  ] as const)
    expect(editSourceVoiceoverTiming(doc, { kind, time }, 12)).toBe(doc.take);
  for (const [kind, time] of [
    ['position', -1],
    ['position', 21],
    ['start', 6],
    ['end', 2],
    ['start', NaN],
    ['end', Infinity],
  ] as const)
    expect(editSourceVoiceoverTiming(doc, { kind, time }, 12)).toBeNull();
  expect(editSourceVoiceoverTiming(doc, { kind: 'start', time: 3 }, NaN)).toBeNull();
  expect(getSourceVoiceoverTimingBounds(doc, null).endMax).toBe(6);
});

it.each([0, 0.37, 1.333, 3.3])(
  'admits both minimum-duration edges at native offset %s',
  (sourceOffset) => {
    const doc = fixture();
    doc.take = {
      ...doc.take,
      sourceOffset,
      duration: 4.123,
      sourceAnchor: [{ start: 3, end: 7.123, offset: 0, duration: 4.123 }],
    };
    const bounds = getSourceVoiceoverTimingBounds(doc, 12);
    for (const edit of [
      { kind: 'start', time: bounds.startMax },
      { kind: 'end', time: bounds.endMin },
    ] as const) {
      const next = editSourceVoiceoverTiming(doc, edit, 12);
      expect(next).not.toBeNull();
      expect(next!.duration).toBeCloseTo(0.001, 7);
      expect(parseReviewAudioClip(next)).toEqual(next);
    }
  }
);
